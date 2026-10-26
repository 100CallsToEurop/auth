import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { RefreshTokensRepository } from '../infrastructure/repository/refresh-tokens.repository.js';
import {
  PURGE_AFTER_MS,
  PURGE_PROBABILITY,
} from '../../../libs/consts/session.constants.js';
import { REFRESH_TOKEN_TTL_MS } from '../../../libs/consts/token.constants.js';
import { TokensService } from './tokens.service.js';
import { TokenVersionsRepository } from '../infrastructure/repository/token-versions.repository.js';

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
  /** Семейство токенов: пересечение при ротации. */
  familyId?: string;
  /** Заранее выбранный jti нового refresh-токена (нужен для атомарной ротации). */
  jti?: string;
}

interface SessionResponse {
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
  /** Идентификатор refresh-токена (jti) — он же id записи в БД. */
  jti: string;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly tokensService: TokensService,
    private readonly tokenVersionsRepository: TokenVersionsRepository,
    private readonly refreshTokensRepository: RefreshTokensRepository,
  ) {}

  async start(
    user: SessionUserInput,
    meta: SessionMeta = {},
  ): Promise<IssuedSession> {
    const tokenVersion = await this.tokenVersionsRepository.findVersion(
      user.id,
    );
    const accessToken = await this.tokensService.signAccess(
      user.id,
      user.email,
      tokenVersion,
    );

    const jti = meta.jti ?? randomUUID();
    // Новая сессия начинает новое семейство; при ротации семейство наследуется.
    const familyId = meta.familyId ?? jti;
    const refreshToken = await this.tokensService.signRefresh(user.id, jti);

    await this.refreshTokensRepository.create({
      id: jti,
      userId: user.id,
      tokenHash: this.tokensService.hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
      provider: meta.provider ?? null,
      familyId,
    });

    void this.purgeStaleTokens();

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
      jti,
    };
  }

  /**
   * Раз в несколько выдач подчищаем записи отозванных/просроченных токенов:
   * при каждой ротации остаётся строка, иначе таблица растёт бесконечно.
   */
  private async purgeStaleTokens(): Promise<void> {
    if (Math.random() >= PURGE_PROBABILITY) {
      return;
    }
    try {
      await this.refreshTokensRepository.purgeStale(
        new Date(Date.now() - PURGE_AFTER_MS),
      );
    } catch {
      // чистка не критична: её failure не должен ломать выдачу сессии
    }
  }
}
