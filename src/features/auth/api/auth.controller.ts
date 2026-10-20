import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
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
import { SessionService } from '../application/session.service.js';
import { User } from '../../user/domain/user.entity.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly configService: ConfigService,
    private readonly sessionService: SessionService,
    private readonly providersRegistry: ExternalProvidersRegistry,
    private readonly linker: ExternalAccountLinker,
  ) {}

  @Public()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.commandBus.execute(
      new RegisterCommand(dto.email, dto.password),
    );
    return this.toResponse(session, res);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.commandBus.execute(
      new LoginCommand(dto.email, dto.password),
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
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.commandBus.execute(
      new LogoutCommand(req.cookies?.[REFRESH_COOKIE]),
    );
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    return result;
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
