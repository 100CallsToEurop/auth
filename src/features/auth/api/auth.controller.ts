import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandBus } from '@nestjs/cqrs';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../../../libs/common/decorators/public.decorator.js';
import { emailTracker } from '../../../libs/common/throttle/trackers.js';
import { REFRESH_COOKIE } from '../../../libs/consts/session.constants.js';
import { SessionLogoutService } from '../../session/application/session-logout.service.js';
import {
  clearRefreshCookie,
  frontendUrl,
  sessionMeta,
  sessionResponse,
} from '../../session/api/session-http.js';
import { LoginCommand } from '../application/commands/login/login.command.js';
import { LogoutCommand } from '../application/commands/logout/logout.command.js';
import { RefreshCommand } from '../application/commands/refresh/refresh.command.js';
import { RegisterCommand } from '../application/commands/register/register.command.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly configService: ConfigService,
    private readonly sessionLogoutService: SessionLogoutService,
  ) {}

  @Public()
  @Post('register')
  // Регистрация ограничивается по IP: массовое создание аккаунтов.
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.commandBus.execute(
      new RegisterCommand(dto.email, dto.password, sessionMeta(req)),
    );
    return sessionResponse(session, res, req, this.configService);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  // Вход ограничивается по email: перебор одного пароля нельзя «размазать»
  // по разным IP.
  @Throttle({ default: { limit: 10, ttl: 300_000, getTracker: emailTracker } })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.commandBus.execute(
      new LoginCommand(dto.email, dto.password, sessionMeta(req)),
    );
    return sessionResponse(session, res, req, this.configService);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  // Обновление токена: ограничиваем, чтобы нельзя было «молотить» подбором
  // refresh-токенов.
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.commandBus.execute(
      new RefreshCommand(req.cookies?.[REFRESH_COOKIE]),
    );
    return sessionResponse(session, res, req, this.configService);
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // Провайдер берём из текущей сессии (каким способом вошли), а не из query.
    const logoutUrl = await this.sessionLogoutService.providerLogoutUrl(
      req.cookies?.[REFRESH_COOKIE],
      frontendUrl(this.configService),
    );
    const result = await this.commandBus.execute(
      new LogoutCommand(req.cookies?.[REFRESH_COOKIE]),
    );
    clearRefreshCookie(res, req, this.configService);
    // RP-initiated logout: если текущая сессия из OIDC-провайдера, отдаём URL
    // для выхода и из его SSO-сессии (фронт перейдёт по нему).
    return { ...result, logoutUrl };
  }
}
