import { ConflictException, Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UsersRepository } from '../../../../user/repository/users.repository.js';
import { PasswordService } from '../../password.service.js';
import { SessionService } from '../../session.service.js';
import { RegisterCommand } from './register.command.js';

@Injectable()
@CommandHandler(RegisterCommand)
export class RegisterHandler implements ICommandHandler<RegisterCommand> {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
  ) {}

  async execute(command: RegisterCommand) {
    const email = command.email.toLowerCase().trim();

    const existing = await this.usersRepository.findByEmail(email);
    if (existing?.passwordHash) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await this.passwordService.hash(command.password);

    // Аккаунт уже есть, но пароля нет (создан через Authentik): прикрепляем
    // пароль к нему и входим в тот же аккаунт вместо ошибки о занятой почте.
    if (existing) {
      existing.passwordHash = passwordHash;
      const user = await this.usersRepository.save(existing);
      return this.sessionService.start(user);
    }

    const user = await this.usersRepository.create({
      email,
      passwordHash,
    });

    return this.sessionService.start(user);
  }
}
