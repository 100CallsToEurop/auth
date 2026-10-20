/**
 * Нормализованный профиль пользователя внешнего провайдера (Authentik,
 * Яндекс, GitHub). Адаптеры провайдеров приводят свои ответы (OIDC-claims,
 * /login.yandex.ru/info, /api.github.com/user) к этому виду.
 */
export interface ExternalProfile {
  /** Стабильный идентификатор пользователя у провайдера (OIDC sub). */
  sub: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
}
