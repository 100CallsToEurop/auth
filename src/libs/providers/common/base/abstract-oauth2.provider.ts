import type { Request } from 'express';
import type { Strategy as PassportStrategy } from 'passport';
import OAuth2Strategy from 'passport-oauth2';
import type { ExternalProfile } from '../contracts/external-profile.js';
import { AbstractExternalProvider } from './abstract-external.provider.js';

export interface OAuth2Endpoints {
  authorizationURL: string;
  tokenURL: string;
}

/**
 * Template Method для OAuth2-провайдеров (Яндекс, GitHub): общий flow
 * (authorize → token → профиль → линковка/синхронизация) зашит здесь,
 * подклассы описывают только эндпоинты, scope и адаптер профиля.
 */
export abstract class AbstractOAuth2Provider extends AbstractExternalProvider {
  abstract readonly slug: string;
  abstract readonly displayName: string;
  protected abstract get endpoints(): OAuth2Endpoints;
  protected abstract readonly defaultScopes: string;
  /** Доп. заголовки запросов token exchange (например, Accept: json). */
  protected readonly headers: Record<string, string> = {};

  protected abstract fetchProfile(
    accessToken: string,
  ): Promise<ExternalProfile>;

  createStrategy(): PassportStrategy {
    const dispatch = this.dispatchFn();
    const fetchProfile = (accessToken: string) =>
      this.fetchProfile(accessToken);
    const endpoints = this.endpoints;
    const headers = this.headers;
    const scope = this.scope(this.defaultScopes);
    const clientID = this.configService.getOrThrow<string>(
      this.configKey('CLIENT_ID'),
    );
    const clientSecret = this.configService.getOrThrow<string>(
      this.configKey('CLIENT_SECRET'),
    );
    const callbackURL = this.callbackUrl();
    const pkce = this.pkceMethod();

    class ProviderStrategy extends OAuth2Strategy {
      constructor() {
        super(
          {
            authorizationURL: endpoints.authorizationURL,
            tokenURL: endpoints.tokenURL,
            clientID,
            clientSecret,
            callbackURL,
            scope,
            // state хранится в express-session — защита от CSRF на callback
            state: true,
            // PKCE (S256): код авторизации нельзя перехватить и обменять
            // без code_verifier, который лежит в сессии.
            // В типах @types/passport-oauth2 pkce — boolean, хотя библиотека
            // с 1.8.0 принимает и строковые методы ('S256'/'plain').
            ...(pkce ? { pkce: pkce as unknown as boolean } : {}),
            // req.user/req.session приходят в verify — нужен для синхронизации
            passReqToCallback: true,
            customHeaders: headers,
          },
          (
            req: Request,
            _accessToken: string,
            _refreshToken: string,
            profile: unknown,
            verified: (
              err?: Error | null,
              user?: Express.User,
              info?: unknown,
            ) => void,
          ) => {
            // профиль уже загружен через userProfile() — не запрашиваем повторно
            void dispatch(req, profile).then(
              (user) => verified(null, user as unknown as Express.User),
              (err: unknown) => verified(err as Error),
            );
          },
        );
      }

      override userProfile(
        accessToken: string,
        done: (err?: unknown, profile?: unknown) => void,
      ): void {
        void fetchProfile(accessToken).then(
          (profile) => done(null, profile),
          (err: unknown) => done(err),
        );
      }
    }

    return new ProviderStrategy();
  }
}
