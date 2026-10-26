import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { RefreshToken } from '../../domain/refresh-token.entity.js';

export interface CreateRefreshTokenData {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string | null;
  ip?: string | null;
  provider?: string | null;
  /** Семейство токенов (продолжение ротации). */
  familyId?: string | null;
}

@Injectable()
export class RefreshTokensRepository {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly repository: Repository<RefreshToken>,
  ) {}

  findByIdWithUser(id: string, userId: string): Promise<RefreshToken | null> {
    return this.repository.findOne({
      where: { id, userId },
      relations: { user: true },
    });
  }

  /**
   * Жива ли сессия (refresh-токен не отозван и принадлежит пользователю).
   * Используется там, где авторизация идёт по cookie (синхронизация профиля,
   * привязка провайдера): одной подписи токена недостаточно — его могли
   * отозвать выходом из аккаунта.
   */
  async isActive(id: string, userId: string): Promise<boolean> {
    const record = await this.repository.findOne({
      where: { id, userId, revokedAt: IsNull() },
      select: { id: true },
    });
    return record !== null;
  }

  /** Все активные refresh-сессии пользователя (свежие — первыми). */
  findByUserId(userId: string): Promise<RefreshToken[]> {
    return this.repository.find({
      where: { userId, revokedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  create(data: CreateRefreshTokenData): Promise<RefreshToken> {
    const record = this.repository.create({
      revokedAt: null,
      replacedById: null,
      ...data,
    });
    return this.repository.save(record);
  }

  /**
   * Атомарная ротация: помечает токен отозванным и записывает, каким токеном
   * он заменён. Возвращает false, если токен уже был отозван (гонка двух
   * параллельных refresh'ей) — значит его уже использовали, и это reuse.
   */
  async rotate(id: string, replacedById: string): Promise<boolean> {
    const result = await this.repository
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revokedAt: new Date(), replacedById })
      .where('id = :id', { id })
      .andWhere('revoked_at IS NULL')
      .execute();
    return (result.affected ?? 0) > 0;
  }

  /** Отзывает токен (мягко: строка остаётся для аудита и reuse detection). */
  async revoke(id: string): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revokedAt: new Date() })
      .where('id = :id', { id })
      .andWhere('revoked_at IS NULL')
      .execute();
  }

  /** Отзывает всё семейство токенов (reuse detection). */
  async revokeFamily(familyId: string): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revokedAt: new Date() })
      .where('family_id = :familyId', { familyId })
      .andWhere('revoked_at IS NULL')
      .execute();
    return result.affected ?? 0;
  }

  /** Отзывает одну сессию, но только если она принадлежит пользователю. */
  async revokeByIdForUser(id: string, userId: string): Promise<boolean> {
    const result = await this.repository
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revokedAt: new Date() })
      .where('id = :id', { id })
      .andWhere('user_id = :userId', { userId })
      .andWhere('revoked_at IS NULL')
      .execute();
    return (result.affected ?? 0) > 0;
  }

  /** Отзывает все сессии пользователя (выход со всех устройств). */
  async revokeAllByUserId(userId: string): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revokedAt: new Date() })
      .where('user_id = :userId', { userId })
      .andWhere('revoked_at IS NULL')
      .execute();
    return result.affected ?? 0;
  }

  /**
   * Отзывает все сессии пользователя, КРОМЕ указанной (текущей) — «завершить
   * другие сессии», оставаясь в этой.
   */
  async revokeAllByUserIdExcept(
    userId: string,
    exceptId: string,
  ): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revokedAt: new Date() })
      .where('user_id = :userId', { userId })
      .andWhere('id != :exceptId', { exceptId })
      .andWhere('revoked_at IS NULL')
      .execute();
    return result.affected ?? 0;
  }

  /**
   * Чистит старые отозванные/просроченные записи: таблица растёт при каждой
   * ротации, а хранить их вечно незачем.
   */
  async purgeStale(before: Date): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .delete()
      .from(RefreshToken)
      .where('expires_at < :before', { before })
      .execute();
    return result.affected ?? 0;
  }
}
