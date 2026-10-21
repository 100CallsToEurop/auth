import { Logger } from '@nestjs/common';
import { Strategy as OIDCStrategy } from 'passport-openidconnect';
import type { Strategy as PassportStrategy } from 'passport';
import type { Request } from 'express';
import type { ExternalProfile } from '../../../external/domain/external-profile.js';
import { AbstractExternalProvider } from './abstract-external.provider.js';

interface AuthentikOidcProfile {
  id?: string;
  sub?: string;
  email?: string;
  emails?: Array<{ value: string }>;
  displayName?: string;
  name?: { givenName?: string; familyName?: string };
}

interface OpenIdConfiguration {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  userinfo_endpoint?: string;
  end_session_endpoint?: string;
}

type OIDCStrategyInternals = {
  _issuer: string;
  _userInfoURL?: string;
  _oauth2: { _authorizeUrl: string; _accessTokenUrl: string };
};

/**
 * Authentik по OIDC. Authentik вычисляет iss ID-токена из запроса к
 * token_endpoint, а issuer (из discovery) обязан совпадать с ним побуквенно.
 * Endpoint-ы Authentik лежат на общих путях без слага приложения, поэтому
 * при старте сверяем конфиг с discovery-документом и, если надо, берём
 * issuer/endpoint-ы оттуда (env остаётся запасным вариантом).
 */
export class AuthentikProvider extends AbstractExternalProvider {
  readonly slug = 'authentik';
  readonly displayName = 'Authentik';

  private readonly logger = new Logger(AuthentikProvider.name);

  /** end_session_endpoint из OIDC discovery (для RP-initiated logout). */
  private endSessionEndpoint: string | null = null;

  createStrategy(): PassportStrategy {
    const dispatch = this.dispatchFn();

    const issuer = this.configService.getOrThrow<string>('AUTHENTIK_ISSUER');
    const strategy = new OIDCStrategy(
      {
        issuer,
        authorizationURL:
          this.configService.get<string>('AUTHENTIK_AUTHORIZATION_URL') ??
          `${issuer}authorize/`,
        tokenURL:
          this.configService.get<string>('AUTHENTIK_TOKEN_URL') ??
          `${issuer}token/`,
        userInfoURL:
          this.configService.get<string>('AUTHENTIK_USERINFO_URL') ??
          `${issuer}userinfo/`,
        clientID: this.configService.getOrThrow<string>('AUTHENTIK_CLIENT_ID'),
        clientSecret: this.configService.getOrThrow<string>(
          'AUTHENTIK_CLIENT_SECRET',
        ),
        callbackURL: this.callbackUrl(),
        scope: this.scope('openid email profile'),
        // req.user/req.session приходят в verify — нужен для синхронизации
        passReqToCallback: true,
        // skipUserProfile: false — грузим userinfo, т.к. по умолчанию
        // библиотека пропускает его и e-mail берётся только из ID-токена.
        skipUserProfile: false,
      },
      (
        req: Request,
        _issuer: string,
        profile: AuthentikOidcProfile,
        done: (err?: Error | null, user?: Express.User, info?: unknown) => void,
      ) => {
        void dispatch(req, AuthentikProvider.normalizeProfile(profile)).then(
          (user) => done(null, user as unknown as Express.User),
          (err: unknown) => done(err as Error),
        );
      },
    );

    return strategy;
  }

  async init(strategy: PassportStrategy): Promise<void> {
    const configuredIssuer = this.configService.getOrThrow<string>(
      'AUTHENTIK_ISSUER',
    );
    const discoveryUrl = `${configuredIssuer.replace(/\/?$/, '/')}.well-known/openid-configuration`;

    let doc: OpenIdConfiguration;
    try {
      const response = await fetch(discoveryUrl, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      doc = (await response.json()) as OpenIdConfiguration;
      if (!doc.issuer) {
        throw new Error('в ответе нет поля issuer');
      }
    } catch (err) {
      this.logger.warn(
        `Не удалось получить OIDC discovery (${discoveryUrl}): ` +
          `${err instanceof Error ? err.message : String(err)}. ` +
          `Используются значения из окружения: issuer=${configuredIssuer}`,
      );
      return;
    }

    const internals = strategy as unknown as OIDCStrategyInternals;
    internals._issuer = doc.issuer;
    if (doc.authorization_endpoint) {
      internals._oauth2._authorizeUrl = doc.authorization_endpoint;
    }
    if (doc.token_endpoint) {
      internals._oauth2._accessTokenUrl = doc.token_endpoint;
    }
    if (doc.userinfo_endpoint) {
      internals._userInfoURL = doc.userinfo_endpoint;
    }
    if (doc.end_session_endpoint) {
      this.endSessionEndpoint = doc.end_session_endpoint;
    }

    this.logger.log(
      `OIDC: issuer=${internals._issuer}, authorize=${internals._oauth2._authorizeUrl}, ` +
        `token=${internals._oauth2._accessTokenUrl}, userinfo=${internals._userInfoURL}`,
    );
    if (doc.issuer !== configuredIssuer) {
      this.logger.warn(
        `AUTHENTIK_ISSUER="${configuredIssuer}" не совпадает с issuer из discovery ` +
          `"${doc.issuer}" — используется issuer из discovery`,
      );
    }
  }

  override configured(): boolean {
    return Boolean(
      this.configService.get<string>('AUTHENTIK_CLIENT_ID') &&
        this.configService.get<string>('AUTHENTIK_CLIENT_SECRET') &&
        this.configService.get<string>('AUTHENTIK_ISSUER'),
    );
  }

  /**
   * RP-initiated logout Authentik: завершает и SSO-сессию в Authentik, а не
   * только локальную. Использует end_session_endpoint из discovery; при
   * недоступности discovery — выводит его из issuer.
   */
  logoutUrl(returnTo?: string): string | null {
    let endpoint = this.endSessionEndpoint;
    if (!endpoint) {
      const issuer = this.configService.get<string>('AUTHENTIK_ISSUER');
      if (!issuer) {
        return null;
      }
      endpoint = `${issuer.replace(/\/?$/, '/')}end-session/`;
    }
    const url = new URL(endpoint);
    if (returnTo) {
      url.searchParams.set('post_logout_redirect_uri', returnTo);
    }
    return url.toString();
  }

  static normalizeProfile(profile: AuthentikOidcProfile): ExternalProfile {
    return {
      sub: profile?.id || profile?.sub || '',
      email: (profile?.emails?.[0]?.value || profile?.email || '')
        .toLowerCase()
        .trim(),
      firstName: profile?.name?.givenName?.trim() || null,
      lastName: profile?.name?.familyName?.trim() || null,
      displayName: profile?.displayName?.trim() || null,
    };
  }
}
