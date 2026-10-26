import type { ExternalProfile } from '../../common/contracts/external-profile.js';
import { AbstractOAuth2Provider } from '../../common/base/abstract-oauth2.provider.js';
import { githubConfig } from './github.config.js';

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
  readonly slug = githubConfig.slug;
  readonly displayName = githubConfig.displayName;

  protected override get endpoints() {
    return githubConfig.endpoints;
  }

  protected override readonly defaultScopes = githubConfig.defaultScopes;

  protected override readonly headers = githubConfig.headers;

  protected override async fetchProfile(
    accessToken: string,
  ): Promise<ExternalProfile> {
    const user = await GitHubProvider.api<GitHubUser>(
      githubConfig.api.userUrl,
      accessToken,
    );

    let email = (user.email || '').trim();
    // Публичный email в профиле GitHub всегда подтверждён самим GitHub.
    let emailVerified = Boolean(email);

    if (!email) {
      try {
        const emails = await GitHubProvider.api<GitHubEmail[]>(
          githubConfig.api.emailsUrl,
          accessToken,
        );
        const confirmed =
          emails.find((item) => item.primary && item.verified) ??
          emails.find((item) => item.verified);
        if (confirmed) {
          email = confirmed.email;
          emailVerified = true;
        } else {
          email = emails[0]?.email || '';
          emailVerified = false;
        }
      } catch {
        // без user:email fallback на публичный noreply-адрес GitHub
      }
    }
    if (!email && user.id && user.login) {
      email = `${user.id}+${user.login}@users.noreply.github.com`;
      // noreply-адрес уникален для пользователя и выдан самим GitHub —
      // опасен он только как «почта», но не как идентификатор.
      emailVerified = true;
    }

    return {
      sub: String(user.id ?? ''),
      email: email.toLowerCase().trim(),
      emailVerified,
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
        'User-Agent': githubConfig.api.userAgent,
        'X-GitHub-Api-Version': githubConfig.api.version,
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      throw new Error(`GitHub API HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  }
}
