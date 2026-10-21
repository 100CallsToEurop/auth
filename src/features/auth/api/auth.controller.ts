import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import {
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  REFRESH_TOKEN_TTL_MS,
} from '../application/auth.constants.js';
import { LoginCommand } from '../application/commands/login/login.command.js';
import { LogoutCommand } from '../application/commands/logout/logout.command.js';
import { LogoutAllCommand } from '../application/commands/logout-all/logout-all.command.js';
import { RevokeSessionCommand } from '../application/commands/revoke-session/revoke-session.command.js';
import { ListSessionsQuery } from '../application/queries/list-sessions/list-sessions.query.js';
import { RefreshCommand } from '../application/commands/refresh/refresh.command.js';
import { RegisterCommand } from '../application/commands/register/register.command.js';
import { GetCurrentUserQuery } from '../../user/application/queries/get-current-user/get-current-user.query.js';
import type { IssuedSession } from '../application/session.service.js';
import type { AuthUser } from '../../../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { Public } from '../../../common/decorators/public.decorator.js';
import { ExternalAccountLinker } from '../external/application/external-account-linker.js';
import {
  ExternalAuthGuard,
  ExternalSyncGuard,
} from '../external/api/external-auth.guard.js';
import { ExternalProvidersRegistry } from '../external/infrastructure/external-providers.registry.js';
import { SessionService, type SessionMeta } from '../application/session.service.js';
import { TokensService } from '../application/tokens.service.js';
import { User } from '../../user/domain/user.entity.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly configService: ConfigService,
    private readonly sessionService: SessionService,
    private readonly tokensService: TokensService,
    private readonly providersRegistry: ExternalProvidersRegistry,
    private readonly linker: ExternalAccountLinker,
  ) {}

  @Public()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.commandBus.execute(
      new RegisterCommand(dto.email, dto.password, this.sessionMeta(req)),
    );
    return this.toResponse(session, res);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.commandBus.execute(
      new LoginCommand(dto.email, dto.password, this.sessionMeta(req)),
    );
    return this.toResponse(session, res);
  }

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
    return this.toResponse(session, res);
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query('provider') provider?: string,
  ) {
    const result = await this.commandBus.execute(
      new LogoutCommand(req.cookies?.[REFRESH_COOKIE]),
    );
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    // RP-initiated logout: если указан OIDC-провайдер, отдаём URL для выхода
    // и из его SSO-сессии (фронт перейдёт по нему).
    return { ...result, logoutUrl: this.providerLogoutUrl(provider) };
  }

  // Выход со ВСЕХ устройств: отзывает все refresh-сессии пользователя.
  @Post('logout/all')
  @HttpCode(200)
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
    @Query('provider') provider?: string,
  ) {
    const result = await this.commandBus.execute(
      new LogoutAllCommand(user.id, await this.currentJti(req)),
    );
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    return { ...result, logoutUrl: this.providerLogoutUrl(provider) };
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
    return this.queryBus.execute(new ListSessionsQuery(user.id, currentSessionId));
  }

  // Отзыв одной сессии по id.
  @Delete('sessions/:id')
  revokeSession(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.commandBus.execute(new RevokeSessionCommand(id, user.id));
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.queryBus.execute(new GetCurrentUserQuery(user.id));
  }

  @Public()
  @Get('providers')
  listProviders() {
    return this.providersRegistry.list();
  }

  // Синхронизация профиля из провайдера. Профиль обновляется ТОЛЬКО при этом
  // запросе (обычный вход данные не трогает). GET запускает OAuth-редирект к
  // выбранному провайдеру (используется как ссылка в UI), затем callback сам
  // сохранит свежие данные.
  @Public()
  @Get('external/:provider/sync')
  @UseGuards(ExternalSyncGuard)
  startExternalProviderSyncGet() {
    // redirect к провайдеру выполняет guard
  }

  @Post('external/:provider/sync')
  @HttpCode(302)
  @UseGuards(ExternalSyncGuard)
  startExternalProviderSync() {
    // redirect к провайдеру выполняет guard
  }

  // Отвязка способа входа от текущего аккаунта.
  @Delete('external/:provider')
  async unlinkExternalProvider(
    @CurrentUser() user: AuthUser,
    @Param('provider') provider: string,
  ) {
    await this.linker.unlink(provider, user.id);
    return this.queryBus.execute(new GetCurrentUserQuery(user.id));
  }

  @Public()
  @Get('external/:provider')
  @UseGuards(ExternalAuthGuard)
  async authWithExternalProvider() {
    // Passport initiates redirect to the provider
  }

  @Public()
  @Get('external/:provider/callback')
  @UseGuards(ExternalAuthGuard)
  async externalProviderCallback(@Req() req: Request, @Res() res: Response) {
    return this.completeExternalFlow(req, res);
  }

  // Алиасы для совместимости: текущий фронт ходит в /auth/oidc/authentik
  @Public()
  @Get('oidc/authentik')
  @UseGuards(ExternalAuthGuard)
  async authWithAuthentik() {
    // Passport initiates redirect to Authentik
  }

  @Public()
  @Get('oidc/authentik/callback')
  @UseGuards(ExternalAuthGuard)
  async authWithAuthentikCallback(@Req() req: Request, @Res() res: Response) {
    return this.completeExternalFlow(req, res);
  }

  private async completeExternalFlow(req: Request, res: Response) {
    const user = req.user as User | undefined;
    if (!user?.id) {
      throw new UnauthorizedException('External provider did not return a user');
    }
    const session = await this.sessionService.start(user);
    this.setRefreshCookie(res, session.refreshToken);
    return res.redirect(this.frontendUrl());
  }

  private frontendUrl(): string {
    return (
      this.configService.get<string>('FRONTEND_URL') ||
      'http://localhost:3000'
    );
  }

  /** Метаданные клиента для списка активных сессий. */
  private sessionMeta(req: Request): SessionMeta {
    const forwarded = req.headers['x-forwarded-for'];
    const forwardedIp = Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded?.split(',')[0];
    return {
      userAgent: req.headers['user-agent']?.slice(0, 512) ?? null,
      ip: (forwardedIp?.trim() || req.ip) ?? null,
    };
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
  private providerLogoutUrl(provider?: string): string | null {
    if (!provider || !this.providersRegistry.has(provider)) {
      return null;
    }
    return this.providersRegistry
      .require(provider)
      .logoutUrl?.(this.frontendUrl()) ?? null;
  }

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.configService.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      maxAge: REFRESH_TOKEN_TTL_MS,
    });
  }

  private toResponse(
    session: IssuedSession,
    res: Response,
  ): {
    user: IssuedSession['user'];
    accessToken: string;
  } {
    this.setRefreshCookie(res, session.refreshToken);
    return { user: session.user, accessToken: session.accessToken };
  }
}
