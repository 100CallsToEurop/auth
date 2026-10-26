import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import {
  BadRefreshToken,
  type BadRefreshTokenReason,
} from '../../domain/bad-refresh-token.entity.js';

@Injectable()
export class BadRefreshTokensRepository {
  constructor(
    @InjectRepository(BadRefreshToken)
    private readonly repository: Repository<BadRefreshToken>,
  ) {}

  /** Токен уже отклоняли и срок его блокировки ещё не истёк. */
  async isBlocked(tokenHash: string): Promise<boolean> {
    const record = await this.repository.findOne({
      where: {
        tokenHash,
        expiresAt: MoreThan(new Date()),
      },
      select: { tokenHash: true },
    });
    return record !== null;
  }

  /**
   * Запоминает отклонённый токен до его естественного истечения. Повторный
   * insert обновляет срок и причину (например, при повторном предъявлении).
   */
  async block(
    tokenHash: string,
    expiresAt: Date,
    reason: BadRefreshTokenReason,
  ): Promise<void> {
    await this.repository.upsert({ tokenHash, expiresAt, reason }, [
      'tokenHash',
    ]);
    // Заодно подчищаем записи, которые уже не могут быть предъявлены.
    await this.purgeExpired();
  }

  /** Удаляет истёкшие записи: токен после своего exp всё равно невалиден. */
  async purgeExpired(now = new Date()): Promise<number> {
    const result = await this.repository.delete({
      expiresAt: LessThanOrEqual(now),
    });
    return result.affected ?? 0;
  }
}
