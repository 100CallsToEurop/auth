import {
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
} from '@nestjs/common';
import passport from 'passport';
import { ExternalProvidersRegistry } from './external-providers.registry.js';
import {
  EXTERNAL_PROVIDERS,
  type ExternalProvider,
} from './providers/external-provider.js';

/**
 * Регистрирует включённые провайдеры в passport под их slug (Factory):
 * включение определяется конфигом — провайдер без ключей просто
 * пропускается.
 */
@Injectable()
export class ExternalStrategiesFactory implements OnModuleInit {
  private readonly logger = new Logger(ExternalStrategiesFactory.name);

  constructor(
    @Inject(EXTERNAL_PROVIDERS)
    private readonly providers: ExternalProvider[],
    private readonly registry: ExternalProvidersRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const provider of this.providers) {
      if (!provider.configured()) {
        continue;
      }
      const strategy = provider.createStrategy();
      passport.use(provider.slug, strategy);
      if (provider.init) {
        await provider.init(strategy);
      }
      this.registry.register(provider);
      this.logger.log(`Внешний провайдер включён: ${provider.slug}`);
    }

    const enabled = this.registry.list().map((item) => item.slug);
    this.logger.log(
      enabled.length
        ? `Подключённые провайдеры входа: ${enabled.join(', ')}`
        : 'Внешние провайдеры входа не подключены',
    );
  }
}
