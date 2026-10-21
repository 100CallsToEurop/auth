import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import {
  ACCESS_TOKEN_TTL,
  JWT_REFRESH_SECRET,
  JWT_SECRET,
  REFRESH_TOKEN_TTL,
} from '../../../constants/session.constants.js';

export interface RefreshPayload {
  sub: string;
  jti: string;
}

@Injectable()
export class TokensService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  signAccess(userId: string, email: string): Promise<string> {
    return this.jwtService.signAsync(
      { sub: userId, email },
      {
        secret: this.configService.getOrThrow<string>(JWT_SECRET),
        expiresIn: ACCESS_TOKEN_TTL,
      },
    );
  }

  signRefresh(userId: string, jti: string): Promise<string> {
    return this.jwtService.signAsync(
      { sub: userId, jti },
      {
        secret: this.configService.getOrThrow<string>(JWT_REFRESH_SECRET),
        expiresIn: REFRESH_TOKEN_TTL,
      },
    );
  }

  async verifyRefresh(rawToken: string): Promise<RefreshPayload | null> {
    try {
      const payload = await this.jwtService.verifyAsync<RefreshPayload>(
        rawToken,
        { secret: this.configService.getOrThrow<string>(JWT_REFRESH_SECRET) },
      );
      if (!payload.sub || !payload.jti) return null;
      return payload;
    } catch {
      return null;
    }
  }

  hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}
