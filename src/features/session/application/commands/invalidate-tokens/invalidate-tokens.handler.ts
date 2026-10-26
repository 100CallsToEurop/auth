import { Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { TokenVersionsRepository } from '../../../infrastructure/repository/token-versions.repository.js';
import { InvalidateTokensCommand } from './invalidate-tokens.command.js';

@Injectable()
@CommandHandler(InvalidateTokensCommand)
export class InvalidateTokensHandler implements ICommandHandler<InvalidateTokensCommand> {
  constructor(
    private readonly tokenVersionsRepository: TokenVersionsRepository,
  ) {}

  async execute(command: InvalidateTokensCommand): Promise<void> {
    if (!command.userId) {
      return;
    }
    await this.tokenVersionsRepository.increment(command.userId);
  }
}
