import { Module, forwardRef } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import { UserModule } from '../user/user.module.js';
import { SessionModule } from '../session/session.module.js';
import { ExternalAccountLinker } from './application/external-account-linker.js';
import {
  ExternalAuthGuard,
  ExternalSyncGuard,
} from './api/external-auth.guard.js';
import { ExternalController } from './api/external.controller.js';
import { ExternalProvidersRegistry } from './infrastructure/external-providers.registry.js';
import { ExternalStrategiesFactory } from './infrastructure/external-strategies.factory.js';
import {
  EXTERNAL_PROVIDERS,
  type ExternalProvider,
} from './infrastructure/providers/external-provider.js';
import { AuthentikProvider } from './infrastructure/providers/authentik.provider.js';
import { YandexProvider } from './infrastructure/providers/yandex.provider.js';
import { GitHubProvider } from './infrastructure/providers/github.provider.js';
import { InvisionProvider } from './infrastructure/providers/invision.provider.js';

@Module({
  imports: [CqrsModule, UserModule, forwardRef(() => SessionModule)],
  controllers: [ExternalController],
  providers: [
    ExternalAccountLinker,
    ExternalProvidersRegistry,
    ExternalStrategiesFactory,
    ExternalAuthGuard,
    ExternalSyncGuard,
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
  exports: [
    ExternalAccountLinker,
    ExternalProvidersRegistry,
    ExternalAuthGuard,
    ExternalSyncGuard,
  ],
})
export class ExternalModule {}
