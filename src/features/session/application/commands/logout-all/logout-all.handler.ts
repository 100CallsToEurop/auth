import { Injectable, UnauthorizedException } from '@nestjs/common';
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { RefreshTokensRepository } from '../../../infrastructure/repository/refresh-tokens.repository.js';
import { InvalidateTokensCommand } from '../invalidate-tokens/invalidate-tokens.command.js';
import { LogoutAllCommand } from './logout-all.command.js';

@Injectable()
@CommandHandler(LogoutAllCommand)
export class LogoutAllHandler implements ICommandHandler<LogoutAllCommand> {
  constructor(
    private readonly refreshTokensRepository: RefreshTokensRepository,
    private readonly commandBus: CommandBus,
  ) {}

  async execute(
    command: LogoutAllCommand,
  ): Promise<{ ok: true; revoked: number }> {
    if (!command.userId) {
      throw new UnauthorizedException();
    }

    // «Завершить другие сессии» — сохраняем текущую, если её jti известен.
    const revoked =
      command.exceptCurrent && command.currentSessionId
        ? await this.refreshTokensRepository.revokeAllByUserIdExcept(
            command.userId,
            command.currentSessionId,
          )
        : await this.refreshTokensRepository.revokeAllByUserId(command.userId);

    // Access-токены, выданные до этого момента, тоже перестают работать:
    // иначе «выйти со всех устройств» оставлял бы чужие устройства
    // рабочими до истечения срока access-токена.
    await this.commandBus.execute(new InvalidateTokensCommand(command.userId));

    return { ok: true, revoked };
  }
}
