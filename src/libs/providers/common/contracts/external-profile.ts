/**
 * Нормализованный профиль пользователя внешнего провайдера (Authentik,
 * Яндекс, GitHub). Адаптеры провайдеров приводят свои ответы (OIDC-claims,
 * /login.yandex.ru/info, /api.github.com/user) к этому виду.
 */
export interface ExternalProfile {
  /** Стабильный идентификатор пользователя у провайдера (OIDC sub). */
  sub: string;
  email: string;
  /**
   * Провайдер подтвердил владение этой почтой (claim email_verified, verified
   * в /user/emails и т.п.). Без подтверждения почту нельзя использовать для
   * слияния с существующим аккаунтом — иначе можно было бы войти в чужой
   * аккаунт, просто заведя его на стороне провайдера.
   */
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
}
