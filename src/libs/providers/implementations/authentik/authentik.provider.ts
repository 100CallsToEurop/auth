import { Logger } from '@nestjs/common';
import { Strategy as OIDCStrategy } from 'passport-openidconnect';
import type { Strategy as PassportStrategy } from 'passport';
import type { Request } from 'express';
import type { ExternalProfile } from '../../common/contracts/external-profile.js';
import { AbstractExternalProvider } from '../../common/base/abstract-external.provider.js';
import { authentikConfig } from './authentik.config.js';

interface AuthentikOidcProfile {
  id?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean;
  emails?: Array<{ value: string; verified?: boolean }>;
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
  readonly slug = authentikConfig.slug;
  readonly displayName = authentikConfig.displayName;

  private readonly logger = new Logger(AuthentikProvider.name);

  /** end_session_endpoint из OIDC discovery (для RP-initiated logout). */
  private endSessionEndpoint: string | null = null;

  createStrategy(): PassportStrategy {
    const dispatch = this.dispatchFn();

    const issuer = this.configService.getOrThrow<string>(
      authentikConfig.env.issuer,
    );
    const strategy = new OIDCStrategy(
      {
        issuer,
        authorizationURL:
          this.configService.get<string>(
            authentikConfig.env.authorizationUrl,
          ) ?? `${issuer}${authentikConfig.paths.authorize}`,
        tokenURL:
          this.configService.get<string>(authentikConfig.env.tokenUrl) ??
          `${issuer}${authentikConfig.paths.token}`,
        userInfoURL:
          this.configService.get<string>(authentikConfig.env.userInfoUrl) ??
          `${issuer}${authentikConfig.paths.userInfo}`,
        clientID: this.configService.getOrThrow<string>(
          authentikConfig.env.clientId,
        ),
        clientSecret: this.configService.getOrThrow<string>(
          authentikConfig.env.clientSecret,
        ),
        callbackURL: this.callbackUrl(),
        scope: this.scope(authentikConfig.defaultScopes),
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
      authentikConfig.env.issuer,
    );
    const discoveryUrl = `${configuredIssuer.replace(/\/?$/, '/')}${authentikConfig.discoveryPath}`;

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
        `${authentikConfig.env.issuer}="${configuredIssuer}" не совпадает с issuer из discovery ` +
          `"${doc.issuer}" — используется issuer из discovery`,
      );
    }
  }

  /**
   * RP-initiated logout Authentik: завершает и SSO-сессию в Authentik, а не
   * только локальную. Использует end_session_endpoint из discovery; при
   * недоступности discovery — выводит его из issuer.
   */
  logoutUrl(returnTo?: string): string | null {
    let endpoint = this.endSessionEndpoint;
    if (!endpoint) {
      const issuer = this.configService.get<string>(authentikConfig.env.issuer);
      if (!issuer) {
        return null;
      }
      endpoint = `${issuer.replace(/\/?$/, '/')}${authentikConfig.paths.endSession}`;
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
      // Явный email_verified=false — почта не подтверждена. Если claim-а нет,
      // доверяем провайдеру: Authentik управляет пользователями самостоятельно.
      emailVerified:
        profile?.email_verified ?? profile?.emails?.[0]?.verified ?? true,
      firstName: profile?.name?.givenName?.trim() || null,
      lastName: profile?.name?.familyName?.trim() || null,
      displayName: profile?.displayName?.trim() || null,
    };
  }
}
