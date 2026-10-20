import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { User } from '../../../user/domain/user.entity.js';
import { ExternalIdentitysRepository } from '../../../user/repository/external-identities.repository.js';
import { UsersRepository } from '../../../user/repository/users.repository.js';
import type { ExternalProfile } from '../domain/external-profile.js';

/**
 * Связывание внешнего аккаунта с локальным пользователем — общий алгоритм
 * для всех провайдеров (Authentik, Яндекс, GitHub):
 *
 * 1. поиск по стабильному идентификатору (provider, sub) в
 *    external_identities;
 * 2. legacy-фолбэк: привязки, сохранённые в users.provider/provider_sub до
 *    мультилинка (переносятся в external_identities);
 * 3. поиск по email — вход в существующий аккаунт (например, созданного по
 *    паролю) с привязкой нового провайдера;
 * 4. создание нового пользователя + привязка.
 *
 * ВАЖНО: сам по себе вход НЕ обновляет профиль (email/ФИО) — данные берутся
 * у провайдера только при явной синхронизации (syncProvider).
 */
@Injectable()
export class ExternalAccountLinker {
  private readonly logger = new Logger(ExternalAccountLinker.name);

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly identitiesRepository: ExternalIdentitysRepository,
  ) {}

  async link(provider: string, profile: ExternalProfile): Promise<User> {
    const sub = this.requireSubject(provider, profile);

    let record = await this.identitiesRepository.findByProvider(provider, sub);
    let user = record
      ? await this.usersRepository.findById(record.userId)
      : null;

    if (!user) {
      const legacy = await this.usersRepository.findByProvider(provider, sub);
      if (legacy) {
        user = legacy;
        await this.identitiesRepository.create({
          userId: legacy.id,
          provider,
          providerSub: sub,
        });
      }
    }

    if (!user) {
      const email = this.requireEmail(provider, profile);
      user = await this.usersRepository.findByEmail(email);
    }

    if (!user) {
      user = await this.usersRepository.create({
        email: this.requireEmail(provider, profile),
        passwordHash: null,
        firstName: profile.firstName?.trim() || null,
        lastName: profile.lastName?.trim() || null,
        displayName: profile.displayName?.trim() || null,
      });
      await this.identitiesRepository.create({
        userId: user.id,
        provider,
        providerSub: sub,
      });
      return user;
    }

    if (!record) {
      await this.identitiesRepository.create({
        userId: user.id,
        provider,
        providerSub: sub,
      });
    }

    return user;
  }

  /**
   * Явная синхронизация профиля: обновляет email/ФИО текущего пользователя
   * данными провайдера. Требует, чтобы провайдер уже был привязан к аккаунту.
   */
  async syncProvider(
    provider: string,
    profile: ExternalProfile,
    userId: string,
  ): Promise<User> {
    const sub = this.requireSubject(provider, profile);

    const record = await this.identitiesRepository.findByProvider(
      provider,
      sub,
    );
    if (!record || record.userId !== userId) {
      throw new BadRequestException(
        `Provider ${provider} is not linked to the current account`,
      );
    }

    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }

    return this.applyProfile(user, {
      email: this.requireEmail(provider, profile),
      firstName: profile.firstName?.trim() || null,
      lastName: profile.lastName?.trim() || null,
      displayName: profile.displayName?.trim() || null,
    });
  }

  /**
   * Отвязка способа входа от аккаунта. Нельзя отвязать провайдер, если у
   * аккаунта нет пароля и это последний способ входа (иначе потеря доступа).
   */
  async unlink(provider: string, userId: string): Promise<void> {
    const record = await this.identitiesRepository.findByUserIdAndProvider(
      userId,
      provider,
    );
    if (!record) {
      throw new BadRequestException(
        `Provider ${provider} is not linked to the current account`,
      );
    }

    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }

    const identities = await this.identitiesRepository.findByUserId(userId);
    const remaining = identities.filter((i) => i.id !== record.id).length;
    if (!user.passwordHash && remaining === 0) {
      throw new BadRequestException(
        'Cannot unlink the last sign-in method',
      );
    }

    await this.identitiesRepository.remove(record.id);
  }

  private requireSubject(provider: string, profile: ExternalProfile): string {
    const sub = profile.sub?.trim();
    if (!sub) {
      throw new UnauthorizedException(
        `Provider ${provider} did not return a subject`,
      );
    }
    return sub;
  }

  private requireEmail(provider: string, profile: ExternalProfile): string {
    const email = profile.email?.toLowerCase().trim();
    if (!email) {
      throw new UnauthorizedException(
        `Provider ${provider} did not return an email`,
      );
    }
    return email;
  }

  private async applyProfile(
    user: User,
    data: {
      email: string;
      firstName: string | null;
      lastName: string | null;
      displayName: string | null;
    },
  ): Promise<User> {
    let dirty = false;

    if (data.email !== user.email) {
      const owner = await this.usersRepository.findByEmail(data.email);
      if (owner && owner.id !== user.id) {
        this.logger.warn(
          `Почта ${data.email} уже занята другим аккаунтом — ` +
            `не обновляем email у user=${user.id} (остаётся ${user.email})`,
        );
      } else {
        user.email = data.email;
        dirty = true;
      }
    }

    if (data.firstName && data.firstName !== user.firstName) {
      user.firstName = data.firstName;
      dirty = true;
    }
    if (data.lastName && data.lastName !== user.lastName) {
      user.lastName = data.lastName;
      dirty = true;
    }
    if (data.displayName && data.displayName !== user.displayName) {
      user.displayName = data.displayName;
      dirty = true;
    }

    if (dirty) {
      await this.usersRepository.save(user);
    }

    return user;
  }
}
