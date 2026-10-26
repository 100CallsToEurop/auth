import {
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import passport from 'passport';
import { ExternalProvidersRegistry } from '../../providers/common/registry/external-providers.registry.js';
import { TokensService } from '../../../features/session/application/tokens.service.js';
import { RefreshTokensRepository } from '../../../features/session/infrastructure/repository/refresh-tokens.repository.js';
import { REFRESH_COOKIE } from '../../consts/session.constants.js';

type ExternalGuardMode = 'login' | 'sync' | 'link';

type GuardSession = {
  externalSync?: string;
  externalLink?: string;
};

/**
 * Guard входа через внешнего провайдера.
 *
 * Старт (нет code/state в query): passport сам отдаёт 302 на провайдера —
 * вызываем стратегию БЕЗ кастомного callback (passport.openidconnect
 * редиректит через strategy.redirect → res.end()), canActivate возвращает
 * false, т.к. ответ уже отправлен.
 *
 * Callback (есть code/state): вызываем с callback, требуем user, кладём его
 * в req.user для контроллера.
 *
 * Слаг провайдера берётся из :provider маршрута. Guard — обычный @Injectable
 * класс с DI, чтобы Nest корректно его инстанцировал.
 */
@Injectable()
export class ExternalAuthGuard implements CanActivate {
  protected readonly mode: ExternalGuardMode = 'login';

  /**
   * Провайдер, жёстко закреплённый за маршрутом (например, /auth/github).
   * Если не задан — slug берётся из :provider (универсальный /auth/external).
   */
  protected readonly fixedSlug: string | null = null;

  private readonly logger = new Logger(ExternalAuthGuard.name);

  constructor(
    protected readonly registry: ExternalProvidersRegistry,
    private readonly tokensService: TokensService,
    private readonly refreshTokensRepository: RefreshTokensRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const slug = this.fixedSlug ?? this.resolveSlug(request);
    if (!slug) {
      throw new NotFoundException('External provider is not specified');
    }
    this.registry.require(slug);

    if (this.mode !== 'login') {
      // Навигация браузера не шлёт Authorization — синхронизацию/привязку
      // запускает только владелец сессии, поэтому пользователя восстанавливаем
      // из refresh-cookie.
      const user = await this.authenticateCookieRequest(request);
      // Запоминаем id пользователя: callback придёт без заголовков, и по
      // этому флагу (одноразовому) действие применится к нужному аккаунту.
      const session = request.session as GuardSession | undefined;
      if (!session) {
        throw new UnauthorizedException();
      }
      if (this.mode === 'sync') {
        session.externalSync = user.id;
      } else {
        session.externalLink = user.id;
      }
    }

    const isCallback =
      typeof request.query?.code === 'string' ||
      typeof request.query?.state === 'string';

    // Старт: passport сам редиректит к провайдеру.
    if (!isCallback) {
      await this.startFlow(slug, request, response);
      return false;
    }

    // Callback: получаем пользователя от стратегии.
    return new Promise<boolean>((resolve, reject) => {
      passport.authenticate(
        slug,
        {},
        (err: unknown, user: unknown, info: unknown) => {
          if (err) {
            this.logFailure(slug, err);
            reject(
              err instanceof HttpException
                ? err
                : new UnauthorizedException(
                    err instanceof Error
                      ? err.message
                      : 'Authentication failed',
                  ),
            );
            return;
          }

          if (user) {
            (request as { user?: unknown }).user = user;
            resolve(true);
            return;
          }

          // Детали ошибки провайдера не отдаём клиенту (в ответе могут быть
          // внутренние коды), но пишем в лог.
          const reason = this.describe(info);
          this.logger.warn(
            `External provider "${slug}" callback failed: ${reason || 'no user'}`,
          );
          reject(new UnauthorizedException('External authentication failed'));
        },
      )(request, response);
    });
  }

  /**
   * Редирект к провайдеру: passport сам завершает ответ (302). Ожидаем либо
   * завершения ответа, либо ошибку — иначе промис «зависает» на каждом входе.
   */
  private async startFlow(
    slug: string,
    request: Request,
    response: Response,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (error?: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        if (error) {
          reject(
            error instanceof HttpException
              ? error
              : new UnauthorizedException('External authentication failed'),
          );
          return;
        }
        resolve();
      };

      response.once('finish', () => settle());
      response.once('close', () => settle());

      passport.authenticate(slug)(request, response, (err?: unknown) => {
        if (err) {
          this.logFailure(slug, err);
          settle(err);
          return;
        }
        // Стратегия не смогла начать редирект.
        settle(new UnauthorizedException('External authentication failed'));
      });
    });
  }

  /**
   * Аутентификация запроса по refresh-cookie. Токен проверяется не только по
   * подписи, но и по БД: отозванный (logout) токен не должен авторизовывать
   * синхронизацию или привязку.
   */
  private async authenticateCookieRequest(
    request: Request,
  ): Promise<{ id: string }> {
    const existing = (request as { user?: { id?: string } }).user;
    if (existing?.id) {
      return { id: existing.id };
    }

    const raw = request.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!raw) {
      throw new UnauthorizedException();
    }

    const payload = await this.tokensService.verifyRefresh(raw);
    if (!payload) {
      throw new UnauthorizedException();
    }

    const active = await this.refreshTokensRepository.isActive(
      payload.jti,
      payload.sub,
    );
    if (!active) {
      throw new UnauthorizedException();
    }

    (request as { user?: unknown }).user = { id: payload.sub, email: '' };
    return { id: payload.sub };
  }

  /** Слаг провайдера из маршрута (:provider). */
  private resolveSlug(request: Request): string | null {
    const param = request.params?.provider;
    return typeof param === 'string' && param.length > 0 ? param : null;
  }

  private describe(info: unknown): string {
    if (!info) {
      return '';
    }
    if (typeof info === 'string') {
      return info;
    }
    if (info instanceof Error) {
      return info.message;
    }
    try {
      return JSON.stringify(info);
    } catch {
      return '[unserializable info]';
    }
  }

  private logFailure(slug: string, reason: unknown): void {
    this.logger.warn(
      `External provider "${slug}" authentication failed: ${this.describe(reason) || 'unknown'}`,
    );
  }
}

/** Guard синхронизации профиля: только для залогиненного пользователя. */
@Injectable()
export class ExternalSyncGuard extends ExternalAuthGuard {
  protected override readonly mode: ExternalGuardMode = 'sync';
}

/** Guard явной привязки провайдера: только для залогиненного пользователя. */
@Injectable()
export class ExternalLinkGuard extends ExternalAuthGuard {
  protected override readonly mode: ExternalGuardMode = 'link';
}
