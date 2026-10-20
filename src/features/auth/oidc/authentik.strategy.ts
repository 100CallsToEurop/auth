import {
  Injectable,
  Logger,
  UnauthorizedException,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-openidconnect';
import { UsersRepository } from '../../user/repository/users.repository.js';
import { User } from '../../user/domain/user.entity.js';

interface AuthentikProfile {
  id?: string;
  sub?: string;
  email?: string;
  emails?: Array<{ value: string }>;
}

interface OpenIdConfiguration {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  userinfo_endpoint?: string;
}

type StrategyInternals = {
  _issuer: string;
  _userInfoURL?: string;
  _oauth2: { _authorizeUrl: string; _accessTokenUrl: string };
};

@Injectable()
export class AuthentikStrategy
  extends PassportStrategy(Strategy, 'authentik')
  implements OnModuleInit
{
  private readonly logger = new Logger(AuthentikStrategy.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly usersRepository: UsersRepository,
  ) {
    const issuer = configService.getOrThrow<string>('AUTHENTIK_ISSUER');
    super({
      issuer,
      authorizationURL:
        configService.get<string>('AUTHENTIK_AUTHORIZATION_URL') ??
        `${issuer}authorize/`,
      tokenURL:
        configService.get<string>('AUTHENTIK_TOKEN_URL') ?? `${issuer}token/`,
      userInfoURL:
        configService.get<string>('AUTHENTIK_USERINFO_URL') ??
        `${issuer}userinfo/`,
      clientID: configService.getOrThrow<string>('AUTHENTIK_CLIENT_ID'),
      clientSecret: configService.getOrThrow<string>('AUTHENTIK_CLIENT_SECRET'),
      callbackURL: configService.getOrThrow<string>('AUTHENTIK_CALLBACK_URL'),
      scope:
        configService.get<string>('AUTHENTIK_SCOPES')?.split(' ') ?? [
          'openid',
          'email',
          'profile',
        ],
      // Authentik отдаёт authorize/token/userinfo на общих путях без слага
      // приложения, а issuer — со слагом, поэтому endpoint-ы нельзя выводить
      // конкатенацией из issuer (см. AUTHENTIK_*_URL).
      // skipUserProfile: false — грузим userinfo, т.к. по умолчанию библиотека
      // пропускает его и e-mail берётся только из ID-токена.
      skipUserProfile: false,
    });
  }

  /**
   * Authentik вычисляет iss ID-токена из запроса к token_endpoint, а issuer
   * (сборка из discovery) обязан совпадать с ним побуквенно — иначе
   * passport-openidconnect отклонит токен (401 «ID token not issued by
   * expected OpenID provider»). endpoint-ы Authentik при этом лежат на общих
   * путях без слага приложения. Поэтому issuer и endpoint-ы берём напрямую
   * из discovery-документа, а env используем как запасной вариант.
   */
  async onModuleInit(): Promise<void> {
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

    const strategy = this as unknown as StrategyInternals;
    strategy._issuer = doc.issuer;
    if (doc.authorization_endpoint) {
      strategy._oauth2._authorizeUrl = doc.authorization_endpoint;
    }
    if (doc.token_endpoint) {
      strategy._oauth2._accessTokenUrl = doc.token_endpoint;
    }
    if (doc.userinfo_endpoint) {
      strategy._userInfoURL = doc.userinfo_endpoint;
    }

    this.logger.log(
      `OIDC: issuer=${strategy._issuer}, authorize=${strategy._oauth2._authorizeUrl}, ` +
        `token=${strategy._oauth2._accessTokenUrl}, userinfo=${strategy._userInfoURL}`,
    );
    if (doc.issuer !== configuredIssuer) {
      this.logger.warn(
        `AUTHENTIK_ISSUER="${configuredIssuer}" не совпадает с issuer из discovery ` +
          `"${doc.issuer}" — используется issuer из discovery`,
      );
    }
  }

  async validate(
    issuer: string,
    profile: AuthentikProfile,
  ): Promise<User> {
    const sub = profile?.id || profile?.sub;
    // Нормализуем, чтобы вход через Authentik находил аккаунт, зарегистрированный
    // по той же почте (register сохраняет email в нижнем регистре).
    const email = (
      profile?.emails?.[0]?.value || profile?.email || ''
    )
      .toLowerCase()
      .trim();

    if (!email) {
      throw new UnauthorizedException('Email not provided by Authentik');
    }

    let user = await this.usersRepository.findByEmail(email);

    if (!user) {
      user = await this.usersRepository.create({
        email,
        passwordHash: null,
        provider: 'authentik',
        providerSub: sub,
      });
    } else if (user.provider !== 'authentik' || user.providerSub !== sub) {
      // Почта совпала — входим в уже существующий аккаунт (например,
      // зарегистрированный по паролю) и привязываем его к Authentik.
      user.provider = user.provider === 'local' ? 'authentik' : user.provider;
      user.providerSub = user.providerSub || sub || null;
      await this.usersRepository.save(user);
    }

    return user;
  }
}
