import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { SessionModule } from '../session/session.module.js';
import { UserModule } from '../user/user.module.js';
import { ExternalAccountLinker } from './application/external-account-linker.js';
import { ProviderAuthController } from './api/provider-auth.controller.js';
import { FrontendOriginGuard } from '../../libs/common/guards/frontend-origin.guard.js';
import { ExternalProvidersModule } from '../../libs/providers/common/registry/external-providers.module.js';
import { ExternalStrategiesFactory } from '../../libs/providers/common/registry/external-strategies.factory.js';
import {
  AuthentikAuthGuard,
  AuthentikLinkGuard,
  AuthentikSyncGuard,
} from '../../libs/providers/implementations/authentik/authentik.guard.js';
import { AuthentikProvider } from '../../libs/providers/implementations/authentik/authentik.provider.js';
import { EXTERNAL_PROVIDERS } from '../../libs/consts/external.constants.js';
import type { ExternalProvider } from '../../libs/providers/common/contracts/external-provider.js';
import {
  GithubAuthGuard,
  GithubLinkGuard,
  GithubSyncGuard,
} from '../../libs/providers/implementations/github/github.guard.js';
import { GitHubProvider } from '../../libs/providers/implementations/github/github.provider.js';
import {
  InvisionAuthGuard,
  InvisionLinkGuard,
  InvisionSyncGuard,
} from '../../libs/providers/implementations/invision/invision.guard.js';
import { InvisionProvider } from '../../libs/providers/implementations/invision/invision.provider.js';
import {
  YandexAuthGuard,
  YandexLinkGuard,
  YandexSyncGuard,
} from '../../libs/providers/implementations/yandex/yandex.guard.js';
import { YandexProvider } from '../../libs/providers/implementations/yandex/yandex.provider.js';

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
  controllers: [ProviderAuthController],
  providers: [
    ExternalAccountLinker,
    GithubAuthGuard,
    GithubLinkGuard,
    GithubSyncGuard,
    AuthentikAuthGuard,
    AuthentikLinkGuard,
    AuthentikSyncGuard,
    InvisionAuthGuard,
    InvisionLinkGuard,
    InvisionSyncGuard,
    YandexAuthGuard,
    YandexLinkGuard,
    YandexSyncGuard,
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
