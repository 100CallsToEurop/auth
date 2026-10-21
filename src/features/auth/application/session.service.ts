import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { RefreshTokensRepository } from '../repository/refresh-tokens.repository.js';
import {
  REFRESH_TOKEN_TTL_MS,
} from './auth.constants.js';
import { TokensService } from './tokens.service.js';

export interface SessionUserInput {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
}

/** Метаданные клиента для отображения в списке активных сессий. */
export interface SessionMeta {
  userAgent?: string | null;
  ip?: string | null;
  /** Способ входа: slug провайдера ('authentik', 'yandex', …) или 'password'. */
  provider?: string | null;
}

export interface SessionResponse {
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    displayName: string | null;
  };
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

  async start(user: SessionUserInput, meta: SessionMeta = {}): Promise<IssuedSession> {
    const accessToken = await this.tokensService.signAccess(
      user.id,
      user.email,
    );

    const jti = randomUUID();
    const refreshToken = await this.tokensService.signRefresh(user.id, jti);

    await this.refreshTokensRepository.create({
      id: jti,
      userId: user.id,
      tokenHash: this.tokensService.hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
      provider: meta.provider ?? null,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName ?? null,
        lastName: user.lastName ?? null,
        displayName: user.displayName ?? null,
      },
      accessToken,
      refreshToken,
    };
  }
}
