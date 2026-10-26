import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueryBus } from '@nestjs/cqrs';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { AuthUser } from '../../../libs/common/decorators/current-user.decorator.js';
import { CurrentUser } from '../../../libs/common/decorators/current-user.decorator.js';
import { Public } from '../../../libs/common/decorators/public.decorator.js';
import type { PendingAccountLinkSignal } from '../../../libs/common/exceptions/pending-account-link.exception.js';
import { FrontendOriginGuard } from '../../../libs/common/guards/frontend-origin.guard.js';
import { pendingLinkTracker } from '../../../libs/common/throttle/trackers.js';
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
  frontendAccountLinkUrl,
  frontendLoginUrl,
  frontendUrl,
  sessionMeta,
  sessionResponse,
  setRefreshCookie,
} from '../../session/api/session-http.js';
import { SessionService } from '../../session/application/session.service.js';
import { User } from '../../user/domain/user.entity.js';
import { AccountLinkService } from '../application/account-link.service.js';
import { ExternalAccountLinker } from '../application/external-account-linker.js';
import {
  AccountLinkTokenDto,
  ConfirmAccountLinkDto,
} from './dto/account-link.dto.js';

/** Действие, которое выполнил callback провайдера помимо обычного входа. */
type ProviderFlowRequest = Request & {
  externalAction?: 'link' | 'sync';
  pendingAccountLink?: PendingAccountLinkSignal;
};

type ProviderCallbackResponse =
  | { accessToken: string }
  | ({ requiresAccountLink: true } & PendingAccountLinkSignal)
  | void;

/**
 * Callback открыт браузером (переход после OAuth), а не вызван API-клиентом.
 * Браузер при навигации присылает Accept с text/html и Sec-Fetch-Mode:
 * navigate, а fetch/curl — заголовок Accept со звёздочкой.
 */
function isBrowserNavigation(req: Request): boolean {
  const accept = req.headers.accept;
  const fetchMode = req.headers['sec-fetch-mode'];
  return (
    (typeof accept === 'string' && accept.includes('text/html')) ||
    fetchMode === 'navigate'
  );
}

/**
 * Все маршруты внешних провайдеров — отдельные для каждого провайдера:
 * вход, привязка, синхронизация профиля и отвязка.
 *
 * Callback обычного входа возвращает accessToken в теле (для API-клиентов),
 * а при открытии callback браузером — редиректит на фронтенд с токеном во
 * фрагменте URL. RefreshToken в обоих случаях кладётся в httpOnly-cookie.
 * Этот же callback обслуживает привязку и синхронизацию профиля: после них
 * браузер возвращается на фронтенд.
 */
@Controller('auth')
export class ProviderAuthController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly configService: ConfigService,
    private readonly queryBus: QueryBus,
    private readonly providersRegistry: ExternalProvidersRegistry,
    private readonly linker: ExternalAccountLinker,
    private readonly accountLinkService: AccountLinkService,
  ) {}

  // Список доступных способов входа (внешних провайдеров).
  @Public()
  @Get('providers')
  listProviders() {
    return this.providersRegistry.list();
  }

  /**
   * Данные промежуточного экрана: какой аккаунт (email) и провайдер нужно
   * связать, есть ли у аккаунта пароль для подтверждения. Токен передаётся в
   * теле, а не в URL, чтобы он не попадал в логи и историю.
   */
  @Public()
  @Post('account-link/info')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({
    default: { limit: 30, ttl: 60_000, getTracker: pendingLinkTracker },
  })
  async accountLinkInfo(@Body() dto: AccountLinkTokenDto) {
    const info = await this.accountLinkService.describe(dto.token);
    const providerName =
      this.providersRegistry
        .list()
        .find((provider) => provider.slug === info.provider)?.displayName ??
      info.provider;

    return { ...info, providerName };
  }

  /**
   * Подтверждение владения существующим аккаунтом: проверяем пароль, атомарно
   * расходуем токен, привязываем SSO-идентичность и только затем выдаём сессию.
   */
  @Public()
  @Post('account-link/confirm')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({
    default: { limit: 10, ttl: 300_000, getTracker: pendingLinkTracker },
  })
  async accountLinkConfirm(
    @Body() dto: ConfirmAccountLinkDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.accountLinkService.confirm(
      dto.token,
      dto.password,
      sessionMeta(req),
    );
    return sessionResponse(session, res, req, this.configService);
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
  ): Promise<ProviderCallbackResponse> {
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
  ): Promise<ProviderCallbackResponse> {
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
  ): Promise<ProviderCallbackResponse> {
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
  ): Promise<ProviderCallbackResponse> {
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
   * Привязка и синхронизация профиля запускаются из браузера — после них
   * возвращаем пользователя на фронтенд. Обычный вход из SPA тоже
   * возвращает браузер на фронтенд, но с accessToken во фрагменте URL.
   * Остальные клиенты получают accessToken в теле ответа.
   */
  private async complete(
    req: Request,
    res: Response,
    provider: string,
  ): Promise<ProviderCallbackResponse> {
    const flow = req as ProviderFlowRequest;

    // Email провайдера совпал с существующим аккаунтом: сессию НЕ выдаём.
    // Браузер уходит на экран подтверждения, API-клиент получает 409 с
    // одноразовым токеном.
    if (flow.pendingAccountLink) {
      if (isBrowserNavigation(req)) {
        res.redirect(
          frontendAccountLinkUrl(
            this.configService,
            flow.pendingAccountLink.linkToken,
          ),
        );
        return;
      }

      res.status(409);
      return {
        requiresAccountLink: true,
        ...flow.pendingAccountLink,
      };
    }

    const user = req.user as User | undefined;
    if (!user?.id) {
      throw new UnauthorizedException(
        'Внешний провайдер не вернул пользователя',
      );
    }

    const session = await this.sessionService.start(
      user,
      sessionMeta(req, provider),
    );
    setRefreshCookie(res, session.refreshToken, req, this.configService);

    if (flow.externalAction) {
      res.redirect(frontendUrl(this.configService));
      return;
    }

    if (isBrowserNavigation(req)) {
      res.redirect(frontendLoginUrl(this.configService, session.accessToken));
      return;
    }

    return { accessToken: session.accessToken };
  }
}
