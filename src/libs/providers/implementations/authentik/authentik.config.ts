/**
 * Настройки Authentik (OIDC): имена env-переменных, пути endpoint-ов и
 * значения по умолчанию. Логика входа — в authentik.provider.ts.
 */
export const authentikConfig = {
  slug: 'authentik',
  displayName: 'Authentik',
  defaultScopes: 'openid email profile',

  env: {
    issuer: 'AUTHENTIK_ISSUER',
    clientId: 'AUTHENTIK_CLIENT_ID',
    clientSecret: 'AUTHENTIK_CLIENT_SECRET',
    authorizationUrl: 'AUTHENTIK_AUTHORIZATION_URL',
    tokenUrl: 'AUTHENTIK_TOKEN_URL',
    userInfoUrl: 'AUTHENTIK_USERINFO_URL',
  },

  /** Пути относительно issuer, если отдельные URL не заданы в env. */
  paths: {
    authorize: 'authorize/',
    token: 'token/',
    userInfo: 'userinfo/',
    endSession: 'end-session/',
  },

  /** Путь discovery-документа относительно issuer. */
  discoveryPath: '.well-known/openid-configuration',
} as const;
