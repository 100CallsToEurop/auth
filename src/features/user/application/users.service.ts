import { ConflictException, Injectable } from '@nestjs/common';
import { User } from '../domain/user.entity.js';
import { UsersRepository } from '../infrastructure/repository/users.repository.js';

/**
 * Прикладной сервис пользователей — единственная точка входа в аккаунты для
 * остальных модулей. Репозиторий наружу не отдаём: инварианты (например,
 * «регистрация не трогает существующий аккаунт») живут здесь.
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
   * Регистрация локального входа — только создание нового аккаунта.
   *
   * Прикреплять пароль к уже существующему аккаунту нельзя: почта в сервисе
   * не подтверждается, поэтому злоумышленник, зная чужой email, мог бы задать
   * пароль на аккаунт, созданный владельцем через SSO, и войти в него.
   * Владелец SSO-аккаунта добавляет пароль после входа своим способом
   * (отдельного сценария установки пароля пока нет).
   */
  async registerWithPassword(
    email: string,
    passwordHash: string,
  ): Promise<User> {
    const existing = await this.findByEmail(email);
    if (existing) {
      throw new ConflictException(
        'An account with this email already exists. Sign in with a method already linked to it.',
      );
    }

    return this.create({ email, passwordHash });
  }
}
