import { Injectable, NotFoundException } from '@nestjs/common';
import type { ExternalProvider } from '../contracts/external-provider.js';

export interface RegisteredProvider {
  slug: string;
  displayName: string;
}

/**
 * Реестр подключённых внешних провайдеров (Registry/Multiton): guard и
 * endpoint /auth/providers работают только через него.
 */
@Injectable()
export class ExternalProvidersRegistry {
  private readonly providers = new Map<string, ExternalProvider>();

  register(provider: ExternalProvider): void {
    this.providers.set(provider.slug, provider);
  }

  has(slug: string): boolean {
    return this.providers.has(slug);
  }

  require(slug: string): ExternalProvider {
    const provider = this.providers.get(slug);
    if (!provider) {
      throw new NotFoundException(`Unknown external provider "${slug}"`);
    }
    return provider;
  }

  list(): RegisteredProvider[] {
    return [...this.providers.values()].map((provider) => ({
      slug: provider.slug,
      displayName: provider.displayName,
    }));
  }
}
