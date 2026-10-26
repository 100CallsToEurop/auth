import type { ExternalProfile } from './external-profile.js';

/**
 * Порт, через который провайдеры связываются с аккаунтами приложения.
 * Реализация живёт в feature-модуле external (`ExternalAccountLinker`),
 * поэтому `libs/providers` не зависит от `features`.
 */
export interface ExternalAccountResolver {
  link(provider: string, profile: ExternalProfile): Promise<unknown>;
  linkProvider(
    provider: string,
    profile: ExternalProfile,
    userId: string,
  ): Promise<unknown>;
  syncProvider(
    provider: string,
    profile: ExternalProfile,
    userId: string,
  ): Promise<unknown>;
}
