import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PendingAccountLink } from '../../domain/pending-account-link.entity.js';

@Injectable()
export class PendingAccountLinksRepository {
  constructor(
    @InjectRepository(PendingAccountLink)
    private readonly repository: Repository<PendingAccountLink>,
  ) {}

  findByTokenHash(tokenHash: string): Promise<PendingAccountLink | null> {
    return this.repository.findOneBy({ tokenHash });
  }

  create(data: Partial<PendingAccountLink>): Promise<PendingAccountLink> {
    const link = this.repository.create(data);
    return this.repository.save(link);
  }

  /**
   * Удаляет запись только если она всё ещё принадлежит этому токену.
   * Возвращает false, если параллельный запрос уже «сжёг» токен.
   */
  async deleteById(id: string, tokenHash: string): Promise<boolean> {
    const result = await this.repository.delete({ id, tokenHash });
    return (result.affected ?? 0) > 0;
  }

  /** Новая заявка для той же пары провайдер+sub отменяет предыдущую. */
  async deleteByProviderSub(
    provider: string,
    providerSub: string,
  ): Promise<void> {
    await this.repository.delete({ provider, providerSub });
  }

  async deleteExpired(now: Date): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .delete()
      .where('expires_at <= :now', { now })
      .execute();
  }
}
