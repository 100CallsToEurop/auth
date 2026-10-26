import { Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { SessionService } from '../../../../session/application/session.service.js';
import { UsersService } from '../../../../user/application/users.service.js';
import { PasswordService } from '../../password.service.js';
import { AttachPasswordCommand } from './attach-password.command.js';

/**
 * Привязка пароля при конфликте регистрации: аккаунт уже существует и создан
 * через внешний вход. Пользователь явно подтвердил действие, поэтому сразу
 * выдаём сессию обычным способом входа по паролю.
 */
@Injectable()
@CommandHandler(AttachPasswordCommand)
export class AttachPasswordHandler implements ICommandHandler<AttachPasswordCommand> {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
  ) {}

  async execute(command: AttachPasswordCommand) {
    const email = command.email.toLowerCase().trim();
    const passwordHash = await this.passwordService.hash(command.password);

    const user = await this.usersService.attachPasswordToProviderAccount(
      email,
      passwordHash,
    );

    return this.sessionService.start(user, {
      ...command.meta,
      provider: 'password',
    });
  }
}
