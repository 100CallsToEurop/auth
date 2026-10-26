import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { SessionModule } from '../session/session.module.js';
import { UserModule } from '../user/user.module.js';
import { ExternalAccountLinker } from './application/external-account-linker.js';
import { ExternalController } from './api/external.controller.js';
import { ProviderAuthController } from './api/provider-auth.controller.js';
import {
  ExternalAuthGuard,
  ExternalLinkGuard,
  ExternalSyncGuard,
} from '../../libs/common/guards/external-auth.guard.js';
import { FrontendOriginGuard } from '../../libs/common/guards/frontend-origin.guard.js';
import { ExternalProvidersModule } from '../../libs/providers/common/registry/external-providers.module.js';
import { ExternalStrategiesFactory } from '../../libs/providers/common/registry/external-strategies.factory.js';
import { AuthentikProvider } from '../../libs/providers/implementations/authentik/authentik.provider.js';
import { AuthentikAuthGuard } from '../../libs/providers/implementations/authentik/authentik.guard.js';
import { EXTERNAL_PROVIDERS } from '../../libs/consts/external.constants.js';
import type { ExternalProvider } from '../../libs/providers/common/contracts/external-provider.js';
import { GitHubProvider } from '../../libs/providers/implementations/github/github.provider.js';
import { GithubAuthGuard } from '../../libs/providers/implementations/github/github.guard.js';
import { InvisionProvider } from '../../libs/providers/implementations/invision/invision.provider.js';
import { InvisionAuthGuard } from '../../libs/providers/implementations/invision/invision.guard.js';
import { YandexProvider } from '../../libs/providers/implementations/yandex/yandex.provider.js';
import { YandexAuthGuard } from '../../libs/providers/implementations/yandex/yandex.guard.js';

/**
 * Внешний вход: провайдеры (Authentik/Яндекс/GitHub/Invision), их стратегии и
 * привязка внешних аккаунтов к локальным пользователям.
 *
 * Зависит от user (аккаунты) и session (выдача сессии), но ни один из них не
 * зависит от external. Реестр провайдеров вынесен в листовой
 * ExternalProvidersModule, чтобы session мог использовать его без цикла.
 */
@Module({
  imports: [CqrsModule, UserModule, SessionModule, ExternalProvidersModule],
  controllers: [ExternalController, ProviderAuthController],
  providers: [
    ExternalAccountLinker,
    ExternalAuthGuard,
    ExternalSyncGuard,
    ExternalLinkGuard,
    GithubAuthGuard,
    AuthentikAuthGuard,
    InvisionAuthGuard,
    YandexAuthGuard,
    FrontendOriginGuard,
    ExternalStrategiesFactory,
    {
      provide: EXTERNAL_PROVIDERS,
      inject: [ConfigService, ExternalAccountLinker],
      useFactory: (
        configService: ConfigService,
        linker: ExternalAccountLinker,
      ): ExternalProvider[] => [
        new AuthentikProvider(configService, linker),
        new YandexProvider(configService, linker),
        new GitHubProvider(configService, linker),
        new InvisionProvider(configService, linker),
      ],
    },
  ],
  exports: [ExternalAccountLinker],
})
export class ExternalModule {}
