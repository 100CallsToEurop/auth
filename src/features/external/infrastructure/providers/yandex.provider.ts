import type { ExternalProfile } from '../../domain/external-profile.js';
import { AbstractOAuth2Provider } from './abstract-oauth2.provider.js';

interface YandexUserInfo {
  id?: number | string;
  login?: string;
  default_email?: string;
  emails?: string[];
  first_name?: string;
  last_name?: string;
  display_name?: string;
  real_name?: string;
}

/**
 * Вход через Яндекс OAuth (Adapter): /login.yandex.ru/info приводится к
 * ExternalProfile. Требует scope login:info login:email.
 */
export class YandexProvider extends AbstractOAuth2Provider {
  readonly slug = 'yandex';
  readonly displayName = 'Яндекс';

  protected override get endpoints() {
    return {
      authorizationURL: 'https://oauth.yandex.ru/authorize',
      tokenURL: 'https://oauth.yandex.ru/token',
    };
  }

  protected override readonly defaultScopes = 'login:info login:email';

  protected override async fetchProfile(
    accessToken: string,
  ): Promise<ExternalProfile> {
    const response = await fetch(
      'https://login.yandex.ru/info?format=json',
      {
        headers: { Authorization: `OAuth ${accessToken}` },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) {
      throw new Error(`Yandex userinfo HTTP ${response.status}`);
    }
    const info = (await response.json()) as YandexUserInfo;

    return YandexProvider.normalizeProfile(info);
  }

  static normalizeProfile(info: YandexUserInfo): ExternalProfile {
    const email =
      info.default_email || info.emails?.[0] || '';

    return {
      sub: String(info.id ?? ''),
      email: email.toLowerCase().trim(),
      firstName: info.first_name?.trim() || null,
      lastName: info.last_name?.trim() || null,
      displayName:
        info.display_name?.trim() || info.real_name?.trim() || null,
    };
  }
}
