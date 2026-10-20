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
 * Слаг провайдера берётся из :provider маршрута либо выводится из пути
 * (алиасы /auth/oidc/<slug>). Guard — обычный @Injectable класс с DI, чтобы
 * Nest корректно его инстанцировал.
 */
@Injectable()
export class ExternalAuthGuard implements CanActivate {
  protected readonly mode: 'login' | 'sync' = 'login';

  private readonly logger = new Logger(ExternalAuthGuard.name);

  constructor(protected readonly registry: ExternalProvidersRegistry) {}

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
      if (!(request as { user?: unknown }).user) {
        throw new UnauthorizedException();
      }
      (request.session as { externalSync?: boolean }).externalSync = true;
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
   * Слаг провайдера: сначала :provider из маршрута, иначе последний сегмент
   * пути до /callback (для алиасов вида /auth/oidc/authentik[/callback]).
   */
  private resolveSlug(request: Request): string | null {
    const param = request.params?.provider;
    if (typeof param === 'string' && param.length > 0) {
      return param;
    }
    const path = (request.path || request.originalUrl || '').split('?')[0];
    const segments = path.split('/').filter(Boolean);
    // /api/auth/oidc/<slug>[/callback]
    const markerIndex = segments.lastIndexOf('oidc');
    const candidate =
      markerIndex >= 0 ? segments[markerIndex + 1] : undefined;
    if (candidate && candidate !== 'callback') {
      return candidate;
    }
    return null;
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
}
