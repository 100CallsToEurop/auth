import {
  Body,
  Controller,
  HttpCode,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { AuthUser } from '../../../libs/common/decorators/current-user.decorator.js';
import { CurrentUser } from '../../../libs/common/decorators/current-user.decorator.js';
import { Public } from '../../../libs/common/decorators/public.decorator.js';
import { emailTracker } from '../../../libs/common/throttle/trackers.js';
import { REFRESH_COOKIE } from '../../../libs/consts/session.constants.js';
import {
  clearRefreshCookie,
  sessionMeta,
  sessionResponse,
} from '../../session/api/session-http.js';
import { GetCurrentUserQuery } from '../../user/application/queries/get-current-user/get-current-user.query.js';
import { AttachPasswordCommand } from '../application/commands/attach-password/attach-password.command.js';
import { LoginCommand } from '../application/commands/login/login.command.js';
import { LogoutCommand } from '../application/commands/logout/logout.command.js';
import { RefreshCommand } from '../application/commands/refresh/refresh.command.js';
import { RegisterCommand } from '../application/commands/register/register.command.js';
import { SetPasswordCommand } from '../application/commands/set-password/set-password.command.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { SetPasswordDto } from './dto/set-password.dto.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly configService: ConfigService,
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
  @Post('register/attach-password')
  // Ограничение по email: перебор пароля к чужому SSO-аккаунту.
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 300_000, getTracker: emailTracker } })
  async attachPassword(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.commandBus.execute(
      new AttachPasswordCommand(dto.email, dto.password, sessionMeta(req)),
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

  @Put('password')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  async setPassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: SetPasswordDto,
  ) {
    await this.commandBus.execute(
      new SetPasswordCommand(user.id, dto.password, dto.currentPassword),
    );
    return this.queryBus.execute(new GetCurrentUserQuery(user.id));
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
    const result = await this.commandBus.execute(
      new LogoutCommand(req.cookies?.[REFRESH_COOKIE]),
    );
    clearRefreshCookie(res, req, this.configService);
    // Выходим только из приложения: SSO-сессия провайдера не завершается,
    // чтобы не уводить пользователя на странице провайдера.
    return result;
  }
}
