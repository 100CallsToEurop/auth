import { Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { SessionService } from '../../../../session/application/session.service.js';
import { UsersService } from '../../../../user/application/users.service.js';
import { PasswordService } from '../../password.service.js';
import { RegisterCommand } from './register.command.js';

@Injectable()
@CommandHandler(RegisterCommand)
export class RegisterHandler implements ICommandHandler<RegisterCommand> {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
  ) {}

  async execute(command: RegisterCommand) {
    const email = command.email.toLowerCase().trim();
    const passwordHash = await this.passwordService.hash(command.password);

    // Создание аккаунта или прикрепление пароля — инвариант модуля
    // пользователей, а не auth.
    const user = await this.usersService.registerWithPassword(
      email,
      passwordHash,
    );

    return this.sessionService.start(user, command.meta);
  }
}
