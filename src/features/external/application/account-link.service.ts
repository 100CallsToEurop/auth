import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { IssuedSession } from '../../session/application/session.service.js';
import type { SessionMeta } from '../../session/application/session.service.js';
import { SessionService } from '../../session/application/session.service.js';
import { PasswordService } from '../../auth/application/password.service.js';
import { UsersService } from '../../user/application/users.service.js';
import {
  PENDING_ACCOUNT_LINK_INVALID,
  PENDING_ACCOUNT_LINK_NO_PASSWORD,
} from '../../../libs/consts/account-link.constants.js';
import { ExternalAccountLinker } from './external-account-linker.js';
import { PendingAccountLinksService } from './pending-account-links.service.js';

export interface AccountLinkInfo {
  provider: string;
  email: string;
  hasPassword: boolean;
  expiresAt: string;
}

/**
 * Подтверждение владения существующим аккаунтом и привязка SSO-идентичности.
 *
 * Пароль сверяется всегда (даже если аккаунт уже удалён) через bcrypt-заглушку:
 * иначе по времени ответа можно понять, существует ли аккаунт. Только после
 * успешной проверки одноразовый токен расходуется и создаётся привязка.
 */
@Injectable()
export class AccountLinkService {
  constructor(
    private readonly pendingLinks: PendingAccountLinksService,
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly linker: ExternalAccountLinker,
    private readonly sessionService: SessionService,
  ) {}

  async describe(token: string): Promise<AccountLinkInfo> {
    const pending = await this.pendingLinks.describe(token);
    const user = await this.usersService.findById(pending.userId);
    if (!user) {
      throw new NotFoundException(PENDING_ACCOUNT_LINK_INVALID);
    }

    return {
      provider: pending.provider,
      email: pending.email,
      hasPassword: Boolean(user.passwordHash),
      expiresAt: pending.expiresAt.toISOString(),
    };
  }

  async confirm(
    token: string,
    password: string,
    meta: SessionMeta,
  ): Promise<IssuedSession> {
    const pending = await this.pendingLinks.describe(token);
    const user = await this.usersService.findById(pending.userId);
    const passwordMatches = await this.passwordService.compare(
      password,
      user?.passwordHash ?? PasswordService.DUMMY_HASH,
    );

    if (!user) {
      throw new UnauthorizedException(
        'Не удалось подтвердить владение аккаунтом',
      );
    }
    if (!user.passwordHash) {
      throw new BadRequestException(PENDING_ACCOUNT_LINK_NO_PASSWORD);
    }
    if (!passwordMatches) {
      throw new UnauthorizedException(
        'Не удалось подтвердить владение аккаунтом',
      );
    }

    // Только после доказательства владения токен становится недействительным.
    const consumed = await this.pendingLinks.consume(token);
    const linked = await this.linker.linkPendingIdentity(
      consumed.userId,
      consumed.provider,
      consumed.providerSub,
    );

    return this.sessionService.start(linked, {
      ...meta,
      provider: consumed.provider,
    });
  }
}
