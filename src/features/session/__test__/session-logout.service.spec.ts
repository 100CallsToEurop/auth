import { SessionLogoutService } from '../application/session-logout.service.js';

function createTokensServiceMock() {
  return { verifyRefresh: vi.fn() };
}

function createRefreshTokensRepositoryMock() {
  return { findProviderById: vi.fn() };
}

function createProvidersRegistryMock() {
  return { has: vi.fn(), require: vi.fn() };
}

describe('SessionLogoutService', () => {
  const tokensService = createTokensServiceMock();
  const refreshTokensRepository = createRefreshTokensRepositoryMock();
  const providersRegistry = createProvidersRegistryMock();
  const service = new SessionLogoutService(
    tokensService as never,
    refreshTokensRepository as never,
    providersRegistry as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    tokensService.verifyRefresh.mockResolvedValue({ jti: 'jti-1' });
    refreshTokensRepository.findProviderById.mockResolvedValue('authentik');
    providersRegistry.has.mockReturnValue(true);
    providersRegistry.require.mockReturnValue({
      logoutUrl: vi.fn(
        (returnTo: string) => `https://idp/logout?to=${returnTo}`,
      ),
    });
  });

  it('builds the provider logout URL for the current session', async () => {
    await expect(
      service.providerLogoutUrl('refresh-token', 'https://app.example.com'),
    ).resolves.toBe('https://idp/logout?to=https://app.example.com');

    expect(tokensService.verifyRefresh).toHaveBeenCalledWith('refresh-token');
    expect(refreshTokensRepository.findProviderById).toHaveBeenCalledWith(
      'jti-1',
    );
    expect(providersRegistry.require).toHaveBeenCalledWith('authentik');
  });

  it('returns null without a refresh token', async () => {
    await expect(
      service.providerLogoutUrl(undefined, 'https://app.example.com'),
    ).resolves.toBeNull();
    expect(tokensService.verifyRefresh).not.toHaveBeenCalled();
  });

  it('returns null when the token is invalid', async () => {
    tokensService.verifyRefresh.mockResolvedValue(null);

    await expect(
      service.providerLogoutUrl('bad-token', 'https://app.example.com'),
    ).resolves.toBeNull();
    expect(refreshTokensRepository.findProviderById).not.toHaveBeenCalled();
  });

  it('returns null for a password-created session', async () => {
    refreshTokensRepository.findProviderById.mockResolvedValue(null);

    await expect(
      service.providerLogoutUrl('refresh-token', 'https://app.example.com'),
    ).resolves.toBeNull();
    expect(providersRegistry.has).not.toHaveBeenCalled();
  });

  it('returns null for an unknown provider', async () => {
    providersRegistry.has.mockReturnValue(false);

    await expect(
      service.providerLogoutUrl('refresh-token', 'https://app.example.com'),
    ).resolves.toBeNull();
    expect(providersRegistry.require).not.toHaveBeenCalled();
  });

  it('returns null when the provider has no SSO logout', async () => {
    providersRegistry.require.mockReturnValue({});

    await expect(
      service.providerLogoutUrl('refresh-token', 'https://app.example.com'),
    ).resolves.toBeNull();
  });
});
