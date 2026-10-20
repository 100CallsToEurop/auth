import { ConflictException, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'node:crypto';
import { LoginCommand } from './commands/login/login.command.js';
import { LoginHandler } from './commands/login/login.handler.js';
import { LogoutCommand } from './commands/logout/logout.command.js';
import { LogoutHandler } from './commands/logout/logout.handler.js';
import { RefreshCommand } from './commands/refresh/refresh.command.js';
import { RefreshHandler } from './commands/refresh/refresh.handler.js';
import { RegisterCommand } from './commands/register/register.command.js';
import { RegisterHandler } from './commands/register/register.handler.js';
import { PasswordService } from './password.service.js';
import { GetCurrentUserHandler } from '../../user/application/queries/get-current-user/get-current-user.handler.js';
import { GetCurrentUserQuery } from '../../user/application/queries/get-current-user/get-current-user.query.js';

const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

const SESSION = {
  user: { id: 'user-1', email: 'a@b.c' },
  accessToken: 'access',
  refreshToken: 'refresh',
};

function createUsersRepositoryMock() {
  return {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
  };
}

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

describe('RegisterHandler', () => {
  const usersRepository = createUsersRepositoryMock();
  const sessionService = createSessionServiceMock();
  const handler = new RegisterHandler(
    usersRepository as never,
    new PasswordService(),
    sessionService as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    sessionService.start.mockResolvedValue(SESSION);
  });

  it('creates a user with a hashed password and starts a session', async () => {
    usersRepository.findByEmail.mockResolvedValue(null);
    usersRepository.create.mockImplementation(
      async (data: { email: string; passwordHash: string }) => ({
        id: 'user-1',
        ...data,
      }),
    );

    const result = await handler.execute(
      new RegisterCommand('Test@Example.com', 'password123'),
    );

    expect(usersRepository.create).toHaveBeenCalledWith({
      email: 'test@example.com',
      passwordHash: expect.any(String),
    });
    const { passwordHash } = usersRepository.create.mock.calls[0][0];
    expect(passwordHash).not.toBe('password123');
    expect(await bcrypt.compare('password123', passwordHash)).toBe(true);
    expect(sessionService.start).toHaveBeenCalledWith('user-1', 'test@example.com');
    expect(result).toEqual(SESSION);
  });

  it('rejects an already registered email', async () => {
    usersRepository.findByEmail.mockResolvedValue({
      id: 'user-1',
      passwordHash: 'hashed-password',
    });

    await expect(
      handler.execute(new RegisterCommand('a@b.c', 'password123')),
    ).rejects.toThrow(ConflictException);
    expect(usersRepository.create).not.toHaveBeenCalled();
    expect(usersRepository.save).not.toHaveBeenCalled();
  });

  it('attaches a password to an Authentik-created account and signs it in', async () => {
    const authentikUser = {
      id: 'user-9',
      email: 'a@b.c',
      passwordHash: null,
      provider: 'authentik',
      providerSub: 'sub-1',
    };
    usersRepository.findByEmail.mockResolvedValue(authentikUser);
    usersRepository.save.mockImplementation(async (user: typeof authentikUser) => user);

    const result = await handler.execute(
      new RegisterCommand('A@B.C', 'password123'),
    );

    expect(usersRepository.create).not.toHaveBeenCalled();
    expect(usersRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-9', email: 'a@b.c' }),
    );
    const saved = usersRepository.save.mock.calls[0][0];
    expect(await bcrypt.compare('password123', saved.passwordHash)).toBe(true);
    expect(authentikUser.provider).toBe('authentik');
    expect(authentikUser.providerSub).toBe('sub-1');
    expect(sessionService.start).toHaveBeenCalledWith('user-9', 'a@b.c');
    expect(result).toEqual(SESSION);
  });
});

describe('LoginHandler', () => {
  const usersRepository = createUsersRepositoryMock();
  const sessionService = createSessionServiceMock();
  const handler = new LoginHandler(
    usersRepository as never,
    new PasswordService(),
    sessionService as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    sessionService.start.mockResolvedValue(SESSION);
  });

  it('rejects unknown email', async () => {
    usersRepository.findByEmail.mockResolvedValue(null);

    await expect(
      handler.execute(new LoginCommand('a@b.c', 'password123')),
    ).rejects.toThrow(UnauthorizedException);
    expect(sessionService.start).not.toHaveBeenCalled();
  });

  it('rejects wrong password', async () => {
    usersRepository.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.c',
      passwordHash: await bcrypt.hash('correct-password', 4),
    });

    await expect(
      handler.execute(new LoginCommand('a@b.c', 'password123')),
    ).rejects.toThrow(UnauthorizedException);
    expect(sessionService.start).not.toHaveBeenCalled();
  });

  it('starts a session on valid credentials', async () => {
    usersRepository.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.c',
      passwordHash: await bcrypt.hash('password123', 4),
    });

    const result = await handler.execute(
      new LoginCommand('A@B.C', 'password123'),
    );

    expect(sessionService.start).toHaveBeenCalledWith('user-1', 'a@b.c');
    expect(result).toEqual(SESSION);
  });
});

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
    expect(sessionService.start).toHaveBeenCalledWith('user-1', 'a@b.c');
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

describe('GetCurrentUserHandler', () => {
  const usersRepository = createUsersRepositoryMock();
  const handler = new GetCurrentUserHandler(usersRepository as never);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the user when it exists', async () => {
    usersRepository.findById.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.c',
    });

    await expect(
      handler.execute(new GetCurrentUserQuery('user-1')),
    ).resolves.toEqual({ id: 'user-1', email: 'a@b.c' });
  });

  it('rejects when the user no longer exists', async () => {
    usersRepository.findById.mockResolvedValue(null);

    await expect(
      handler.execute(new GetCurrentUserQuery('user-1')),
    ).rejects.toThrow(UnauthorizedException);
  });
});
