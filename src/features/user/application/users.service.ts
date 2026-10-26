import { ConflictException, Injectable } from '@nestjs/common';
import { User } from '../domain/user.entity.js';
import { UsersRepository } from '../infrastructure/repository/users.repository.js';

/**
 * Прикладной сервис пользователей — единственная точка входа в аккаунты для
 * остальных модулей. Репозиторий наружу не отдаём: инварианты (например,
 * «пароль прикрепляется только к аккаунту без пароля») живут здесь.
 */
@Injectable()
export class UsersService {
  constructor(private readonly repository: UsersRepository) {}

  findById(id: string): Promise<User | null> {
    return this.repository.findById(id);
  }

  findByEmail(email: string): Promise<User | null> {
    return this.repository.findByEmail(email);
  }

  create(data: Partial<User>): Promise<User> {
    return this.repository.create(data);
  }

  save(user: User): Promise<User> {
    return this.repository.save(user);
  }

  /**
   * Регистрация локального входа: новый аккаунт или прикрепление пароля к
   * аккаунту, созданному через внешнего провайдера (подтверждения почты в
   * сервисе нет, поэтому занятый email с паролем — конфликт).
   */
  async registerWithPassword(
    email: string,
    passwordHash: string,
  ): Promise<User> {
    const existing = await this.findByEmail(email);
    if (existing?.passwordHash) {
      throw new ConflictException('Email is already registered');
    }

    if (existing) {
      existing.passwordHash = passwordHash;
      return this.save(existing);
    }

    return this.create({ email, passwordHash });
  }
}
