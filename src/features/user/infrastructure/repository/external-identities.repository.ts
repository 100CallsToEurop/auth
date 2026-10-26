import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExternalIdentity } from '../../domain/external-identity.entity.js';

@Injectable()
export class ExternalIdentitiesRepository {
  constructor(
    @InjectRepository(ExternalIdentity)
    private readonly repository: Repository<ExternalIdentity>,
  ) {}

  findByProvider(
    provider: string,
    providerSub: string,
  ): Promise<ExternalIdentity | null> {
    return this.repository.findOneBy({ provider, providerSub });
  }

  findByUserId(userId: string): Promise<ExternalIdentity[]> {
    return this.repository.findBy({ userId });
  }

  findByUserIdAndProvider(
    userId: string,
    provider: string,
  ): Promise<ExternalIdentity | null> {
    return this.repository.findOneBy({ userId, provider });
  }

  create(data: Partial<ExternalIdentity>): Promise<ExternalIdentity> {
    const identity = this.repository.create(data);
    return this.repository.save(identity);
  }

  async remove(id: string): Promise<void> {
    await this.repository.delete({ id });
  }
}
