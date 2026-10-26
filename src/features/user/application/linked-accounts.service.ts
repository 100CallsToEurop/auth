import { Injectable } from '@nestjs/common';
import { ExternalIdentity } from '../domain/external-identity.entity.js';
import { ExternalIdentitiesRepository } from '../infrastructure/repository/external-identities.repository.js';

/**
 * Прикладной сервис привязанных внешних аккаунтов. Держит доступ к
 * external_identities внутри модуля пользователей: внешние провайдеры не
 * должны знать, как эти записи хранятся.
 */
@Injectable()
export class LinkedAccountsService {
  constructor(private readonly repository: ExternalIdentitiesRepository) {}

  findByProvider(
    provider: string,
    providerSub: string,
  ): Promise<ExternalIdentity | null> {
    return this.repository.findByProvider(provider, providerSub);
  }

  findByUserId(userId: string): Promise<ExternalIdentity[]> {
    return this.repository.findByUserId(userId);
  }

  findByUserIdAndProvider(
    userId: string,
    provider: string,
  ): Promise<ExternalIdentity | null> {
    return this.repository.findByUserIdAndProvider(userId, provider);
  }

  create(data: Partial<ExternalIdentity>): Promise<ExternalIdentity> {
    return this.repository.create(data);
  }

  remove(id: string): Promise<void> {
    return this.repository.remove(id);
  }
}
