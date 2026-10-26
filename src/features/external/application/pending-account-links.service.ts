import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import {
  PENDING_ACCOUNT_LINK_INVALID,
  PENDING_ACCOUNT_LINK_TOKEN_BYTES,
  PENDING_ACCOUNT_LINK_TTL_MS,
} from '../../../libs/consts/account-link.constants.js';
import { PendingAccountLink } from '../domain/pending-account-link.entity.js';
import { PendingAccountLinksRepository } from '../infrastructure/repository/pending-account-links.repository.js';

export interface CreatePendingAccountLinkInput {
  provider: string;
  providerSub: string;
  userId: string;
  email: string;
}

/**
 * Одноразовые заявки на привязку SSO. Токен генерируется криптографически
 * стойким, в БД попадает только SHA-256: утечка дампа не даёт возможности
 * подтвердить чужую привязку.
 */
@Injectable()
export class PendingAccountLinksService {
  constructor(private readonly repository: PendingAccountLinksRepository) {}

  async create(
    input: CreatePendingAccountLinkInput,
  ): Promise<{ token: string; expiresAt: Date }> {
    // Для одной пары провайдер+sub держим только последнюю заявку.
    await this.repository.deleteByProviderSub(
      input.provider,
      input.providerSub,
    );
    const now = new Date();
    await this.repository.deleteExpired(now);

    const token = randomBytes(PENDING_ACCOUNT_LINK_TOKEN_BYTES).toString(
      'base64url',
    );
    const expiresAt = new Date(now.getTime() + PENDING_ACCOUNT_LINK_TTL_MS);

    await this.repository.create({
      tokenHash: this.hash(token),
      userId: input.userId,
      provider: input.provider,
      providerSub: input.providerSub,
      email: input.email,
      expiresAt,
    });

    return { token, expiresAt };
  }

  /** Информация о заявке без её расходования (для промежуточного экрана). */
  async describe(token: string): Promise<PendingAccountLink> {
    const link = await this.findValid(token);
    if (!link) {
      throw new NotFoundException(PENDING_ACCOUNT_LINK_INVALID);
    }
    return link;
  }

  /**
   * Атомарно «сжигает» токен. Если параллельный запрос успел первым —
   * deleteById вернёт false, и второй запрос получит отказ.
   */
  async consume(token: string): Promise<PendingAccountLink> {
    const link = await this.findValid(token);
    if (!link) {
      throw new NotFoundException(PENDING_ACCOUNT_LINK_INVALID);
    }

    const removed = await this.repository.deleteById(link.id, link.tokenHash);
    if (!removed) {
      throw new NotFoundException(PENDING_ACCOUNT_LINK_INVALID);
    }
    return link;
  }

  private async findValid(token: string): Promise<PendingAccountLink | null> {
    const normalized = token.trim();
    if (!normalized) {
      return null;
    }

    const link = await this.repository.findByTokenHash(this.hash(normalized));
    if (!link) {
      return null;
    }
    if (link.expiresAt.getTime() <= Date.now()) {
      await this.repository
        .deleteById(link.id, link.tokenHash)
        .catch(() => undefined);
      return null;
    }
    return link;
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
