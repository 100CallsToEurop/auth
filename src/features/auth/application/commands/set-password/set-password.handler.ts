import { Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UsersService } from '../../../../user/application/users.service.js';
import { PasswordService } from '../../password.service.js';
import { SetPasswordCommand } from './set-password.command.js';

/**
 * Создание пароля для аккаунта, у которого его ещё нет (например, аккаунт
 * создан через SSO). Проверка владения уже выполнена JWT-guard'ом.
 */
@Injectable()
@CommandHandler(SetPasswordCommand)
export class SetPasswordHandler implements ICommandHandler<SetPasswordCommand> {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
  ) {}

  async execute(command: SetPasswordCommand) {
    const passwordHash = await this.passwordService.hash(command.password);
    return this.usersService.setPassword(command.userId, passwordHash);
  }
}
