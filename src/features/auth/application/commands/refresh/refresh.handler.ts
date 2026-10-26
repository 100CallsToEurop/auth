import { Injectable, UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { randomUUID } from 'node:crypto';
import { RefreshTokensRepository } from '../../../../session/infrastructure/repository/refresh-tokens.repository.js';
import { SessionService } from '../../../../session/application/session.service.js';
import {
  TokensService,
  type RefreshPayload,
} from '../../../../session/application/tokens.service.js';
import type { BadRefreshTokenReason } from '../../../../session/domain/bad-refresh-token.entity.js';
import { BadRefreshTokensRepository } from '../../../../session/infrastructure/repository/bad-refresh-tokens.repository.js';
import { REFRESH_TOKEN_TTL_MS } from '../../../../../libs/consts/token.constants.js';
import { RefreshCommand } from './refresh.command.js';

@Injectable()
@CommandHandler(RefreshCommand)
export class RefreshHandler implements ICommandHandler<RefreshCommand> {
  constructor(
    private readonly tokensService: TokensService,
    private readonly badRefreshTokensRepository: BadRefreshTokensRepository,
    private readonly refreshTokensRepository: RefreshTokensRepository,
    private readonly sessionService: SessionService,
  ) {}

  async execute(command: RefreshCommand) {
    if (!command.token) {
      throw new UnauthorizedException('Не передан refresh-токен');
    }

    const tokenHash = this.tokensService.hashToken(command.token);
    // Токен уже отклоняли — повторно его даже не разбираем.
    if (await this.badRefreshTokensRepository.isBlocked(tokenHash)) {
      throw new UnauthorizedException('Refresh-токен заблокирован');
    }

    const payload = await this.tokensService.verifyRefresh(command.token);
    if (!payload) {
      const decoded = this.tokensService.decodeRefresh(command.token);
      await this.blockToken(
        command.token,
        'invalid',
        this.expiryOf(decoded ?? undefined),
      );
      throw new UnauthorizedException('Недействительный refresh-токен');
    }

    const record = await this.refreshTokensRepository.findByIdWithUser(
      payload.jti,
      payload.sub,
    );
    if (!record) {
      await this.blockToken(command.token, 'unknown', this.expiryOf(payload));
      throw new UnauthorizedException('Refresh-токен отозван');
    }

    // Токен уже отозван (ротация или выход) — значит его предъявили повторно.
    // Это признак кражи: отзываем всё семейство токенов этой сессии.
    if (record.revokedAt) {
      await this.blockToken(command.token, 'reuse', this.expiryOf(payload));
      await this.revokeFamily(record);
      throw new UnauthorizedException(
        'Обнаружено повторное использование refresh-токена',
      );
    }

    if (record.expiresAt.getTime() < Date.now()) {
      await this.blockToken(command.token, 'expired', record.expiresAt);
      await this.refreshTokensRepository.revoke(record.id);
      throw new UnauthorizedException('Срок действия refresh-токена истёк');
    }

    if (record.tokenHash !== tokenHash) {
      await this.blockToken(command.token, 'reuse', this.expiryOf(payload));
      await this.revokeFamily(record);
      throw new UnauthorizedException(
        'Обнаружено повторное использование refresh-токена',
      );
    }

    // Атомарная ротация: помечаем старый токен отозванным. Если это не
    // получилось — токен уже отозван другим запросом (гонка), то есть его
    // тоже предъявили повторно.
    const nextJti = randomUUID();
    const rotated = await this.refreshTokensRepository.rotate(
      record.id,
      nextJti,
    );
    if (!rotated) {
      await this.blockToken(command.token, 'reuse', this.expiryOf(payload));
      await this.revokeFamily(record);
      throw new UnauthorizedException(
        'Обнаружено повторное использование refresh-токена',
      );
    }

    // Переносим метаданные устройства в новую сессию (ротация токена —
    // это та же сессия пользователя). Семейство сохраняется: по нему
    // отзывается вся цепочка при попытке повторного использования.
    return this.sessionService.start(record.user, {
      userAgent: record.userAgent,
      ip: record.ip,
      provider: record.provider,
      familyId: record.familyId ?? record.id,
      jti: nextJti,
    });
  }

  /**
   * Срок хранения «плохого» токена: его собственный exp, а если токен не
   * прошёл проверку и exp не доверяем — максимальный срок жизни refresh-токена.
   */
  private expiryOf(payload?: RefreshPayload): Date {
    const max = Date.now() + REFRESH_TOKEN_TTL_MS;
    const expiresAt =
      payload?.exp && Number.isFinite(payload.exp) ? payload.exp * 1000 : max;
    // Не доверяем exp неподписанного токена сверх максимального срока жизни.
    return new Date(Math.min(expiresAt, max));
  }

  private async blockToken(
    rawToken: string,
    reason: BadRefreshTokenReason,
    expiresAt?: Date,
  ): Promise<void> {
    await this.badRefreshTokensRepository.block(
      this.tokensService.hashToken(rawToken),
      expiresAt ?? this.expiryOf(),
      reason,
    );
  }

  /** Отзыв всего семейства токенов (если семейство ещё не задано — сам токен). */
  private async revokeFamily(record: {
    id: string;
    familyId: string | null;
  }): Promise<void> {
    const familyId = record.familyId ?? record.id;
    await this.refreshTokensRepository.revokeFamily(familyId);
  }
}
