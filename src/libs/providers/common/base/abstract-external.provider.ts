import type { Strategy as PassportStrategy } from 'passport';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import type { ExternalAccountResolver } from '../contracts/external-account-resolver.js';
import type { ExternalProvider } from '../contracts/external-provider.js';

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
    protected readonly linker: ExternalAccountResolver,
  ) {}

  abstract createStrategy(): PassportStrategy;

  protected configKey(suffix: string): string {
    return `${this.slug.toUpperCase()}_${suffix}`;
  }

  protected callbackUrl(): string {
    return (
      this.configService.get<string>(this.configKey('CALLBACK_URL')) ??
      `${this.publicApiUrl()}/api/auth/${this.slug}/callback`
    );
  }

  protected publicApiUrl(): string {
    return (
      this.configService.get<string>('PUBLIC_API_URL')?.replace(/\/+$/, '') ??
      'http://localhost:3000'
    );
  }

  protected scope(defaultScopes: string): string {
    return (
      this.configService.get<string>(this.configKey('SCOPES')) ?? defaultScopes
    );
  }

  /**
   * Метод PKCE для провайдеров, которые его поддерживают.
   * По умолчанию — S256 (защита от перехвата кода авторизации).
   * Отключается переменной <SLUG>_PKCE=false, если провайдер не поддерживает
   * расширение (например, старая версия OAuth2-сервера сообщества).
   */
  protected pkceMethod(): 'S256' | 'plain' | undefined {
    const raw = this.configService.get<string>(this.configKey('PKCE'));
    if (raw !== undefined && raw !== '') {
      const value = raw.trim().toLowerCase();
      if (value === 'false' || value === '0' || value === 'off') {
        return undefined;
      }
      if (value === 'plain') {
        return 'plain';
      }
      return 'S256';
    }
    return 'S256';
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
   * Явная привязка провайдера к уже авторизованному пользователю.
   * userId берётся из одноразового флага externalLink в сессии (его ставит
   * guard на маршруте /link).
   */
  protected linkFn() {
    const linker = this.linker;
    const slug = this.slug;
    return (userId: string, profile: unknown) =>
      linker.linkProvider(slug, profile as never, userId);
  }

  /**
   * Выбор режима на callback: если в сессии стоит одноразовый флаг
   * externalLink (userId) — привязываем провайдер этому пользователю;
   * если externalSync (userId) — обновляем профиль; иначе — обычный
   * вход/создание аккаунта.
   */
  protected dispatchFn() {
    const verify = this.verifyFn();
    const sync = this.syncFn();
    const link = this.linkFn();
    return (req: Request, profile: unknown) => {
      const session = req.session as
        { externalSync?: string; externalLink?: string } | undefined;
      const action = req as Request & {
        externalAction?: 'link' | 'sync';
      };
      const linkUserId = session?.externalLink;
      if (linkUserId) {
        // флаг одноразовый — не влияем на последующие входы
        delete session?.externalLink;
        // callback вернёт браузер на фронтенд, а не JSON с токеном
        action.externalAction = 'link';
        return link(linkUserId, profile);
      }
      const syncUserId = session?.externalSync;
      if (syncUserId) {
        // флаг одноразовый — не влияем на последующие входы
        delete session?.externalSync;
        action.externalAction = 'sync';
        return sync(syncUserId, profile);
      }
      return verify(profile);
    };
  }
}
