import { Injectable } from '@nestjs/common';
import { ExternalProvidersRegistry } from '../../../libs/providers/common/registry/external-providers.registry.js';
import { RefreshTokensRepository } from '../infrastructure/repository/refresh-tokens.repository.js';
import { TokensService } from './tokens.service.js';

/**
 * URL SSO-выхода для текущей сессии: определяем, каким способом она была
 * создана (provider из refresh_tokens), и берём logoutUrl этого провайдера.
 *
 * Живёт в session, потому что опирается на refresh-сессию. Auth использует
 * его для logout, session — для logout/all и отзыва сессий.
 */
@Injectable()
export class SessionLogoutService {
  constructor(
    private readonly tokensService: TokensService,
    private readonly refreshTokensRepository: RefreshTokensRepository,
    private readonly providersRegistry: ExternalProvidersRegistry,
  ) {}

  async providerLogoutUrl(
    refreshToken: string | undefined,
    returnTo: string,
  ): Promise<string | null> {
    if (!refreshToken) {
      return null;
    }
    const payload = await this.tokensService.verifyRefresh(refreshToken);
    if (!payload) {
      return null;
    }

    const provider = await this.refreshTokensRepository.findProviderById(
      payload.jti,
    );
    if (!provider || !this.providersRegistry.has(provider)) {
      return null;
    }

    return (
      this.providersRegistry.require(provider).logoutUrl?.(returnTo) ?? null
    );
  }
}
