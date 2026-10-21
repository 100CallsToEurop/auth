import { Injectable, UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { RefreshTokensRepository } from '../../../repository/refresh-tokens.repository.js';
import { SessionService } from '../../session.service.js';
import { TokensService } from '../../tokens.service.js';
import { RefreshCommand } from './refresh.command.js';

@Injectable()
@CommandHandler(RefreshCommand)
export class RefreshHandler implements ICommandHandler<RefreshCommand> {
  constructor(
    private readonly tokensService: TokensService,
    private readonly refreshTokensRepository: RefreshTokensRepository,
    private readonly sessionService: SessionService,
  ) {}

  async execute(command: RefreshCommand) {
    if (!command.token) {
      throw new UnauthorizedException('Missing refresh token');
    }

    const payload = await this.tokensService.verifyRefresh(command.token);
    if (!payload) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const record = await this.refreshTokensRepository.findByIdWithUser(
      payload.jti,
      payload.sub,
    );
    if (!record) {
      throw new UnauthorizedException('Refresh token revoked');
    }
    if (record.expiresAt.getTime() < Date.now()) {
      await this.refreshTokensRepository.remove(record.id);
      throw new UnauthorizedException('Refresh token expired');
    }
    if (record.tokenHash !== this.tokensService.hashToken(command.token)) {
      await this.refreshTokensRepository.remove(record.id);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    await this.refreshTokensRepository.remove(record.id);

    // переносим метаданные устройства в новую сессию (ротация токена —
    // это та же сессия пользователя)
    return this.sessionService.start(record.user, {
      userAgent: record.userAgent,
      ip: record.ip,
      provider: record.provider,
    });
  }
}
