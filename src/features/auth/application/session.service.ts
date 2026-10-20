import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { RefreshTokensRepository } from '../repository/refresh-tokens.repository.js';
import {
  REFRESH_TOKEN_TTL_MS,
} from './auth.constants.js';
import { TokensService } from './tokens.service.js';

export interface SessionResponse {
  user: { id: string; email: string };
  accessToken: string;
}

export interface IssuedSession extends SessionResponse {
  refreshToken: string;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly tokensService: TokensService,
    private readonly refreshTokensRepository: RefreshTokensRepository,
  ) {}

  async start(userId: string, email: string): Promise<IssuedSession> {
    const accessToken = await this.tokensService.signAccess(userId, email);

    const jti = randomUUID();
    const refreshToken = await this.tokensService.signRefresh(userId, jti);

    await this.refreshTokensRepository.create({
      id: jti,
      userId,
      tokenHash: this.tokensService.hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    });

    return {
      user: { id: userId, email },
      accessToken,
      refreshToken,
    };
  }
}
