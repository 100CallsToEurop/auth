/**
 * Настройки GitHub OAuth2: endpoint-ы, scope, заголовки и адреса API.
 * Логика входа — в github.provider.ts.
 */
export const githubConfig = {
  slug: 'github',
  displayName: 'GitHub',
  defaultScopes: 'read:user user:email',

  endpoints: {
    authorizationURL: 'https://github.com/login/oauth/authorize',
    tokenURL: 'https://github.com/login/oauth/access_token',
  },

  // Accept: json — GitHub иначе отдаёт токен в form-encoded;
  // User-Agent обязателен для api.github.com.
  headers: {
    Accept: 'application/json',
    'User-Agent': 'auth-backend',
  },

  api: {
    userUrl: 'https://api.github.com/user',
    emailsUrl: 'https://api.github.com/user/emails',
    userAgent: 'auth-backend',
    version: '2022-11-28',
  },
} as const;
