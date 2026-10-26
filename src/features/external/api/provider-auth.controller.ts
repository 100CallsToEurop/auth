import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueryBus } from '@nestjs/cqrs';
import type { Request, Response } from 'express';
import type { AuthUser } from '../../../libs/common/decorators/current-user.decorator.js';
import { CurrentUser } from '../../../libs/common/decorators/current-user.decorator.js';
import { Public } from '../../../libs/common/decorators/public.decorator.js';
import { FrontendOriginGuard } from '../../../libs/common/guards/frontend-origin.guard.js';
import {
  AuthentikAuthGuard,
  AuthentikLinkGuard,
  AuthentikSyncGuard,
} from '../../../libs/providers/implementations/authentik/authentik.guard.js';
import {
  GithubAuthGuard,
  GithubLinkGuard,
  GithubSyncGuard,
} from '../../../libs/providers/implementations/github/github.guard.js';
import {
  InvisionAuthGuard,
  InvisionLinkGuard,
  InvisionSyncGuard,
} from '../../../libs/providers/implementations/invision/invision.guard.js';
import {
  YandexAuthGuard,
  YandexLinkGuard,
  YandexSyncGuard,
} from '../../../libs/providers/implementations/yandex/yandex.guard.js';
import { ExternalProvidersRegistry } from '../../../libs/providers/common/registry/external-providers.registry.js';
import { GetCurrentUserQuery } from '../../user/application/queries/get-current-user/get-current-user.query.js';
import {
  frontendUrl,
  sessionMeta,
  setRefreshCookie,
} from '../../session/api/session-http.js';
import { SessionService } from '../../session/application/session.service.js';
import { User } from '../../user/domain/user.entity.js';
import { ExternalAccountLinker } from '../application/external-account-linker.js';

/** Действие, которое выполнил callback провайдера помимо обычного входа. */
type ProviderFlowRequest = Request & {
  externalAction?: 'link' | 'sync';
};

/**
 * Все маршруты внешних провайдеров — отдельные для каждого провайдера:
 * вход, привязка, синхронизация профиля и отвязка.
 *
 * Callback обычного входа возвращает accessToken в теле, а refreshToken
 * кладёт в httpOnly-cookie. Этот же callback обслуживает привязку и
 * синхронизацию профиля: после них браузер возвращается на фронтенд.
 */
@Controller('auth')
export class ProviderAuthController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly configService: ConfigService,
    private readonly queryBus: QueryBus,
    private readonly providersRegistry: ExternalProvidersRegistry,
    private readonly linker: ExternalAccountLinker,
  ) {}

  // Список доступных способов входа (внешних провайдеров).
  @Public()
  @Get('providers')
  listProviders() {
    return this.providersRegistry.list();
  }

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
  ): Promise<{ accessToken: string } | void> {
    return this.complete(req, res, 'github');
  }

  // Привязка и синхронизация — только POST: состояние меняется, а
  // refresh-cookie на кросс-сайтовом POST не отправляется (SameSite=Lax).
  @Public()
  @Post('github/link')
  @HttpCode(302)
  @UseGuards(FrontendOriginGuard, GithubLinkGuard)
  githubLink(): void {
    // redirect к провайдеру выполняет guard
  }

  @Public()
  @Post('github/sync')
  @HttpCode(302)
  @UseGuards(FrontendOriginGuard, GithubSyncGuard)
  githubSync(): void {
    // redirect к провайдеру выполняет guard
  }

  @Delete('github')
  async unlinkGithub(@CurrentUser() user: AuthUser) {
    return this.unlink(user, 'github');
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
  ): Promise<{ accessToken: string } | void> {
    return this.complete(req, res, 'authentik');
  }

  @Public()
  @Post('authentik/link')
  @HttpCode(302)
  @UseGuards(FrontendOriginGuard, AuthentikLinkGuard)
  authentikLink(): void {
    // redirect к провайдеру выполняет guard
  }

  @Public()
  @Post('authentik/sync')
  @HttpCode(302)
  @UseGuards(FrontendOriginGuard, AuthentikSyncGuard)
  authentikSync(): void {
    // redirect к провайдеру выполняет guard
  }

  @Delete('authentik')
  async unlinkAuthentik(@CurrentUser() user: AuthUser) {
    return this.unlink(user, 'authentik');
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
  ): Promise<{ accessToken: string } | void> {
    return this.complete(req, res, 'invision');
  }

  @Public()
  @Post('invision/link')
  @HttpCode(302)
  @UseGuards(FrontendOriginGuard, InvisionLinkGuard)
  invisionLink(): void {
    // redirect к провайдеру выполняет guard
  }

  @Public()
  @Post('invision/sync')
  @HttpCode(302)
  @UseGuards(FrontendOriginGuard, InvisionSyncGuard)
  invisionSync(): void {
    // redirect к провайдеру выполняет guard
  }

  @Delete('invision')
  async unlinkInvision(@CurrentUser() user: AuthUser) {
    return this.unlink(user, 'invision');
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
  ): Promise<{ accessToken: string } | void> {
    return this.complete(req, res, 'yandex');
  }

  @Public()
  @Post('yandex/link')
  @HttpCode(302)
  @UseGuards(FrontendOriginGuard, YandexLinkGuard)
  yandexLink(): void {
    // redirect к провайдеру выполняет guard
  }

  @Public()
  @Post('yandex/sync')
  @HttpCode(302)
  @UseGuards(FrontendOriginGuard, YandexSyncGuard)
  yandexSync(): void {
    // redirect к провайдеру выполняет guard
  }

  @Delete('yandex')
  async unlinkYandex(@CurrentUser() user: AuthUser) {
    return this.unlink(user, 'yandex');
  }

  /** Отвязка способа входа от текущего аккаунта. */
  private async unlink(user: AuthUser, provider: string) {
    await this.linker.unlink(provider, user.id);
    return this.queryBus.execute(new GetCurrentUserQuery(user.id));
  }

  /**
   * Завершает OAuth-flow: выдаёт сессию и ставит refresh-cookie.
   *
   * Обычный вход отдаёт accessToken в теле (для API-клиентов). Привязка и
   * синхронизация профиля запускаются из браузера, поэтому после них
   * возвращаем пользователя на фронтенд.
   */
  private async complete(
    req: Request,
    res: Response,
    provider: string,
  ): Promise<{ accessToken: string } | void> {
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

    if ((req as ProviderFlowRequest).externalAction) {
      res.redirect(frontendUrl(this.configService));
      return;
    }

    return { accessToken: session.accessToken };
  }
}
