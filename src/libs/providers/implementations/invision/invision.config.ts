/**
 * Настройки Invision Community OAuth2: env-ключ адреса сообщества, пути
 * OAuth2 и API профиля. Логика входа — в invision.provider.ts.
 */
export const invisionConfig = {
  slug: 'invision',
  displayName: 'Invision Community',
  defaultScopes: '',

  /** Адрес сообщества, например https://community.example.com. */
  baseUrlEnv: 'INVISION_BASE_URL',

  paths: {
    authorize: '/oauth/authorize',
    token: '/oauth/token',
    profile: '/api/core/me',
  },
} as const;
