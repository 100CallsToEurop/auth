import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserTokenVersion } from '../../domain/user-token-version.entity.js';

@Injectable()
export class TokenVersionsRepository {
  constructor(
    @InjectRepository(UserTokenVersion)
    private readonly repository: Repository<UserTokenVersion>,
  ) {}

  /**
   * Текущая версия токенов пользователя. Отдельный лёгкий запрос: не тянем
   * всю сущность пользователя. Если записи ещё нет — версия 0.
   */
  async findVersion(userId: string): Promise<number> {
    const record = await this.repository.findOne({
      where: { userId },
      select: { version: true },
    });
    return record?.version ?? 0;
  }

  /**
   * Увеличивает версию токенов. Upsert атомарен: первый вызов создаёт запись,
   * последующие увеличивают версию. Старые access-токены перестают работать.
   */
  async increment(userId: string): Promise<void> {
    await this.repository.query(
      `INSERT INTO "user_token_versions" ("user_id", "version")
       VALUES ($1, 1)
       ON CONFLICT ("user_id")
       DO UPDATE SET "version" = "user_token_versions"."version" + 1`,
      [userId],
    );
  }
}
