import { Injectable, UnauthorizedException } from '@nestjs/common';
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

@Injectable()
export class AuthentikStrategy extends PassportStrategy(Strategy, 'authentik') {
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

  async validate(
    issuer: string,
    profile: AuthentikProfile,
  ): Promise<User> {
    const sub = profile?.id || profile?.sub;
    const email = profile?.emails?.[0]?.value || profile?.email;

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
      user.provider = user.provider === 'local' ? 'authentik' : user.provider;
      user.providerSub = user.providerSub || sub || null;
      await this.usersRepository.save(user);
    }

    return user;
  }
}
