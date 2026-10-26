import { ConflictException, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { LoginCommand } from '../application/commands/login/login.command.js';
import { LoginHandler } from '../application/commands/login/login.handler.js';
import { RegisterCommand } from '../application/commands/register/register.command.js';
import { RegisterHandler } from '../application/commands/register/register.handler.js';
import { PasswordService } from '../application/password.service.js';
import { GetCurrentUserHandler } from '../../user/application/queries/get-current-user/get-current-user.handler.js';
import { GetCurrentUserQuery } from '../../user/application/queries/get-current-user/get-current-user.query.js';

const SESSION = {
  user: { id: 'user-1', email: 'a@b.c' },
  accessToken: 'access',
  refreshToken: 'refresh',
};

function createUsersServiceMock() {
  return {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    registerWithPassword: vi.fn(),
  };
}

function createLinkedAccountsMock() {
  return {
    findByUserId: vi.fn(),
  };
}

function createSessionServiceMock() {
  return { start: vi.fn().mockResolvedValue(SESSION) };
}

describe('RegisterHandler', () => {
  const usersService = createUsersServiceMock();
  const sessionService = createSessionServiceMock();
  const handler = new RegisterHandler(
    usersService as never,
    new PasswordService(),
    sessionService as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    sessionService.start.mockResolvedValue(SESSION);
  });

  it('creates a user with a hashed password and starts a session', async () => {
    usersService.registerWithPassword.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
    });

    const result = await handler.execute(
      new RegisterCommand('Test@Example.com', 'password123'),
    );

    expect(usersService.registerWithPassword).toHaveBeenCalledWith(
      'test@example.com',
      expect.any(String),
    );
    const passwordHash = usersService.registerWithPassword.mock.calls[0][1];
    expect(passwordHash).not.toBe('password123');
    expect(await bcrypt.compare('password123', passwordHash)).toBe(true);
    expect(sessionService.start).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-1', email: 'test@example.com' }),
      {},
    );
    expect(result).toEqual(SESSION);
  });

  it('rejects an already registered email', async () => {
    usersService.registerWithPassword.mockRejectedValue(
      new ConflictException('Email is already registered'),
    );

    await expect(
      handler.execute(new RegisterCommand('a@b.c', 'password123')),
    ).rejects.toThrow(ConflictException);
    expect(sessionService.start).not.toHaveBeenCalled();
  });

  it('signs in an account whose password was attached', async () => {
    usersService.registerWithPassword.mockResolvedValue({
      id: 'user-9',
      email: 'a@b.c',
    });

    const result = await handler.execute(
      new RegisterCommand('A@B.C', 'password123'),
    );

    expect(usersService.registerWithPassword).toHaveBeenCalledWith(
      'a@b.c',
      expect.any(String),
    );
    expect(sessionService.start).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-9', email: 'a@b.c' }),
      {},
    );
    expect(result).toEqual(SESSION);
  });
});

describe('LoginHandler', () => {
  const usersService = createUsersServiceMock();
  const sessionService = createSessionServiceMock();
  const handler = new LoginHandler(
    usersService as never,
    new PasswordService(),
    sessionService as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    sessionService.start.mockResolvedValue(SESSION);
  });

  it('rejects unknown email', async () => {
    usersService.findByEmail.mockResolvedValue(null);

    await expect(
      handler.execute(new LoginCommand('a@b.c', 'password123')),
    ).rejects.toThrow(UnauthorizedException);
    expect(sessionService.start).not.toHaveBeenCalled();
  });

  it('rejects wrong password', async () => {
    usersService.findByEmail.mockResolvedValue({
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
    usersService.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.c',
      passwordHash: await bcrypt.hash('password123', 4),
    });

    const result = await handler.execute(
      new LoginCommand('A@B.C', 'password123'),
    );

    expect(sessionService.start).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-1', email: 'a@b.c' }),
      {},
    );
    expect(result).toEqual(SESSION);
  });
});

describe('GetCurrentUserHandler', () => {
  const usersService = createUsersServiceMock();
  const linkedAccounts = createLinkedAccountsMock();
  const handler = new GetCurrentUserHandler(
    usersService as never,
    linkedAccounts as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    linkedAccounts.findByUserId.mockResolvedValue([]);
  });

  it('returns the user with names and sign-in methods', async () => {
    usersService.findById.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.c',
      passwordHash: 'hash',
      firstName: 'Иван',
      lastName: 'Иванов',
      displayName: 'Иванов Иван',
    });
    linkedAccounts.findByUserId.mockResolvedValue([
      { provider: 'authentik' },
      { provider: 'github' },
    ]);

    await expect(
      handler.execute(new GetCurrentUserQuery('user-1')),
    ).resolves.toEqual({
      id: 'user-1',
      email: 'a@b.c',
      firstName: 'Иван',
      lastName: 'Иванов',
      displayName: 'Иванов Иван',
      providers: ['authentik', 'github', 'password'],
    });
  });

  it('rejects when the user no longer exists', async () => {
    usersService.findById.mockResolvedValue(null);

    await expect(
      handler.execute(new GetCurrentUserQuery('user-1')),
    ).rejects.toThrow(UnauthorizedException);
  });
});
