import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { User } from '../../user/domain/user.entity.js';
import { LinkedAccountsService } from '../../user/application/linked-accounts.service.js';
import { UsersService } from '../../user/application/users.service.js';
import { EMAIL_PATTERN } from '../../../libs/consts/validation.constants.js';
import type { ExternalAccountResolver } from '../../../libs/providers/common/contracts/external-account-resolver.js';
import type { ExternalProfile } from '../../../libs/providers/common/contracts/external-profile.js';

/**
 * Связывание внешнего аккаунта с локальным пользователем — общий алгоритм
 * для всех провайдеров (Authentik, Яндекс, GitHub):
 *
 * 1. поиск по стабильному идентификатору (provider, sub) в
 *    external_identities — повторный вход в уже привязанный аккаунт;
 * 2. создание нового пользователя + привязка.
 *
 * Слияние с существующим аккаунтом ТОЛЬКО по email запрещено. Раньше вход
 * через провайдера с чужим email привязывался к уже созданному локальному
 * аккаунту, а значит злоумышленник мог завести аккаунт на чужой адрес
 * (регистрация почту не подтверждает) и войти в него через провайдера,
 * получив доступ к чужому аккаунту. Привязать провайдер к существующему
 * аккаунту можно только явно — из профиля, когда пользователь уже вошёл
 * (см. linkProvider).
 *
 * ВАЖНО: сам по себе вход НЕ обновляет профиль (email/ФИО) — данные берутся
 * у провайдера только при явной синхронизации (syncProvider).
 */
@Injectable()
export class ExternalAccountLinker implements ExternalAccountResolver {
  private readonly logger = new Logger(ExternalAccountLinker.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly linkedAccounts: LinkedAccountsService,
  ) {}

  async link(provider: string, profile: ExternalProfile): Promise<User> {
    const sub = this.requireSubject(provider, profile);

    const record = await this.linkedAccounts.findByProvider(provider, sub);
    if (record) {
      const linked = await this.usersService.findById(record.userId);
      if (linked) {
        return linked;
      }
    }

    const email = this.requireEmail(provider, profile);

    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new ConflictException(
        `An account with email ${email} already exists. ` +
          `Sign in with it and link ${provider} in your profile settings.`,
      );
    }

    let user: User;
    try {
      user = await this.usersService.create({
        email,
        passwordHash: null,
        firstName: profile.firstName?.trim() || null,
        lastName: profile.lastName?.trim() || null,
        displayName: profile.displayName?.trim() || null,
      });
    } catch (error) {
      // Параллельный callback успел создать ту же привязку — отдаём его
      // аккаунт вместо ошибки.
      const created = await this.linkedAccounts.findByProvider(provider, sub);
      const raced = created
        ? await this.usersService.findById(created.userId)
        : null;
      if (raced) {
        return raced;
      }
      throw error;
    }

    await this.ensureIdentity(user.id, provider, sub);
    return user;
  }

  /**
   * Явная привязка провайдера к аккаунту, который уже авторизован
   * пользователем (страница профиля). Email при этом не сверяется: владение
   * аккаунтом подтверждено самой сессией, а токен провайдера — тем, что
   * пользователь только что авторизовался у него.
   */
  async linkProvider(
    provider: string,
    profile: ExternalProfile,
    userId: string,
  ): Promise<User> {
    const sub = this.requireSubject(provider, profile);

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }

    const existing = await this.linkedAccounts.findByProvider(provider, sub);
    if (existing) {
      if (existing.userId === userId) {
        return user;
      }
      throw new ConflictException(
        `This ${provider} account is already linked to another user`,
      );
    }

    await this.ensureIdentity(userId, provider, sub);
    return user;
  }

  /**
   * Идемпотентная привязка (provider, sub) к пользователю. Уникальный индекс
   * uq_external_identities_provider_sub может сработать при параллельных
   * callback — тогда просто перечитываем существующую запись.
   */
  private async ensureIdentity(
    userId: string,
    provider: string,
    providerSub: string,
  ): Promise<void> {
    try {
      await this.linkedAccounts.create({ userId, provider, providerSub });
    } catch (error) {
      const existing = await this.linkedAccounts.findByProvider(
        provider,
        providerSub,
      );
      if (!existing) {
        throw error;
      }
    }
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

    const record = await this.linkedAccounts.findByProvider(provider, sub);
    if (!record || record.userId !== userId) {
      throw new BadRequestException(
        `Provider ${provider} is not linked to the current account`,
      );
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }

    return this.applyProfile(user, {
      // Неподтверждённую почту не переносим на аккаунт: иначе провайдер
      // мог бы подменить email пользователя.
      email: profile.emailVerified ? this.requireEmail(provider, profile) : '',
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
    const record = await this.linkedAccounts.findByUserIdAndProvider(
      userId,
      provider,
    );
    if (!record) {
      throw new BadRequestException(
        `Provider ${provider} is not linked to the current account`,
      );
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }

    const identities = await this.linkedAccounts.findByUserId(userId);
    const remaining = identities.filter((i) => i.id !== record.id).length;
    if (!user.passwordHash && remaining === 0) {
      throw new BadRequestException('Cannot unlink the last sign-in method');
    }

    await this.linkedAccounts.remove(record.id);
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
    if (!EMAIL_PATTERN.test(email)) {
      throw new UnauthorizedException(
        `Provider ${provider} returned a malformed email`,
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

    if (data.email && data.email !== user.email) {
      const owner = await this.usersService.findByEmail(data.email);
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
      await this.usersService.save(user);
    }

    return user;
  }
}
