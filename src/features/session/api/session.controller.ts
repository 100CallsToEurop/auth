import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { REFRESH_COOKIE } from '../../../libs/consts/session.constants.js';
import { LogoutAllCommand } from '../application/commands/logout-all/logout-all.command.js';
import { RevokeSessionCommand } from '../application/commands/revoke-session/revoke-session.command.js';
import { ListSessionsQuery } from '../application/queries/list-sessions/list-sessions.query.js';
import { SessionLogoutService } from '../application/session-logout.service.js';
import { TokensService } from '../application/tokens.service.js';
import type { AuthUser } from '../../../libs/common/decorators/current-user.decorator.js';
import { CurrentUser } from '../../../libs/common/decorators/current-user.decorator.js';
import { clearRefreshCookie, frontendUrl } from './session-http.js';

/**
 * Управление сессиями: список устройств, отзыв одной сессии, «завершить
 * другие» и выход со всех устройств. Вход, refresh и logout текущей сессии
 * живут в auth.
 */
@Controller('auth')
export class SessionController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly configService: ConfigService,
    private readonly tokensService: TokensService,
    private readonly sessionLogoutService: SessionLogoutService,
  ) {}

  // Выход со ВСЕХ устройств: отзывает все refresh-сессии пользователя.
  @Post('logout/all')
  @HttpCode(200)
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ) {
    const logoutUrl = await this.sessionLogoutService.providerLogoutUrl(
      req.cookies?.[REFRESH_COOKIE],
      frontendUrl(this.configService),
    );
    const result = await this.commandBus.execute(
      new LogoutAllCommand(user.id, await this.currentJti(req)),
    );
    clearRefreshCookie(res, req, this.configService);
    return { ...result, logoutUrl };
  }

  // Завершить все ДРУГИЕ сессии, оставив текущую (без разлогина).
  @Post('sessions/revoke-others')
  @HttpCode(200)
  async revokeOtherSessions(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.commandBus.execute(
      new LogoutAllCommand(user.id, await this.currentJti(req), true),
    );
  }

  // Список активных сессий (устройств) текущего пользователя.
  @Get('sessions')
  async listSessions(@CurrentUser() user: AuthUser, @Req() req: Request) {
    const currentSessionId = await this.currentJti(req);
    return this.queryBus.execute(
      new ListSessionsQuery(user.id, currentSessionId),
    );
  }

  // Отзыв одной сессии по id.
  @Delete('sessions/:id')
  revokeSession(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.commandBus.execute(new RevokeSessionCommand(id, user.id));
  }

  /** jti текущей сессии из refresh-cookie (для пометки «текущая»). */
  private async currentJti(req: Request): Promise<string | undefined> {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) {
      return undefined;
    }
    const payload = await this.tokensService.verifyRefresh(token);
    return payload?.jti;
  }
}
