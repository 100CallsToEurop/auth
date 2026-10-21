import type { ExternalProfile } from '../../domain/external-profile.js';
import { AbstractOAuth2Provider } from './abstract-oauth2.provider.js';

interface InvisionMember {
  id?: number | string;
  name?: string;
  email?: string;
  photoUrl?: string;
  photoUrlThumb?: string;
}

/**
 * Вход через Invision Community OAuth2 (Adapter).
 *
 * Адрес сообщества задаётся INVISION_BASE_URL (например,
 * https://community.example.com). Authorization/token лежат на /oauth/*,
 * профиль отдаёт REST API /api/core/me (id, name, email).
 *
 * Требует, чтобы в Invision был создан OAuth-клиент (ACP → API → OAuth
 * Clients) со redirect URI
 * ${PUBLIC_API_URL}/api/auth/external/invision/callback.
 */
export class InvisionProvider extends AbstractOAuth2Provider {
  readonly slug = 'invision';
  readonly displayName = 'Invision Community';

  /** Базовый адрес сообщества без завершающего слэша. */
  private baseUrl(): string {
    const raw =
      this.configService.get<string>(this.configKey('BASE_URL'))?.trim() ?? '';
    if (!raw) {
      throw new Error(
        'INVISION_BASE_URL is required (e.g. https://community.example.com)',
      );
    }
    return raw.replace(/\/+$/, '');
  }

  protected override get endpoints() {
    const base = this.baseUrl();
    return {
      authorizationURL: `${base}/oauth/authorize`,
      tokenURL: `${base}/oauth/token`,
    };
  }

  protected override readonly defaultScopes = '';

  protected override async fetchProfile(
    accessToken: string,
  ): Promise<ExternalProfile> {
    const response = await fetch(`${this.baseUrl()}/api/core/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      throw new Error(`Invision API HTTP ${response.status}`);
    }
    const member = (await response.json()) as InvisionMember;

    return InvisionProvider.normalizeProfile(member);
  }

  static normalizeProfile(member: InvisionMember): ExternalProfile {
    const name = member.name?.trim() || '';
    return {
      sub: String(member.id ?? ''),
      email: (member.email || '').toLowerCase().trim(),
      firstName: null,
      lastName: null,
      displayName: name || null,
    };
  }

  /** Провайдер включается только при заданных клиентах и базовом URL. */
  override configured(): boolean {
    return (
      super.configured() &&
      Boolean(this.configService.get<string>(this.configKey('BASE_URL')))
    );
  }
}
