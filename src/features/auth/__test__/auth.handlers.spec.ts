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

function createUsersRepositoryMock() {
  return {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
  };
}

function createSessionServiceMock() {
  return { start: vi.fn().mockResolvedValue(SESSION) };
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
    expect(sessionService.start).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-1', email: 'test@example.com' }),
      {},
    );
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
    expect(sessionService.start).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-9', email: 'a@b.c' }),
      {},
    );
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

    expect(sessionService.start).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-1', email: 'a@b.c' }),
      {},
    );
    expect(result).toEqual(SESSION);
  });
});

describe('GetCurrentUserHandler', () => {
  const usersRepository = createUsersRepositoryMock();
  const identitiesRepository = {
    findByUserId: vi.fn(),
  };
  const handler = new GetCurrentUserHandler(
    usersRepository as never,
    identitiesRepository as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    identitiesRepository.findByUserId.mockResolvedValue([]);
  });

  it('returns the user with names and sign-in methods', async () => {
    usersRepository.findById.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.c',
      passwordHash: 'hash',
      firstName: 'Иван',
      lastName: 'Иванов',
      displayName: 'Иванов Иван',
    });
    identitiesRepository.findByUserId.mockResolvedValue([
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
    usersRepository.findById.mockResolvedValue(null);

    await expect(
      handler.execute(new GetCurrentUserQuery('user-1')),
    ).rejects.toThrow(UnauthorizedException);
  });
});
