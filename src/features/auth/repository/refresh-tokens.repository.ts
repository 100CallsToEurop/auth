import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RefreshToken } from '../domain/refresh-token.entity.js';

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

  create(data: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<RefreshToken> {
    const record = this.repository.create(data);
    return this.repository.save(record);
  }

  async remove(id: string): Promise<void> {
    await this.repository.delete({ id });
  }
}
