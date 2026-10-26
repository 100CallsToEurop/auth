import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { EmailAlreadyRegisteredException } from '../../../libs/common/exceptions/email-already-registered.exception.js';
import { User } from '../domain/user.entity.js';
import { UsersRepository } from '../infrastructure/repository/users.repository.js';
import { LinkedAccountsService } from './linked-accounts.service.js';

/** Поля профиля, которые пользователь может менять самостоятельно. */
export interface ProfileChanges {
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  organization?: string | null;
  position?: string | null;
}

function normalizeOptional(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
}

/**
 * Прикладной сервис пользователей — единственная точка входа в аккаунты для
 * остальных модулей. Репозиторий наружу не отдаём: инварианты (например,
 * «регистрация не трогает существующий аккаунт») живут здесь.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly repository: UsersRepository,
    private readonly linkedAccounts: LinkedAccountsService,
  ) {}

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
   * Прикреплять пароль к уже существующему аккаунту автоматически нельзя:
   * почта в сервисе не подтверждается, поэтому злоумышленник, зная чужой
   * email, мог бы задать пароль на аккаунт, созданный владельцем через SSO,
   * и войти в него. Владелец может привязать пароль явным действием
   * (attachPasswordToProviderAccount или setPassword из профиля).
   */
  async registerWithPassword(
    email: string,
    passwordHash: string,
  ): Promise<User> {
    const existing = await this.findByEmail(email);
    if (existing) {
      const identities = await this.linkedAccounts.findByUserId(existing.id);
      // Предлагаем привязку только аккаунтам без пароля, созданным через
      // внешний вход: иначе это была бы попытка отобрать существующий вход.
      throw new EmailAlreadyRegisteredException(
        !existing.passwordHash && identities.length > 0,
      );
    }

    return this.create({ email, passwordHash });
  }

  /**
   * Создание пароля из профиля. Только для аккаунтов, у которых пароля ещё
   * нет: смена существующего пароля — отдельный сценарий с проверкой старого.
   */
  async setPassword(userId: string, passwordHash: string): Promise<User> {
    const user = await this.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Требуется вход в аккаунт');
    }
    if (user.passwordHash) {
      throw new BadRequestException('Пароль уже установлен');
    }

    user.passwordHash = passwordHash;
    return this.save(user);
  }

  /**
   * Смена существующего пароля. Проверка текущего пароля — в auth-модуле:
   * домен пользователей не должен зависеть от bcrypt и формата хэша.
   */
  async changePassword(userId: string, passwordHash: string): Promise<User> {
    const user = await this.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Требуется вход в аккаунт');
    }
    if (!user.passwordHash) {
      throw new BadRequestException('Пароль ещё не установлен');
    }

    user.passwordHash = passwordHash;
    return this.save(user);
  }

  /**
   * Подтверждение номера телефона. Отправка кода не выполняется: сервис
   * работает в условном режиме, поэтому номер сразу считается подтверждённым.
   * Без этого флага редактирование профиля запрещено.
   */
  async confirmPhone(userId: string, phone: string): Promise<User> {
    const user = await this.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Требуется вход в аккаунт');
    }

    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) {
      throw new BadRequestException('Введите корректный номер телефона');
    }

    user.phone = phone.trim();
    user.phoneVerifiedAt = new Date();
    return this.save(user);
  }

  /**
   * Редактирование личных данных. Пока телефон не подтверждён, менять
   * профиль нельзя — проверка дублируется на сервере, а не только в UI.
   */
  async updateProfile(
    userId: string,
    changes: ProfileChanges,
  ): Promise<User> {
    const user = await this.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Требуется вход в аккаунт');
    }
    if (!user.phoneVerifiedAt) {
      throw new ForbiddenException(
        'Подтвердите номер телефона, чтобы редактировать профиль',
      );
    }

    if (changes.firstName !== undefined) {
      user.firstName = normalizeOptional(changes.firstName);
    }
    if (changes.lastName !== undefined) {
      user.lastName = normalizeOptional(changes.lastName);
    }
    if (changes.middleName !== undefined) {
      user.middleName = normalizeOptional(changes.middleName);
    }
    if (changes.organization !== undefined) {
      user.organization = normalizeOptional(changes.organization);
    }
    if (changes.position !== undefined) {
      user.position = normalizeOptional(changes.position);
    }

    return this.save(user);
  }

  /**
   * Привязка пароля при конфликте регистрации к аккаунту, созданному через
   * внешний вход. Почта не подтверждается — пользователь делает это явно,
   * понимая риск. Аккаунты с паролем и аккаунты без внешних способов входа
   * отклоняем: иначе регистрация снова стала бы способом захвата аккаунта.
   */
  async attachPasswordToProviderAccount(
    email: string,
    passwordHash: string,
  ): Promise<User> {
    const user = await this.findByEmail(email);
    if (!user) {
      throw new ConflictException(
        'Аккаунт с этой почтой не найден. Зарегистрируйтесь заново.',
      );
    }
    if (user.passwordHash) {
      throw new ConflictException(
        'У аккаунта с этой почтой уже есть пароль. Войдите с его помощью.',
      );
    }

    const identities = await this.linkedAccounts.findByUserId(user.id);
    if (identities.length === 0) {
      throw new ConflictException(
        'К аккаунту не привязан внешний способ входа. Зарегистрируйтесь заново.',
      );
    }

    user.passwordHash = passwordHash;
    return this.save(user);
  }
}
