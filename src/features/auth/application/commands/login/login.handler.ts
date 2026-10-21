import { Injectable, UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UsersRepository } from '../../../../user/repository/users.repository.js';
import { PasswordService } from '../../password.service.js';
import { SessionService } from '../../session.service.js';
import { LoginCommand } from './login.command.js';

@Injectable()
@CommandHandler(LoginCommand)
export class LoginHandler implements ICommandHandler<LoginCommand> {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
  ) {}

  async execute(command: LoginCommand) {
    const email = command.email.toLowerCase().trim();

    const user = await this.usersRepository.findByEmail(email);
    if (
      !user ||
      !user.passwordHash ||
      !(await this.passwordService.compare(
        command.password,
        user.passwordHash,
      ))
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.sessionService.start(user, command.meta);
  }
}
