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
    findByProvider: vi.fn(),
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
    usersRepository.findByProvider.mockResolvedValue(null);
  });

  it('creates a new Authentik user with a normalized email', async () => {
    usersRepository.findByEmail.mockResolvedValue(null);
    usersRepository.create.mockImplementation(
      async (data: Record<string, unknown>) => ({ id: 'user-1', ...data }),
    );

    const user = await strategy.validate('http://idp.test/', {
      id: 'sub-1',
      emails: [{ value: 'New@Example.com' }],
      displayName: 'Иванов Иван Иванович',
      name: { givenName: 'Иван', familyName: 'Иванов' },
    });

    expect(usersRepository.findByProvider).toHaveBeenCalledWith(
      'authentik',
      'sub-1',
    );
    expect(usersRepository.findByEmail).toHaveBeenCalledWith(
      'new@example.com',
    );
    expect(usersRepository.create).toHaveBeenCalledWith({
      email: 'new@example.com',
      passwordHash: null,
      provider: 'authentik',
      providerSub: 'sub-1',
      firstName: 'Иван',
      lastName: 'Иванов',
      displayName: 'Иванов Иван Иванович',
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
      firstName: null,
      lastName: null,
      displayName: null,
    };
    usersRepository.findByEmail.mockResolvedValue(existing);
    usersRepository.save.mockImplementation(async (user) => user);

    const user = await strategy.validate('http://idp.test/', {
      id: 'sub-9',
      email: 'Test@Example.com',
      name: { givenName: 'Пётр' },
    });

    expect(usersRepository.findByEmail).toHaveBeenCalledWith(
      'test@example.com',
    );
    expect(usersRepository.create).not.toHaveBeenCalled();
    expect(usersRepository.save).toHaveBeenCalledWith(existing);
    expect(user.provider).toBe('authentik');
    expect(user.providerSub).toBe('sub-9');
    expect(user.passwordHash).toBe('local-password-hash');
    expect(user.firstName).toBe('Пётр');
  });

  it('does not touch an already linked account', async () => {
    const linked = {
      id: 'user-3',
      email: 'a@b.c',
      passwordHash: null,
      provider: 'authentik',
      providerSub: 'sub-3',
      firstName: 'Иван',
      lastName: 'Иванов',
      displayName: 'Иванов Иван',
    };
    usersRepository.findByProvider.mockResolvedValue(linked);

    await expect(
      strategy.validate('http://idp.test/', {
        id: 'sub-3',
        email: 'a@b.c',
        name: { givenName: 'Иван', familyName: 'Иванов' },
        displayName: 'Иванов Иван',
      }),
    ).resolves.toEqual(linked);
    expect(usersRepository.findByEmail).not.toHaveBeenCalled();
    expect(usersRepository.save).not.toHaveBeenCalled();
  });

  it('finds the account by sub after an email change in Authentik', async () => {
    const linked = {
      id: 'user-4',
      email: 'old@example.com',
      passwordHash: null,
      provider: 'authentik',
      providerSub: 'sub-4',
      firstName: 'Иван',
      lastName: null,
      displayName: null,
    };
    usersRepository.findByProvider.mockResolvedValue(linked);
    usersRepository.findByEmail.mockResolvedValue(null);
    usersRepository.save.mockImplementation(async (user) => user);

    const user = await strategy.validate('http://idp.test/', {
      id: 'sub-4',
      email: 'new@example.com',
    });

    expect(usersRepository.create).not.toHaveBeenCalled();
    expect(linked.email).toBe('new@example.com');
    expect(usersRepository.save).toHaveBeenCalledWith(linked);
    expect(user.id).toBe('user-4');
  });

  it('keeps the old email when the new one belongs to another account', async () => {
    const linked = {
      id: 'user-5',
      email: 'old@example.com',
      passwordHash: null,
      provider: 'authentik',
      providerSub: 'sub-5',
      firstName: null,
      lastName: null,
      displayName: null,
    };
    const owner = { id: 'user-6', email: 'taken@example.com' };
    usersRepository.findByProvider.mockResolvedValue(linked);
    usersRepository.findByEmail.mockResolvedValue(owner);

    const user = await strategy.validate('http://idp.test/', {
      id: 'sub-5',
      email: 'taken@example.com',
    });

    expect(user.email).toBe('old@example.com');
    expect(usersRepository.save).not.toHaveBeenCalled();
    expect(usersRepository.create).not.toHaveBeenCalled();
  });

  it('synchronizes stale profile data from Authentik on login', async () => {
    const linked = {
      id: 'user-7',
      email: 'user@example.com',
      passwordHash: null,
      provider: 'authentik',
      providerSub: 'sub-7',
      firstName: 'Старое',
      lastName: 'Старая',
      displayName: 'Старая Старая Старая',
    };
    usersRepository.findByProvider.mockResolvedValue(linked);
    usersRepository.save.mockImplementation(async (user) => user);

    const user = await strategy.validate('http://idp.test/', {
      id: 'sub-7',
      email: 'user@example.com',
      name: { givenName: 'Новое', familyName: 'Новое' },
      displayName: 'Новое Новое Новое',
    });

    expect(user.firstName).toBe('Новое');
    expect(user.lastName).toBe('Новое');
    expect(user.displayName).toBe('Новое Новое Новое');
    expect(usersRepository.save).toHaveBeenCalledWith(linked);
  });

  it('rejects a profile without an email', async () => {
    await expect(
      strategy.validate('http://idp.test/', { id: 'sub-4' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(usersRepository.create).not.toHaveBeenCalled();
  });
});
