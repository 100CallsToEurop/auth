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
import { ExternalProvidersRegistry } from '../infrastructure/external-providers.registry.js';
import { TokensService } from '../../session/application/tokens.service.js';
import { REFRESH_COOKIE } from '../../session/application/session.constants.js';

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
  protected readonly mode: 'login' | 'sync' = 'login';

  private readonly logger = new Logger(ExternalAuthGuard.name);

  constructor(
    protected readonly registry: ExternalProvidersRegistry,
    private readonly tokensService?: TokensService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const slug = this.resolveSlug(request);
    if (!slug) {
      throw new NotFoundException('External provider is not specified');
    }
    this.registry.require(slug);

    if (this.mode === 'sync') {
      // Навигация браузера не шлёт Authorization — синхронизацию запускает
      // <a href>, поэтому пользователя восстанавливаем из refresh-cookie.
      const user = await this.authenticateSyncRequest(request);
      // Запоминаем id пользователя: callback придёт без заголовков, и по
      // этому флагу (одноразовому) обновим профиль нужного аккаунта.
      (request.session as { externalSync?: string }).externalSync = user.id;
    }

    const isCallback =
      typeof request.query?.code === 'string' ||
      typeof request.query?.state === 'string';

    // Старт: passport сам редиректит к провайдеру.
    if (!isCallback) {
      await new Promise<void>((resolve) => {
        passport.authenticate(slug)(request, response, () => resolve());
      });
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
                    err instanceof Error ? err.message : 'Authentication failed',
                  ),
            );
            return;
          }

          if (user) {
            (request as { user?: unknown }).user = user;
            resolve(true);
            return;
          }

          const reason = this.describe(info);
          this.logger.warn(
            `External provider "${slug}" callback failed: ${reason || 'no user'}`,
          );
          reject(
            new UnauthorizedException(reason || 'External authentication failed'),
          );
        },
      )(request, response);
    });
  }

  /**
   * Аутентификация запроса синхронизации. Браузерный переход по ссылке не
   * несёт Authorization, поэтому если req.user не установлен глобальным
   * JwtAuthGuard — восстанавливаем пользователя из refresh-cookie.
   */
  private async authenticateSyncRequest(
    request: Request,
  ): Promise<{ id: string }> {
    const existing = (request as { user?: { id?: string } }).user;
    if (existing?.id) {
      return { id: existing.id };
    }

    const raw = request.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!raw || !this.tokensService) {
      throw new UnauthorizedException();
    }

    const payload = await this.tokensService.verifyRefresh(raw);
    if (!payload) {
      throw new UnauthorizedException();
    }

    const user = { id: payload.sub };
    (request as { user?: unknown }).user = { id: payload.sub, email: '' };
    return user;
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
  protected override readonly mode = 'sync' as const;

  constructor(
    registry: ExternalProvidersRegistry,
    tokensService: TokensService,
  ) {
    super(registry, tokensService);
  }
}
