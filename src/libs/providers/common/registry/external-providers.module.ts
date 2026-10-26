import { Module } from '@nestjs/common';
import { ExternalProvidersRegistry } from './external-providers.registry.js';

/**
 * Листовой модуль реестра внешних провайдеров: не тянет за собой весь
 * external (провайдеры, привязку аккаунтов и callback).
 */
@Module({
  providers: [ExternalProvidersRegistry],
  exports: [ExternalProvidersRegistry],
})
export class ExternalProvidersModule {}
