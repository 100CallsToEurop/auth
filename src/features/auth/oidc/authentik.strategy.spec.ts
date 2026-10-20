import { UnauthorizedException } from '@nestjs/common';
import { AuthentikStrategy } from './authentik.strategy.js';

const CONFIG: Record<string, string> = {
  AUTHENTIK_ISSUER: 'http://idp.test/application/o/app/',
  AUTHENTIK_CLIENT_ID: 'client-id',
  AUTHENTIK_CLIENT_SECRET: 'client-secret',
  AUTHENTIK_CALLBACK_URL:
    'http://localhost:3000/api/auth/oidc/authentik/callback',
};

function createConfigServiceMock() {
  return {
    getOrThrow: vi.fn((key: string) => CONFIG[key]),
    get: vi.fn(() => undefined),
  };
}

function createUsersRepositoryMock() {
  return {
    findByEmail: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
  };
}

describe('AuthentikStrategy', () => {
  const usersRepository = createUsersRepositoryMock();
  const strategy = new AuthentikStrategy(
    createConfigServiceMock() as never,
    usersRepository as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a new Authentik user with a normalized email', async () => {
    usersRepository.findByEmail.mockResolvedValue(null);
    usersRepository.create.mockImplementation(
      async (data: Record<string, unknown>) => ({ id: 'user-1', ...data }),
    );

    const user = await strategy.validate('http://idp.test/', {
      id: 'sub-1',
      emails: [{ value: 'New@Example.com' }],
    });

    expect(usersRepository.findByEmail).toHaveBeenCalledWith(
      'new@example.com',
    );
    expect(usersRepository.create).toHaveBeenCalledWith({
      email: 'new@example.com',
      passwordHash: null,
      provider: 'authentik',
      providerSub: 'sub-1',
    });
    expect(user.id).toBe('user-1');
  });

  it('signs in an existing account by email and links the Authentik sub', async () => {
    const existing = {
      id: 'user-2',
      email: 'test@example.com',
      passwordHash: 'local-password-hash',
      provider: 'local',
      providerSub: null,
    };
    usersRepository.findByEmail.mockResolvedValue(existing);
    usersRepository.save.mockImplementation(async (user) => user);

    const user = await strategy.validate('http://idp.test/', {
      id: 'sub-9',
      email: 'Test@Example.com',
    });

    expect(usersRepository.findByEmail).toHaveBeenCalledWith(
      'test@example.com',
    );
    expect(usersRepository.create).not.toHaveBeenCalled();
    expect(usersRepository.save).toHaveBeenCalledWith(existing);
    expect(user.provider).toBe('authentik');
    expect(user.providerSub).toBe('sub-9');
    expect(user.passwordHash).toBe('local-password-hash');
  });

  it('does not touch an already linked account', async () => {
    const linked = {
      id: 'user-3',
      email: 'a@b.c',
      passwordHash: null,
      provider: 'authentik',
      providerSub: 'sub-3',
    };
    usersRepository.findByEmail.mockResolvedValue(linked);

    await expect(
      strategy.validate('http://idp.test/', { id: 'sub-3', email: 'a@b.c' }),
    ).resolves.toEqual(linked);
    expect(usersRepository.save).not.toHaveBeenCalled();
  });

  it('rejects a profile without an email', async () => {
    await expect(
      strategy.validate('http://idp.test/', { id: 'sub-4' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(usersRepository.create).not.toHaveBeenCalled();
  });
});
