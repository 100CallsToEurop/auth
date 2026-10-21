import {
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
import { QueryBus } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { GetCurrentUserQuery } from '../../user/application/queries/get-current-user/get-current-user.query.js';
import { SessionService } from '../../session/application/session.service.js';
import type { AuthUser } from '../../../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { Public } from '../../../common/decorators/public.decorator.js';
import { frontendUrl, sessionMeta, setRefreshCookie } from '../../../common/http/session-http.js';
import { User } from '../../user/domain/user.entity.js';
import { ExternalAccountLinker } from '../application/external-account-linker.js';
import { ExternalProvidersRegistry } from '../infrastructure/external-providers.registry.js';
import { ExternalAuthGuard, ExternalSyncGuard } from './external-auth.guard.js';

@Controller('auth')
export class ExternalController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly configService: ConfigService,
    private readonly sessionService: SessionService,
    private readonly providersRegistry: ExternalProvidersRegistry,
    private readonly linker: ExternalAccountLinker,
  ) {}

  // Список доступных способов входа (внешних провайдеров).
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

  private async completeExternalFlow(req: Request, res: Response) {
    const user = req.user as User | undefined;
    if (!user?.id) {
      throw new UnauthorizedException('External provider did not return a user');
    }
    const provider = this.externalProviderSlug(req);
    const session = await this.sessionService.start(
      user,
      sessionMeta(req, provider),
    );
    setRefreshCookie(res, session.refreshToken, this.configService);
    return res.redirect(frontendUrl(this.configService));
  }

  /** Слаг провайдера из маршрута (:provider). */
  private externalProviderSlug(req: Request): string {
    const param = req.params?.provider;
    return typeof param === 'string' && param.length > 0 ? param : 'external';
  }
}
