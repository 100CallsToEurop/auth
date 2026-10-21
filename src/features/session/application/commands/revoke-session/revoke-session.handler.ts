import { Injectable, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { RefreshTokensRepository } from '../../../repository/refresh-tokens.repository.js';
import { RevokeSessionCommand } from './revoke-session.command.js';

@Injectable()
@CommandHandler(RevokeSessionCommand)
export class RevokeSessionHandler
  implements ICommandHandler<RevokeSessionCommand>
{
  constructor(
    private readonly refreshTokensRepository: RefreshTokensRepository,
  ) {}

  async execute(command: RevokeSessionCommand): Promise<{ ok: true }> {
    const removed = await this.refreshTokensRepository.removeByIdForUser(
      command.sessionId,
      command.userId,
    );
    if (!removed) {
      throw new NotFoundException('Session not found');
    }
    return { ok: true };
  }
}
