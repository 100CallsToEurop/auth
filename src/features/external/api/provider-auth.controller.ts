import {
  Controller,
  Get,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Public } from '../../../libs/common/decorators/public.decorator.js';
import { AuthentikAuthGuard } from '../../../libs/providers/implementations/authentik/authentik.guard.js';
import { GithubAuthGuard } from '../../../libs/providers/implementations/github/github.guard.js';
import { InvisionAuthGuard } from '../../../libs/providers/implementations/invision/invision.guard.js';
import { YandexAuthGuard } from '../../../libs/providers/implementations/yandex/yandex.guard.js';
import {
  sessionMeta,
  setRefreshCookie,
} from '../../session/api/session-http.js';
import { SessionService } from '../../session/application/session.service.js';
import { User } from '../../user/domain/user.entity.js';

/**
 * OAuth-вход по отдельному маршруту на провайдера.
 *
 * Отличается от универсального /auth/external/:provider только ответом
 * callback: вместо редиректа на фронтенд возвращает accessToken в теле, а
 * refreshToken по-прежнему кладёт в httpOnly-cookie.
 */
@Controller('auth')
export class ProviderAuthController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Get('github')
  @UseGuards(GithubAuthGuard)
  githubAuth(): void {
    // redirect к провайдеру выполняет guard
  }

  @Public()
  @Get('github/callback')
  @UseGuards(GithubAuthGuard)
  githubAuthCallback(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    return this.complete(req, res, 'github');
  }

  @Public()
  @Get('authentik')
  @UseGuards(AuthentikAuthGuard)
  authentikAuth(): void {
    // redirect к провайдеру выполняет guard
  }

  @Public()
  @Get('authentik/callback')
  @UseGuards(AuthentikAuthGuard)
  authentikAuthCallback(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    return this.complete(req, res, 'authentik');
  }

  @Public()
  @Get('invision')
  @UseGuards(InvisionAuthGuard)
  invisionAuth(): void {
    // redirect к провайдеру выполняет guard
  }

  @Public()
  @Get('invision/callback')
  @UseGuards(InvisionAuthGuard)
  invisionAuthCallback(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    return this.complete(req, res, 'invision');
  }

  @Public()
  @Get('yandex')
  @UseGuards(YandexAuthGuard)
  yandexAuth(): void {
    // redirect к провайдеру выполняет guard
  }

  @Public()
  @Get('yandex/callback')
  @UseGuards(YandexAuthGuard)
  yandexAuthCallback(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    return this.complete(req, res, 'yandex');
  }

  /** Завершает вход: выдаёт сессию, ставит refresh-cookie и отдаёт accessToken. */
  private async complete(
    req: Request,
    res: Response,
    provider: string,
  ): Promise<{ accessToken: string }> {
    const user = req.user as User | undefined;
    if (!user?.id) {
      throw new UnauthorizedException(
        'External provider did not return a user',
      );
    }

    const session = await this.sessionService.start(
      user,
      sessionMeta(req, provider),
    );
    setRefreshCookie(res, session.refreshToken, req, this.configService);
    return { accessToken: session.accessToken };
  }
}
