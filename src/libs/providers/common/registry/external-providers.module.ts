import { Module } from '@nestjs/common';
import { ExternalProvidersRegistry } from './external-providers.registry.js';

/**
 * Листовой модуль реестра внешних провайдеров. Нужен session-модулю для
 * SSO-выхода, поэтому не должен тянуть за собой весь external (провайдеры,
 * привязку аккаунтов и callback).
 */
@Module({
  providers: [ExternalProvidersRegistry],
  exports: [ExternalProvidersRegistry],
})
export class ExternalProvidersModule {}
