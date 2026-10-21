import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { LoginCommand } from '../application/commands/login/login.command.js';
import { RegisterCommand } from '../application/commands/register/register.command.js';
import { GetCurrentUserQuery } from '../../user/application/queries/get-current-user/get-current-user.query.js';
import { sessionMeta, sessionResponse } from '../../../common/http/session-http.js';
import type { AuthUser } from '../../../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { Public } from '../../../common/decorators/public.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.commandBus.execute(
      new RegisterCommand(dto.email, dto.password, sessionMeta(req)),
    );
    return sessionResponse(session, res, this.configService);
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
      new LoginCommand(dto.email, dto.password, sessionMeta(req)),
    );
    return sessionResponse(session, res, this.configService);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.queryBus.execute(new GetCurrentUserQuery(user.id));
  }
}
