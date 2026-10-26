import { createHash, randomUUID } from 'node:crypto';
import { LogoutCommand } from '../application/commands/logout/logout.command.js';
import { LogoutHandler } from '../application/commands/logout/logout.handler.js';
import { RefreshCommand } from '../application/commands/refresh/refresh.command.js';
import { RefreshHandler } from '../application/commands/refresh/refresh.handler.js';

const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

const SESSION = {
  user: { id: 'user-1', email: 'a@b.c' },
  accessToken: 'access',
  refreshToken: 'refresh',
  jti: 'new-jti',
};

function createRefreshTokensRepositoryMock() {
  return {
    findByIdWithUser: vi.fn(),
    rotate: vi.fn(),
    revoke: vi.fn(),
    revokeFamily: vi.fn(),
  };
}

function createSessionServiceMock() {
  return { start: vi.fn().mockResolvedValue(SESSION) };
}

function createBadRefreshTokensRepositoryMock() {
  return {
    isBlocked: vi.fn().mockResolvedValue(false),
    block: vi.fn().mockResolvedValue(undefined),
  };
}

function createTokensServiceMock() {
  return {
    signAccess: vi.fn(),
    signRefresh: vi.fn(),
    verifyRefresh: vi.fn(),
    decodeRefresh: vi.fn().mockReturnValue(null),
    hashToken: vi.fn((raw: string) => sha256(raw)),
  };
}

describe('RefreshHandler', () => {
  const rawToken = 'signed-refresh';
  const jti = randomUUID();
  const tokensService = createTokensServiceMock();
  const badRefreshTokensRepository = createBadRefreshTokensRepositoryMock();
  const refreshTokensRepository = createRefreshTokensRepositoryMock();
  const sessionService = createSessionServiceMock();
  const handler = new RefreshHandler(
    tokensService as never,
    badRefreshTokensRepository as never,
    refreshTokensRepository as never,
    sessionService as never,
  );

  const validRecord = {
    id: jti,
    userId: 'user-1',
    tokenHash: sha256(rawToken),
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    familyId: 'family-1',
    userAgent: 'Firefox/120',
    ip: '1.2.3.4',
    provider: 'authentik',
    user: { id: 'user-1', email: 'a@b.c' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sessionService.start.mockResolvedValue(SESSION);
    tokensService.verifyRefresh.mockResolvedValue({ sub: 'user-1', jti });
    tokensService.decodeRefresh.mockReturnValue(null);
    badRefreshTokensRepository.isBlocked.mockResolvedValue(false);
    refreshTokensRepository.findByIdWithUser.mockResolvedValue(validRecord);
    refreshTokensRepository.rotate.mockResolvedValue(true);
  });

  it('rotates a valid refresh token within the same family', async () => {
    const result = await handler.execute(new RefreshCommand(rawToken));

    expect(refreshTokensRepository.rotate).toHaveBeenCalledWith(
      jti,
      expect.any(String),
    );
    expect(sessionService.start).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-1', email: 'a@b.c' }),
      {
        userAgent: 'Firefox/120',
        ip: '1.2.3.4',
        provider: 'authentik',
        familyId: 'family-1',
        jti: expect.any(String),
      },
    );
    expect(badRefreshTokensRepository.block).not.toHaveBeenCalled();
    expect(result).toEqual(SESSION);
  });

  it('rejects a missing token', async () => {
    await expect(
      handler.execute(new RefreshCommand(undefined)),
    ).rejects.toThrow('Не передан refresh-токен');
  });

  it('rejects a token that is already in the bad-token list', async () => {
    badRefreshTokensRepository.isBlocked.mockResolvedValue(true);

    await expect(handler.execute(new RefreshCommand(rawToken))).rejects.toThrow(
      'Refresh-токен заблокирован',
    );
    expect(tokensService.verifyRefresh).not.toHaveBeenCalled();
  });

  it('remembers an invalid token until its expiration', async () => {
    const exp = Math.floor((Date.now() + 60_000) / 1000);
    tokensService.verifyRefresh.mockResolvedValue(null);
    tokensService.decodeRefresh.mockReturnValue({ sub: 'user-1', jti, exp });

    await expect(handler.execute(new RefreshCommand(rawToken))).rejects.toThrow(
      'Недействительный refresh-токен',
    );
    expect(badRefreshTokensRepository.block).toHaveBeenCalledWith(
      sha256(rawToken),
      new Date(exp * 1000),
      'invalid',
    );
    expect(refreshTokensRepository.rotate).not.toHaveBeenCalled();
  });

  it('rejects a revoked token', async () => {
    refreshTokensRepository.findByIdWithUser.mockResolvedValue(null);

    await expect(handler.execute(new RefreshCommand(rawToken))).rejects.toThrow(
      'Refresh-токен отозван',
    );
    expect(badRefreshTokensRepository.block).toHaveBeenCalledWith(
      sha256(rawToken),
      expect.any(Date),
      'unknown',
    );
  });

  it('rejects an expired token and revokes it', async () => {
    const expiredAt = new Date(Date.now() - 1000);
    refreshTokensRepository.findByIdWithUser.mockResolvedValue({
      ...validRecord,
      expiresAt: expiredAt,
    });

    await expect(handler.execute(new RefreshCommand(rawToken))).rejects.toThrow(
      'Срок действия refresh-токена истёк',
    );
    expect(refreshTokensRepository.revoke).toHaveBeenCalledWith(jti);
    expect(badRefreshTokensRepository.block).toHaveBeenCalledWith(
      sha256(rawToken),
      expiredAt,
      'expired',
    );
    expect(sessionService.start).not.toHaveBeenCalled();
  });

  it('detects reuse of an already rotated token and revokes the family', async () => {
    refreshTokensRepository.findByIdWithUser.mockResolvedValue({
      ...validRecord,
      revokedAt: new Date(),
      replacedById: 'next-jti',
    });

    await expect(handler.execute(new RefreshCommand(rawToken))).rejects.toThrow(
      'Обнаружено повторное использование refresh-токена',
    );
    expect(refreshTokensRepository.revokeFamily).toHaveBeenCalledWith(
      'family-1',
    );
    expect(badRefreshTokensRepository.block).toHaveBeenCalledWith(
      sha256(rawToken),
      expect.any(Date),
      'reuse',
    );
    expect(sessionService.start).not.toHaveBeenCalled();
  });

  it('detects reuse when the token hash does not match', async () => {
    refreshTokensRepository.findByIdWithUser.mockResolvedValue({
      ...validRecord,
      tokenHash: sha256('other-token'),
    });

    await expect(handler.execute(new RefreshCommand(rawToken))).rejects.toThrow(
      'Обнаружено повторное использование refresh-токена',
    );
    expect(refreshTokensRepository.revokeFamily).toHaveBeenCalledWith(
      'family-1',
    );
    expect(badRefreshTokensRepository.block).toHaveBeenCalledWith(
      sha256(rawToken),
      expect.any(Date),
      'reuse',
    );
    expect(sessionService.start).not.toHaveBeenCalled();
  });

  it('detects reuse when a concurrent refresh already rotated the token', async () => {
    refreshTokensRepository.rotate.mockResolvedValue(false);

    await expect(handler.execute(new RefreshCommand(rawToken))).rejects.toThrow(
      'Обнаружено повторное использование refresh-токена',
    );
    expect(refreshTokensRepository.revokeFamily).toHaveBeenCalledWith(
      'family-1',
    );
    expect(badRefreshTokensRepository.block).toHaveBeenCalledWith(
      sha256(rawToken),
      expect.any(Date),
      'reuse',
    );
    expect(sessionService.start).not.toHaveBeenCalled();
  });

  it('falls back to the token id as family for legacy records', async () => {
    refreshTokensRepository.findByIdWithUser.mockResolvedValue({
      ...validRecord,
      familyId: null,
    });

    await handler.execute(new RefreshCommand(rawToken));

    expect(sessionService.start).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ familyId: jti }),
    );
  });
});

describe('LogoutHandler', () => {
  const tokensService = createTokensServiceMock();
  const refreshTokensRepository = createRefreshTokensRepositoryMock();
  const handler = new LogoutHandler(
    tokensService as never,
    refreshTokensRepository as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    tokensService.verifyRefresh.mockResolvedValue({
      sub: 'user-1',
      jti: 'jti-1',
    });
    refreshTokensRepository.findByIdWithUser.mockResolvedValue({
      id: 'jti-1',
      userId: 'user-1',
    });
  });

  it('revokes the refresh token if present', async () => {
    await expect(
      handler.execute(new LogoutCommand('signed-refresh')),
    ).resolves.toEqual({ ok: true });
    expect(refreshTokensRepository.revoke).toHaveBeenCalledWith('jti-1');
  });

  it('succeeds without a token', async () => {
    await expect(
      handler.execute(new LogoutCommand(undefined)),
    ).resolves.toEqual({ ok: true });
    expect(refreshTokensRepository.revoke).not.toHaveBeenCalled();
  });

  it('succeeds when the token is invalid', async () => {
    tokensService.verifyRefresh.mockResolvedValue(null);

    await expect(handler.execute(new LogoutCommand('bad'))).resolves.toEqual({
      ok: true,
    });
    expect(refreshTokensRepository.revoke).not.toHaveBeenCalled();
  });
});
