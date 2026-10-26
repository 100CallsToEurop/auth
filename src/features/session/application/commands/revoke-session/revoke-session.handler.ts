import { Injectable, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { RefreshTokensRepository } from '../../../infrastructure/repository/refresh-tokens.repository.js';
import { RevokeSessionCommand } from './revoke-session.command.js';

@Injectable()
@CommandHandler(RevokeSessionCommand)
export class RevokeSessionHandler implements ICommandHandler<RevokeSessionCommand> {
  constructor(
    private readonly refreshTokensRepository: RefreshTokensRepository,
  ) {}

  async execute(command: RevokeSessionCommand): Promise<{ ok: true }> {
    const revoked = await this.refreshTokensRepository.revokeByIdForUser(
      command.sessionId,
      command.userId,
    );
    if (!revoked) {
      throw new NotFoundException('Session not found');
    }
    return { ok: true };
  }
}
