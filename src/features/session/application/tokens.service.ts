import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import {
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL,
} from '../../../libs/consts/token.constants.js';

export interface RefreshPayload {
  sub: string;
  jti: string;
  /** Время истечения (unix seconds) — до него храним токен в blacklist. */
  exp?: number;
}

export interface AccessPayload {
  sub: string;
  email: string;
  /** Версия токенов аккаунта на момент выдачи. */
  ver?: number;
}

@Injectable()
export class TokensService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Кому предназначены токены. Это защищает от использования токенов,
   * выпущенных другим сервисом с тем же секретом.
   */
  private issuer(): string {
    return this.configService.get<string>('JWT_ISSUER') ?? 'auth-backend';
  }

  private audience(): string {
    return this.configService.get<string>('JWT_AUDIENCE') ?? 'auth-frontend';
  }

  signAccess(userId: string, email: string, tokenVersion = 0): Promise<string> {
    return this.jwtService.signAsync(
      { sub: userId, email, ver: tokenVersion },
      {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
        expiresIn: ACCESS_TOKEN_TTL,
        issuer: this.issuer(),
        audience: this.audience(),
      },
    );
  }

  signRefresh(userId: string, jti: string): Promise<string> {
    return this.jwtService.signAsync(
      { sub: userId, jti },
      {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: REFRESH_TOKEN_TTL,
        issuer: this.issuer(),
        audience: this.audience(),
      },
    );
  }

  /** Проверка access-токена: подпись, срок, издатель и аудитория. */
  async verifyAccess(rawToken: string): Promise<AccessPayload | null> {
    try {
      const payload = await this.jwtService.verifyAsync<AccessPayload>(
        rawToken,
        {
          secret: this.configService.getOrThrow<string>('JWT_SECRET'),
          issuer: this.issuer(),
          audience: this.audience(),
        },
      );
      if (!payload.sub) {
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }

  async verifyRefresh(rawToken: string): Promise<RefreshPayload | null> {
    try {
      const payload = await this.jwtService.verifyAsync<RefreshPayload>(
        rawToken,
        {
          secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
          issuer: this.issuer(),
          audience: this.audience(),
        },
      );
      if (!payload.sub || !payload.jti) return null;
      return payload;
    } catch {
      return null;
    }
  }

  /**
   * Читает payload без проверки подписи. Нужен только для срока хранения
   * отклонённого токена в blacklist — доверять этим данным нельзя.
   */
  decodeRefresh(rawToken: string): RefreshPayload | null {
    try {
      const payload = this.jwtService.decode<RefreshPayload>(rawToken);
      if (!payload || typeof payload !== 'object') return null;
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
