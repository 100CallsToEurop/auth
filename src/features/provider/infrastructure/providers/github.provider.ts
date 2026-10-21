import type { ExternalProfile } from '../../../external/domain/external-profile.js';
import { AbstractOAuth2Provider } from './abstract-oauth2.provider.js';

interface GitHubUser {
  id?: number;
  login?: string;
  email?: string | null;
  name?: string | null;
}

interface GitHubEmail {
  email: string;
  primary?: boolean;
  verified?: boolean;
}

/**
 * Вход через GitHub OAuth (Adapter): /api.github.com/user (+ /user/emails,
 * если e-mail скрыт) приводится к ExternalProfile. Требует scope
 * read:user user:email.
 */
export class GitHubProvider extends AbstractOAuth2Provider {
  readonly slug = 'github';
  readonly displayName = 'GitHub';

  protected override get endpoints() {
    return {
      authorizationURL: 'https://github.com/login/oauth/authorize',
      tokenURL: 'https://github.com/login/oauth/access_token',
    };
  }

  protected override readonly defaultScopes = 'read:user user:email';

  // Accept: json — GitHub иначе отдаёт токен в form-encoded;
  // User-Agent обязателен для api.github.com.
  protected override readonly headers = {
    Accept: 'application/json',
    'User-Agent': 'auth-backend',
  };

  protected override async fetchProfile(
    accessToken: string,
  ): Promise<ExternalProfile> {
    const user = await GitHubProvider.api<GitHubUser>(
      'https://api.github.com/user',
      accessToken,
    );

    let email = (user.email || '').trim();
    if (!email) {
      try {
        const emails = await GitHubProvider.api<GitHubEmail[]>(
          'https://api.github.com/user/emails',
          accessToken,
        );
        email =
          emails.find((item) => item.primary && item.verified)?.email ||
          emails.find((item) => item.verified)?.email ||
          emails[0]?.email ||
          '';
      } catch {
        // без user:email fallback на публичный noreply-адрес GitHub
      }
    }
    if (!email && user.id && user.login) {
      email = `${user.id}+${user.login}@users.noreply.github.com`;
    }

    return {
      sub: String(user.id ?? ''),
      email: email.toLowerCase().trim(),
      firstName: null,
      lastName: null,
      displayName: user.name?.trim() || null,
    };
  }

  private static async api<T>(url: string, accessToken: string): Promise<T> {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'auth-backend',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      throw new Error(`GitHub API HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  }
}
