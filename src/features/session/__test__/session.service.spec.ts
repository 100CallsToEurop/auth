import { RefreshTokensRepository } from '../infrastructure/repository/refresh-tokens.repository.js';
import { SessionService } from '../application/session.service.js';
import { TokensService } from '../application/tokens.service.js';
import { TokenVersionsRepository } from '../infrastructure/repository/token-versions.repository.js';

describe('SessionService', () => {
  const tokensService = {
    signAccess: vi.fn().mockResolvedValue('access-token'),
    signRefresh: vi.fn().mockImplementation(async () => 'refresh-token'),
    hashToken: vi.fn((raw: string) => `hash:${raw}`),
  };
  const tokenVersionsRepository = {
    findVersion: vi.fn().mockResolvedValue(0),
  };
  const refreshTokensRepository = {
    create: vi.fn().mockResolvedValue(undefined),
    purgeStale: vi.fn().mockResolvedValue(0),
  };

  const service = new SessionService(
    tokensService as unknown as TokensService,
    tokenVersionsRepository as unknown as TokenVersionsRepository,
    refreshTokensRepository as unknown as RefreshTokensRepository,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    tokensService.signAccess.mockResolvedValue('access-token');
    tokensService.signRefresh.mockResolvedValue('refresh-token');
    tokenVersionsRepository.findVersion.mockResolvedValue(0);
    refreshTokensRepository.create.mockResolvedValue(undefined);
  });

  it('issues tokens and persists the refresh token record', async () => {
    const result = await service.start({
      id: 'user-1',
      email: 'a@b.c',
      firstName: 'Иван',
      lastName: 'Иванов',
      displayName: 'Иванов Иван',
    });

    expect(result).toEqual({
      user: {
        id: 'user-1',
        email: 'a@b.c',
        firstName: 'Иван',
        lastName: 'Иванов',
        displayName: 'Иванов Иван',
      },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      jti: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      ),
    });

    expect(tokensService.signAccess).toHaveBeenCalledWith('user-1', 'a@b.c', 0);
    expect(tokensService.signRefresh).toHaveBeenCalledTimes(1);

    const record = refreshTokensRepository.create.mock.calls[0][0];
    expect(record.userId).toBe('user-1');
    expect(record.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(record.tokenHash).toBe('hash:refresh-token');
    expect(record.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('persists client metadata for the active sessions list', async () => {
    await service.start(
      { id: 'user-1', email: 'a@b.c' },
      { userAgent: 'Firefox/120', ip: '1.2.3.4', provider: 'authentik' },
    );

    const record = refreshTokensRepository.create.mock.calls[0][0];
    expect(record.userAgent).toBe('Firefox/120');
    expect(record.ip).toBe('1.2.3.4');
    expect(record.provider).toBe('authentik');
  });

  it('defaults metadata to null when omitted', async () => {
    await service.start({ id: 'user-1', email: 'a@b.c' });

    const record = refreshTokensRepository.create.mock.calls[0][0];
    expect(record.userAgent).toBeNull();
    expect(record.ip).toBeNull();
    expect(record.provider).toBeNull();
  });

  it('starts a new token family for a fresh session', async () => {
    await service.start({ id: 'user-1', email: 'a@b.c' });

    const record = refreshTokensRepository.create.mock.calls[0][0];
    expect(record.familyId).toBe(record.id);
  });

  it('keeps the token family when the session is rotated', async () => {
    await service.start(
      { id: 'user-1', email: 'a@b.c' },
      { familyId: 'family-1', jti: 'jti-2' },
    );

    const record = refreshTokensRepository.create.mock.calls[0][0];
    expect(record.id).toBe('jti-2');
    expect(record.familyId).toBe('family-1');
  });

  it('passes the current token version into the access token', async () => {
    tokenVersionsRepository.findVersion.mockResolvedValue(3);

    await service.start({ id: 'user-1', email: 'a@b.c' });

    expect(tokenVersionsRepository.findVersion).toHaveBeenCalledWith('user-1');
    expect(tokensService.signAccess).toHaveBeenCalledWith('user-1', 'a@b.c', 3);
  });
});
