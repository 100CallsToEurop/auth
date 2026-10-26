import { Injectable, UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UsersService } from '../../../../user/application/users.service.js';
import { PasswordService } from '../../password.service.js';
import { SessionService } from '../../../../session/application/session.service.js';
import { LoginCommand } from './login.command.js';

@Injectable()
@CommandHandler(LoginCommand)
export class LoginHandler implements ICommandHandler<LoginCommand> {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
  ) {}

  async execute(command: LoginCommand) {
    const email = command.email.toLowerCase().trim();

    const user = await this.usersService.findByEmail(email);
    // Сравниваем всегда (даже если пользователя нет) — иначе по времени
    // ответа переборчики определяют, какие email зарегистрированы.
    const passwordMatches = await this.passwordService.compare(
      command.password,
      user?.passwordHash ?? PasswordService.DUMMY_HASH,
    );

    if (!user || !user.passwordHash || !passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.sessionService.start(user, command.meta);
  }
}
