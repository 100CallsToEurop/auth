import { Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalModule } from '../external/external.module.js';
import { ExternalAccountLinker } from '../external/application/external-account-linker.js';
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

/**
 * Провайдеры внешнего входа: адаптеры (Authentik/Яндекс/GitHub/Invision),
 * реестр подключённых провайдеров и регистрация passport-стратегий.
 *
 * Фабрика EXTERNAL_PROVIDERS собирает адаптеры, которым нужен
 * ExternalAccountLinker из ExternalModule (линковка внешнего аккаунта).
 */
@Module({
  imports: [forwardRef(() => ExternalModule)],
  providers: [
    ExternalProvidersRegistry,
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
  exports: [ExternalProvidersRegistry, EXTERNAL_PROVIDERS],
})
export class ProviderModule {}
