import type { Strategy as PassportStrategy } from 'passport';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { ExternalAccountLinker } from '../../application/external-account-linker.js';
import type { ExternalProvider } from './external-provider.js';

/**
 * Базовый класс провайдеров (Template Method): общая работа с конфигом
 * (env-ключи выводятся из slug: AUTHENTIK_*, YANDEX_*, GITHUB_*), URL
 * колбэка и имя стратегии в passport.
 */
export abstract class AbstractExternalProvider implements ExternalProvider {
  abstract readonly slug: string;
  abstract readonly displayName: string;

  constructor(
    protected readonly configService: ConfigService,
    protected readonly linker: ExternalAccountLinker,
  ) {}

  abstract createStrategy(): PassportStrategy;

  protected configKey(suffix: string): string {
    return `${this.slug.toUpperCase()}_${suffix}`;
  }

  /** Провайдер включён: клиентские ключи заданы в окружении. */
  configured(): boolean {
    return Boolean(
      this.configService.get<string>(this.configKey('CLIENT_ID')) &&
        this.configService.get<string>(this.configKey('CLIENT_SECRET')),
    );
  }

  protected callbackUrl(): string {
    return (
      this.configService.get<string>(this.configKey('CALLBACK_URL')) ??
      `${this.publicApiUrl()}/api/auth/external/${this.slug}/callback`
    );
  }

  protected publicApiUrl(): string {
    return (
      this.configService
        .get<string>('PUBLIC_API_URL')
        ?.replace(/\/+$/, '') ?? 'http://localhost:3000'
    );
  }

  protected scope(defaultScopes: string): string {
    return (
      this.configService.get<string>(this.configKey('SCOPES')) ??
      defaultScopes
    );
  }

  /** Обычный вход: ищет/создаёт аккаунт и привязывает провайдера. */
  protected verifyFn() {
    const linker = this.linker;
    const slug = this.slug;
    return (profile: unknown) => linker.link(slug, profile as never);
  }

  /**
   * Синхронизация: обновляет профиль текущего (залогиненного) пользователя.
   * userId приходит из одноразового флага externalSync в сессии (его ставит
   * guard на маршруте /sync), т.к. callback идёт без заголовков авторизации.
   */
  protected syncFn() {
    const linker = this.linker;
    const slug = this.slug;
    return (userId: string, profile: unknown) =>
      linker.syncProvider(slug, profile as never, userId);
  }

  /**
   * Выбор режима на callback: если в сессии стоит одноразовый флаг
   * externalSync (userId), профиль обновляется у этого пользователя, иначе —
   * обычный вход/создание аккаунта.
   */
  protected dispatchFn() {
    const verify = this.verifyFn();
    const sync = this.syncFn();
    return (req: Request, profile: unknown) => {
      const session = req.session as
        | { externalSync?: string }
        | undefined;
      const syncUserId = session?.externalSync;
      if (syncUserId) {
        // флаг одноразовый — не влияем на последующие входы
        delete session?.externalSync;
        return sync(syncUserId, profile);
      }
      return verify(profile);
    };
  }
}
