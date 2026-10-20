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
 * Единый guard внешнего входа: стратегия выбирается по :provider (Registry),
 * неизвестный или выключенный провайдер → 404. Редирект к провайдеру
 * (challenge) обрабатывается явно через callback passport.
 *
 * На маршруте синхронизации (/link) guard требует залогиненного пользователя
 * и ставит в сессию одноразовый флаг externalSync — по нему verify-колбэк
 * обновляет профиль текущего аккаунта, а не выполняет вход.
 */
@Injectable()
export class ExternalAuthGuard implements CanActivate {
  protected readonly providerSlug: string | null = null;
  protected readonly mode: 'login' | 'sync' = 'login';

  private readonly logger = new Logger(ExternalAuthGuard.name);

  constructor(private readonly registry: ExternalProvidersRegistry) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const slug =
      typeof request.params?.provider === 'string'
        ? request.params.provider
        : this.providerSlug;
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

    // На callback (в пути есть /callback) пользователь обязан быть получен
    // от стратегии: если passport вернул challenge — это повторный старт, а
    // не завершение входа, и продолжать в контроллер нельзя.
    const isCallback = /\/callback\/?$/.test(request.path);

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
            // verify-колбэк стратегии уже вернул User из линковки
            (request as { user?: unknown }).user = user;
            resolve(true);
            return;
          }

          const challenge = (info as { challenge?: string } | undefined)
            ?.challenge;
          if (!isCallback && typeof challenge === 'string') {
            // первый шаг: passport-стратегия редиректит к провайдеру
            response.redirect(challenge);
            resolve(true);
            return;
          }

          this.logFailure(slug, info);
          reject(
            new UnauthorizedException(
              typeof info === 'string'
                ? info
                : info
                  ? JSON.stringify(info)
                  : 'External authentication failed',
            ),
          );
        },
      )(request, response);
    });
  }

  private logFailure(slug: string, reason: unknown): void {
    const text =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : reason
            ? JSON.stringify(reason)
            : 'unknown';
    this.logger.warn(`External provider "${slug}" authentication failed: ${text}`);
  }

  /** Factory Method: guard с зафиксированным провайдером (алиасы маршрутов). */
  static forProvider(slug: string): typeof ExternalAuthGuard {
    return class extends ExternalAuthGuard {
      protected override readonly providerSlug = slug;
    };
  }

  /** Factory Method: guard синхронизации профиля (только для залогиненных). */
  static forProviderSync(slug: string): typeof ExternalAuthGuard {
    return class extends ExternalAuthGuard {
      protected override readonly providerSlug = slug;
      protected override readonly mode = 'sync' as const;
    };
  }

  /** То же, но провайдер берётся из :provider маршрута. */
  static forProviderSyncParam(): typeof ExternalAuthGuard {
    return class extends ExternalAuthGuard {
      protected override readonly mode = 'sync' as const;
    };
  }
}
