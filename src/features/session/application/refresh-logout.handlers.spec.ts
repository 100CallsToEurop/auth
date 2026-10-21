import { createHash, randomUUID } from 'node:crypto';
import { LogoutCommand } from './commands/logout/logout.command.js';
import { LogoutHandler } from './commands/logout/logout.handler.js';
import { RefreshCommand } from './commands/refresh/refresh.command.js';
import { RefreshHandler } from './commands/refresh/refresh.handler.js';

const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

const SESSION = {
  user: { id: 'user-1', email: 'a@b.c' },
  accessToken: 'access',
  refreshToken: 'refresh',
};

function createRefreshTokensRepositoryMock() {
  return {
    findByIdWithUser: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
  };
}

function createSessionServiceMock() {
  return { start: vi.fn().mockResolvedValue(SESSION) };
}

function createTokensServiceMock() {
  return {
    signAccess: vi.fn(),
    signRefresh: vi.fn(),
    verifyRefresh: vi.fn(),
    hashToken: vi.fn((raw: string) => sha256(raw)),
  };
}

describe('RefreshHandler', () => {
  const rawToken = 'signed-refresh';
  const jti = randomUUID();
  const tokensService = createTokensServiceMock();
  const refreshTokensRepository = createRefreshTokensRepositoryMock();
  const sessionService = createSessionServiceMock();
  const handler = new RefreshHandler(
    tokensService as never,
    refreshTokensRepository as never,
    sessionService as never,
  );

  const validRecord = {
    id: jti,
    userId: 'user-1',
    tokenHash: sha256(rawToken),
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: 'user-1', email: 'a@b.c' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sessionService.start.mockResolvedValue(SESSION);
    tokensService.verifyRefresh.mockResolvedValue({ sub: 'user-1', jti });
    refreshTokensRepository.findByIdWithUser.mockResolvedValue(validRecord);
  });

  it('rotates a valid refresh token', async () => {
    const result = await handler.execute(new RefreshCommand(rawToken));

    expect(refreshTokensRepository.remove).toHaveBeenCalledWith(jti);
    expect(sessionService.start).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-1', email: 'a@b.c' }),
      { userAgent: undefined, ip: undefined, provider: undefined },
    );
    expect(result).toEqual(SESSION);
  });

  it('rejects a missing token', async () => {
    await expect(handler.execute(new RefreshCommand(undefined))).rejects.toThrow(
      'Missing refresh token',
    );
  });

  it('rejects an invalid signature', async () => {
    tokensService.verifyRefresh.mockResolvedValue(null);

    await expect(handler.execute(new RefreshCommand(rawToken))).rejects.toThrow(
      'Invalid refresh token',
    );
    expect(refreshTokensRepository.remove).not.toHaveBeenCalled();
  });

  it('rejects a revoked token', async () => {
    refreshTokensRepository.findByIdWithUser.mockResolvedValue(null);

    await expect(handler.execute(new RefreshCommand(rawToken))).rejects.toThrow(
      'Refresh token revoked',
    );
  });

  it('rejects an expired token and deletes the record', async () => {
    refreshTokensRepository.findByIdWithUser.mockResolvedValue({
      ...validRecord,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(handler.execute(new RefreshCommand(rawToken))).rejects.toThrow(
      'Refresh token expired',
    );
    expect(refreshTokensRepository.remove).toHaveBeenCalledWith(jti);
  });

  it('rejects token reuse and deletes the record', async () => {
    refreshTokensRepository.findByIdWithUser.mockResolvedValue({
      ...validRecord,
      tokenHash: sha256('other-token'),
    });

    await expect(handler.execute(new RefreshCommand(rawToken))).rejects.toThrow(
      'Refresh token reuse detected',
    );
    expect(refreshTokensRepository.remove).toHaveBeenCalledWith(jti);
    expect(sessionService.start).not.toHaveBeenCalled();
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
    expect(refreshTokensRepository.remove).toHaveBeenCalledWith('jti-1');
  });

  it('succeeds without a token', async () => {
    await expect(
      handler.execute(new LogoutCommand(undefined)),
    ).resolves.toEqual({ ok: true });
    expect(refreshTokensRepository.remove).not.toHaveBeenCalled();
  });

  it('succeeds when the token is invalid', async () => {
    tokensService.verifyRefresh.mockResolvedValue(null);

    await expect(
      handler.execute(new LogoutCommand('bad')),
    ).resolves.toEqual({ ok: true });
    expect(refreshTokensRepository.remove).not.toHaveBeenCalled();
  });
});
