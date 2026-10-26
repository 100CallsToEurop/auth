import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import passport from 'passport';
import { ExternalProvidersRegistry } from './external-providers.registry.js';
import { EXTERNAL_PROVIDERS } from '../../../consts/external.constants.js';
import type { ExternalProvider } from '../contracts/external-provider.js';

/**
 * Регистрирует всех внешних провайдеров в passport под их slug (Factory).
 * Проверки наличия ключей нет: провайдеры считаются подключёнными по
 * умолчанию, а ошибка конфигурации только логируется и не мешает старту.
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
      this.registry.register(provider);
      try {
        const strategy = provider.createStrategy();
        passport.use(provider.slug, strategy);
        if (provider.init) {
          await provider.init(strategy);
        }
        this.logger.log(`Внешний провайдер подключён: ${provider.slug}`);
      } catch (error) {
        this.logger.warn(
          `Внешний провайдер "${provider.slug}" зарегистрирован, но стратегия не создана: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const connected = this.registry.list().map((item) => item.slug);
    this.logger.log(`Подключённые провайдеры входа: ${connected.join(', ')}`);
  }
}
