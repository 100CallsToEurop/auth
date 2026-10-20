import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-openidconnect';
import { UsersRepository } from '../../user/repository/users.repository.js';

@Injectable()
export class AuthentikStrategy extends PassportStrategy(Strategy, 'authentik') {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersRepository: UsersRepository,
  ) {
    super({
      issuer: configService.getOrThrow<string>('AUTHENTIK_ISSUER'),
      authorizationURL: `${configService.getOrThrow<string>('AUTHENTIK_ISSUER')}authorize/`,
      tokenURL: `${configService.getOrThrow<string>('AUTHENTIK_ISSUER')}token/`,
      userInfoURL: `${configService.getOrThrow<string>('AUTHENTIK_ISSUER')}userinfo/`,
      clientID: configService.getOrThrow<string>('AUTHENTIK_CLIENT_ID'),
      clientSecret: configService.getOrThrow<string>('AUTHENTIK_CLIENT_SECRET'),
      callbackURL: configService.getOrThrow<string>('AUTHENTIK_CALLBACK_URL'),
      scope:
        configService.get<string>('AUTHENTIK_SCOPES')?.split(' ') ?? [
          'openid',
          'email',
          'profile',
        ],
    });
  }

  async validate(
    issuer: string,
    profile: any,
    context: any,
    idToken: string | undefined,
    accessToken: string,
    refreshToken: string | undefined,
    done: VerifyCallback,
  ) {
    const sub = profile?.id || profile?.sub;
    const email = profile?.emails?.[0]?.value || profile?.email;

    if (!email) {
      return done(new Error('Email not provided by Authentik'), false);
    }

    let user = await this.usersRepository.findByEmail(email);

    if (!user) {
      user = await this.usersRepository.create({
        email,
        passwordHash: null,
        provider: 'authentik',
        providerSub: sub,
      } as any);
    } else if (user.provider !== 'authentik' || user.providerSub !== sub) {
      user.provider = user.provider === 'local' ? 'authentik' : user.provider;
      user.providerSub = user.providerSub || sub;
      await this.usersRepository.save(user);
    }

    return done(null, user);
  }
}
