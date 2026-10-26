import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UsersService } from '../../../../user/application/users.service.js';
import { PasswordService } from '../../password.service.js';
import { SetPasswordCommand } from './set-password.command.js';

/**
 * Создание пароля для аккаунта без пароля или смена существующего пароля.
 * Владение аккаунтом подтверждено JWT-guard'ом; при смене дополнительно
 * проверяется текущий пароль.
 */
@Injectable()
@CommandHandler(SetPasswordCommand)
export class SetPasswordHandler implements ICommandHandler<SetPasswordCommand> {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
  ) {}

  async execute(command: SetPasswordCommand) {
    const user = await this.usersService.findById(command.userId);
    if (!user) {
      throw new UnauthorizedException('Требуется вход в аккаунт');
    }

    if (!user.passwordHash) {
      const passwordHash = await this.passwordService.hash(command.password);
      return this.usersService.setPassword(command.userId, passwordHash);
    }

    if (!command.currentPassword) {
      throw new BadRequestException('Введите текущий пароль');
    }
    const matches = await this.passwordService.compare(
      command.currentPassword,
      user.passwordHash,
    );
    if (!matches) {
      throw new BadRequestException('Текущий пароль указан неверно');
    }

    const passwordHash = await this.passwordService.hash(command.password);
    return this.usersService.changePassword(command.userId, passwordHash);
  }
}
