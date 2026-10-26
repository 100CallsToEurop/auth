import { Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { RefreshTokensRepository } from '../../../../session/infrastructure/repository/refresh-tokens.repository.js';
import { TokensService } from '../../../../session/application/tokens.service.js';
import { LogoutCommand } from './logout.command.js';

@Injectable()
@CommandHandler(LogoutCommand)
export class LogoutHandler implements ICommandHandler<LogoutCommand> {
  constructor(
    private readonly tokensService: TokensService,
    private readonly refreshTokensRepository: RefreshTokensRepository,
  ) {}

  async execute(command: LogoutCommand): Promise<{ ok: true }> {
    if (command.token) {
      const payload = await this.tokensService.verifyRefresh(command.token);
      if (payload) {
        const record = await this.refreshTokensRepository.findByIdWithUser(
          payload.jti,
          payload.sub,
        );
        if (record) {
          await this.refreshTokensRepository.revoke(record.id);
        }
      }
    }
    return { ok: true };
  }
}
