import { ConfigService } from '@nestjs/config';
import { ExternalAccountLinker } from '../../application/external-account-linker.js';
import { AuthentikProvider } from './authentik.provider.js';
import { YandexProvider } from './yandex.provider.js';
import { GitHubProvider } from './github.provider.js';

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

  it('is configured only when client, secret and issuer are set', () => {
    const linker = {} as ExternalAccountLinker;
    const configured = new AuthentikProvider(
      createConfigServiceMock({
        AUTHENTIK_CLIENT_ID: 'id',
        AUTHENTIK_CLIENT_SECRET: 'secret',
        AUTHENTIK_ISSUER: 'http://idp/',
      }) as unknown as ConfigService,
      linker,
    );
    expect(configured.configured()).toBe(true);

    const disabled = new AuthentikProvider(
      createConfigServiceMock({ AUTHENTIK_CLIENT_ID: 'id' }) as unknown as ConfigService,
      linker,
    );
    expect(disabled.configured()).toBe(false);
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
  it('is configured only when client id and secret are set', () => {
    const linker = {} as ExternalAccountLinker;
    const disabled = new GitHubProvider(
      createConfigServiceMock({}) as unknown as ConfigService,
      linker,
    );
    expect(disabled.configured()).toBe(false);

    const enabled = new GitHubProvider(
      createConfigServiceMock({
        GITHUB_CLIENT_ID: 'id',
        GITHUB_CLIENT_SECRET: 'secret',
      }) as unknown as ConfigService,
      linker,
    );
    expect(enabled.configured()).toBe(true);
  });

  it('builds the default callback from PUBLIC_API_URL', async () => {
    const linker = {} as ExternalAccountLinker;
    const provider = new GitHubProvider(
      createConfigServiceMock({
        PUBLIC_API_URL: 'https://auth.example.com/',
      }) as unknown as ConfigService,
      linker,
    );
    // @ts-expect-error проверка protected-метода
    expect(provider.callbackUrl()).toBe(
      'https://auth.example.com/api/auth/external/github/callback',
    );
  });
});
