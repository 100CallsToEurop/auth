import type { ExternalProfile } from '../../common/contracts/external-profile.js';
import { AbstractOAuth2Provider } from '../../common/base/abstract-oauth2.provider.js';
import { yandexConfig } from './yandex.config.js';

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
  readonly slug = yandexConfig.slug;
  readonly displayName = yandexConfig.displayName;

  protected override get endpoints() {
    return yandexConfig.endpoints;
  }

  protected override readonly defaultScopes = yandexConfig.defaultScopes;

  protected override async fetchProfile(
    accessToken: string,
  ): Promise<ExternalProfile> {
    const response = await fetch(yandexConfig.userInfoUrl, {
      headers: { Authorization: `OAuth ${accessToken}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      throw new Error(`Yandex userinfo HTTP ${response.status}`);
    }
    const info = (await response.json()) as YandexUserInfo;

    return YandexProvider.normalizeProfile(info);
  }

  static normalizeProfile(info: YandexUserInfo): ExternalProfile {
    const email = info.default_email || info.emails?.[0] || '';

    return {
      sub: String(info.id ?? ''),
      email: email.toLowerCase().trim(),
      // Яндекс требует подтверждения почты до выдачи прав, поэтому адреса
      // из /login.yandex.ru/info считаем подтверждёнными.
      emailVerified: Boolean(email),
      firstName: info.first_name?.trim() || null,
      lastName: info.last_name?.trim() || null,
      displayName: info.display_name?.trim() || info.real_name?.trim() || null,
    };
  }
}
