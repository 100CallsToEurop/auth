/**
 * Настройки Яндекс OAuth2: endpoint-ы, scope и адрес профиля.
 * Логика входа — в yandex.provider.ts.
 */
export const yandexConfig = {
  slug: 'yandex',
  displayName: 'Яндекс',
  defaultScopes: 'login:info login:email',

  endpoints: {
    authorizationURL: 'https://oauth.yandex.ru/authorize',
    tokenURL: 'https://oauth.yandex.ru/token',
  },

  userInfoUrl: 'https://login.yandex.ru/info?format=json',
} as const;
