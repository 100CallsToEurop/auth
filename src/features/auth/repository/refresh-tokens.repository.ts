import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RefreshToken } from '../domain/refresh-token.entity.js';

export interface CreateRefreshTokenData {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string | null;
  ip?: string | null;
  provider?: string | null;
}

@Injectable()
export class RefreshTokensRepository {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly repository: Repository<RefreshToken>,
  ) {}

  findByIdWithUser(
    id: string,
    userId: string,
  ): Promise<RefreshToken | null> {
    return this.repository.findOne({
      where: { id, userId },
      relations: { user: true },
    });
  }

  /** Все активные refresh-сессии пользователя (свежие — первыми). */
  findByUserId(userId: string): Promise<RefreshToken[]> {
    return this.repository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  create(data: CreateRefreshTokenData): Promise<RefreshToken> {
    const record = this.repository.create(data);
    return this.repository.save(record);
  }

  async touch(id: string): Promise<void> {
    await this.repository.update({ id }, { lastUsedAt: new Date() });
  }

  /** Провайдер, которым была создана сессия (для выбора SSO-logout). */
  async findProviderById(id: string): Promise<string | null> {
    const record = await this.repository.findOne({
      where: { id },
      select: { id: true, provider: true },
    });
    return record?.provider ?? null;
  }

  async remove(id: string): Promise<void> {
    await this.repository.delete({ id });
  }

  /** Отзывает одну сессию, но только если она принадлежит пользователю. */
  async removeByIdForUser(id: string, userId: string): Promise<boolean> {
    const result = await this.repository.delete({ id, userId });
    return (result.affected ?? 0) > 0;
  }

  /** Отзывает все сессии пользователя (выход со всех устройств). */
  async removeAllByUserId(userId: string): Promise<number> {
    const result = await this.repository.delete({ userId });
    return result.affected ?? 0;
  }

  /**
   * Отзывает все сессии пользователя, КРОМЕ указанной (текущей) — «завершить
   * другие сессии», оставаясь в этой.
   */
  async removeAllByUserIdExcept(
    userId: string,
    exceptId: string,
  ): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .delete()
      .from(RefreshToken)
      .where('user_id = :userId', { userId })
      .andWhere('id != :exceptId', { exceptId })
      .execute();
    return result.affected ?? 0;
  }
}
