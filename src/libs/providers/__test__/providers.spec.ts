import { ConfigService } from '@nestjs/config';
import type { ExternalAccountResolver } from '../common/contracts/external-account-resolver.js';
import { AuthentikProvider } from '../implementations/authentik/authentik.provider.js';
import { YandexProvider } from '../implementations/yandex/yandex.provider.js';
import { GitHubProvider } from '../implementations/github/github.provider.js';
import { InvisionProvider } from '../implementations/invision/invision.provider.js';

function createConfigServiceMock(values: Record<string, string> = {}) {
  return {
    get: vi.fn((key: string) => values[key]),
    getOrThrow: vi.fn((key: string) => values[key]),
  };
}

describe('AuthentikProvider', () => {
  it('normalizes OIDC claims into an external profile', () => {
    expect(
      AuthentikProvider.normalizeProfile({
        sub: 'sub-1',
        email: 'User@Example.com',
        name: { givenName: 'Иван', familyName: 'Иванов' },
        displayName: 'Иванов Иван',
      }),
    ).toEqual({
      sub: 'sub-1',
      email: 'user@example.com',
      firstName: 'Иван',
      lastName: 'Иванов',
      displayName: 'Иванов Иван',
      emailVerified: true,
    });
  });

  it('takes email from the emails array', () => {
    expect(
      AuthentikProvider.normalizeProfile({
        id: 'sub-2',
        emails: [{ value: 'From@Array.com' }],
      }).email,
    ).toBe('from@array.com');
  });

  it('respects an explicit email_verified=false', () => {
    expect(
      AuthentikProvider.normalizeProfile({
        sub: 'sub-3',
        email: 'unverified@example.com',
        email_verified: false,
      }).emailVerified,
    ).toBe(false);
  });

  it('trusts the provider when the email_verified claim is absent', () => {
    expect(
      AuthentikProvider.normalizeProfile({
        sub: 'sub-4',
        email: 'user@example.com',
      }).emailVerified,
    ).toBe(true);
  });

  it('builds the RP-initiated logout URL from the issuer', () => {
    const linker = {} as ExternalAccountResolver;
    const provider = new AuthentikProvider(
      createConfigServiceMock({
        AUTHENTIK_ISSUER: 'http://idp/application/o/app/',
      }) as unknown as ConfigService,
      linker,
    );

    const url = new URL(provider.logoutUrl('https://app.example.com/')!);
    expect(url.origin + url.pathname).toBe(
      'http://idp/application/o/app/end-session/',
    );
    expect(url.searchParams.get('post_logout_redirect_uri')).toBe(
      'https://app.example.com/',
    );
  });

  it('has no logout URL without an issuer', () => {
    const linker = {} as ExternalAccountResolver;
    const provider = new AuthentikProvider(
      createConfigServiceMock({}) as unknown as ConfigService,
      linker,
    );
    expect(provider.logoutUrl()).toBeNull();
  });
});

describe('YandexProvider', () => {
  it('normalizes /login.yandex.ru/info payload', () => {
    expect(
      YandexProvider.normalizeProfile({
        id: 12345,
        default_email: 'User@Yandex.ru',
        first_name: 'Иван',
        last_name: 'Иванов',
        display_name: 'Иван Иванов',
      }),
    ).toEqual({
      sub: '12345',
      email: 'user@yandex.ru',
      firstName: 'Иван',
      lastName: 'Иванов',
      displayName: 'Иван Иванов',
      emailVerified: true,
    });
  });

  it('falls back to the emails array', () => {
    expect(
      YandexProvider.normalizeProfile({ id: 1, emails: ['Fallback@ya.ru'] })
        .email,
    ).toBe('fallback@ya.ru');
  });
});

describe('GitHubProvider', () => {
  it('builds the default callback from PUBLIC_API_URL', async () => {
    const linker = {} as ExternalAccountResolver;
    const provider = new GitHubProvider(
      createConfigServiceMock({
        PUBLIC_API_URL: 'https://auth.example.com/',
      }) as unknown as ConfigService,
      linker,
    );
    // @ts-expect-error проверка protected-метода
    expect(provider.callbackUrl()).toBe(
      'https://auth.example.com/api/auth/github/callback',
    );
  });

  it('enables PKCE (S256) by default', () => {
    const linker = {} as ExternalAccountResolver;
    const provider = new GitHubProvider(
      createConfigServiceMock({
        GITHUB_CLIENT_ID: 'id',
        GITHUB_CLIENT_SECRET: 'secret',
      }) as unknown as ConfigService,
      linker,
    );
    const strategy = provider.createStrategy() as unknown as {
      _pkceMethod?: string;
    };
    expect(strategy._pkceMethod).toBe('S256');
  });

  it('allows disabling PKCE for providers that do not support it', () => {
    const linker = {} as ExternalAccountResolver;
    const provider = new GitHubProvider(
      createConfigServiceMock({
        GITHUB_CLIENT_ID: 'id',
        GITHUB_CLIENT_SECRET: 'secret',
        GITHUB_PKCE: 'false',
      }) as unknown as ConfigService,
      linker,
    );
    const strategy = provider.createStrategy() as unknown as {
      _pkceMethod?: string;
    };
    expect(strategy._pkceMethod).toBeUndefined();
  });
});

describe('InvisionProvider', () => {
  it('normalizes /api/core/me payload', () => {
    expect(
      InvisionProvider.normalizeProfile({
        id: 42,
        name: 'Иван Иванов',
        email: 'User@Community.example',
      }),
    ).toEqual({
      sub: '42',
      email: 'user@community.example',
      firstName: null,
      lastName: null,
      displayName: 'Иван Иванов',
      emailVerified: true,
    });
  });

  it('derives authorize/token endpoints from the base URL', () => {
    const linker = {} as ExternalAccountResolver;
    const provider = new InvisionProvider(
      createConfigServiceMock({
        INVISION_BASE_URL: 'https://community.example.com/',
      }) as unknown as ConfigService,
      linker,
    );
    // @ts-expect-error проверка protected-геттера
    expect(provider.endpoints).toEqual({
      authorizationURL: 'https://community.example.com/oauth/authorize',
      tokenURL: 'https://community.example.com/oauth/token',
    });
  });
});
