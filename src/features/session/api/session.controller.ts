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
import {
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
} from '../../../constants/session.constants.js';
import { LogoutCommand } from '../application/commands/logout/logout.command.js';
import { LogoutAllCommand } from '../application/commands/logout-all/logout-all.command.js';
import { RevokeSessionCommand } from '../application/commands/revoke-session/revoke-session.command.js';
import { ListSessionsQuery } from '../application/queries/list-sessions/list-sessions.query.js';
import { RefreshCommand } from '../application/commands/refresh/refresh.command.js';
import { TokensService } from '../application/tokens.service.js';
import { RefreshTokensRepository } from '../repository/refresh-tokens.repository.js';
import type { AuthUser } from '../../../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { Public } from '../../../common/decorators/public.decorator.js';
import { frontendUrl, sessionResponse } from '../../../common/http/session-http.js';
import { ExternalProvidersRegistry } from '../../provider/infrastructure/external-providers.registry.js';

@Controller('auth')
export class SessionController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly configService: ConfigService,
    private readonly tokensService: TokensService,
    private readonly refreshTokensRepository: RefreshTokensRepository,
    private readonly providersRegistry: ExternalProvidersRegistry,
  ) {}

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.commandBus.execute(
      new RefreshCommand(req.cookies?.[REFRESH_COOKIE]),
    );
    return sessionResponse(session, res, this.configService);
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Провайдер берём из текущей сессии (каким способом вошли), а не из query.
    const logoutUrl = await this.sessionProviderLogoutUrl(req);
    const result = await this.commandBus.execute(
      new LogoutCommand(req.cookies?.[REFRESH_COOKIE]),
    );
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    // RP-initiated logout: если текущая сессия из OIDC-провайдера, отдаём URL
    // для выхода и из его SSO-сессии (фронт перейдёт по нему).
    return { ...result, logoutUrl };
  }

  // Выход со ВСЕХ устройств: отзывает все refresh-сессии пользователя.
  @Post('logout/all')
  @HttpCode(200)
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ) {
    const logoutUrl = await this.sessionProviderLogoutUrl(req);
    const result = await this.commandBus.execute(
      new LogoutAllCommand(user.id, await this.currentJti(req)),
    );
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
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

  /** URL выхода из SSO-сессии провайдера (если поддерживается). */
  private providerLogoutUrl(provider?: string | null): string | null {
    if (!provider || !this.providersRegistry.has(provider)) {
      return null;
    }
    return (
      this.providersRegistry
        .require(provider)
        .logoutUrl?.(frontendUrl(this.configService)) ?? null
    );
  }

  /**
   * URL SSO-выхода для ТЕКУЩЕЙ сессии: определяем, каким способом она была
   * создана (provider из refresh_tokens), и берём logoutUrl этого провайдера.
   */
  private async sessionProviderLogoutUrl(req: Request): Promise<string | null> {
    const jti = await this.currentJti(req);
    if (!jti) {
      return null;
    }
    const provider = await this.refreshTokensRepository.findProviderById(jti);
    return this.providerLogoutUrl(provider);
  }
}
