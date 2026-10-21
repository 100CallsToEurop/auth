import { Injectable, UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { RefreshTokensRepository } from '../../../repository/refresh-tokens.repository.js';
import { LogoutAllCommand } from './logout-all.command.js';

@Injectable()
@CommandHandler(LogoutAllCommand)
export class LogoutAllHandler implements ICommandHandler<LogoutAllCommand> {
  constructor(
    private readonly refreshTokensRepository: RefreshTokensRepository,
  ) {}

  async execute(command: LogoutAllCommand): Promise<{ ok: true; revoked: number }> {
    if (!command.userId) {
      throw new UnauthorizedException();
    }

    const revoked = await this.refreshTokensRepository.removeAllByUserId(
      command.userId,
    );
    return { ok: true, revoked };
  }
}
