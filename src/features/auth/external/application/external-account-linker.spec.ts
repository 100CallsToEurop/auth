import { ExternalAccountLinker } from './external-account-linker.js';

function createUsersRepositoryMock() {
  return {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    findByProvider: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
  };
}

function createIdentitiesRepositoryMock() {
  return {
    findByProvider: vi.fn(),
    findByUserId: vi.fn(),
    findByUserIdAndProvider: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
  };
}

const PROFILE = {
  sub: 'sub-1',
  email: 'New@Example.com',
  firstName: 'Иван',
  lastName: 'Иванов',
  displayName: 'Иванов Иван',
};

describe('ExternalAccountLinker', () => {
  const usersRepository = createUsersRepositoryMock();
  const identitiesRepository = createIdentitiesRepositoryMock();
  const linker = new ExternalAccountLinker(
    usersRepository as never,
    identitiesRepository as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    usersRepository.findById.mockResolvedValue(null);
    usersRepository.findByEmail.mockResolvedValue(null);
    usersRepository.findByProvider.mockResolvedValue(null);
    identitiesRepository.findByProvider.mockResolvedValue(null);
    usersRepository.create.mockImplementation(
      async (data: Record<string, unknown>) => ({ id: 'user-1', ...data }),
    );
    usersRepository.save.mockImplementation(async (user) => user);
    identitiesRepository.create.mockImplementation(
      async (data: Record<string, unknown>) => ({ id: 'link-1', ...data }),
    );
  });

  it('creates a user and an identity when none match', async () => {
    const user = await linker.link('authentik', PROFILE);

    expect(usersRepository.create).toHaveBeenCalledWith({
      email: 'new@example.com',
      passwordHash: null,
      firstName: 'Иван',
      lastName: 'Иванов',
      displayName: 'Иванов Иван',
    });
    expect(identitiesRepository.create).toHaveBeenCalledWith({
      userId: 'user-1',
      provider: 'authentik',
      providerSub: 'sub-1',
    });
    expect(user.id).toBe('user-1');
  });

  it('is idempotent when the unique identity already exists (race)', async () => {
    const stored = {
      id: 'user-race',
      email: 'race@example.com',
      firstName: null,
      lastName: null,
      displayName: null,
    };
    // findByProvider не нашёл запись (параллельный callback уже создал её),
    // пользователь найден по email, но create падает на уникальном индексе.
    identitiesRepository.findByProvider
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'link-race',
        userId: 'user-race',
        provider: 'authentik',
        providerSub: 'sub-1',
      });
    usersRepository.findByEmail.mockResolvedValue(stored);
    const uniqueViolation = Object.assign(new Error('duplicate key'), {
      code: '23505',
    });
    identitiesRepository.create.mockRejectedValueOnce(uniqueViolation);

    const user = await linker.link('authentik', PROFILE);

    expect(user.id).toBe('user-race');
    expect(identitiesRepository.create).toHaveBeenCalledTimes(1);
    expect(usersRepository.create).not.toHaveBeenCalled();
  });

  it('does NOT update the profile on login (only links)', async () => {    const stored = {
      id: 'user-2',
      email: 'old@example.com',
      firstName: 'Старое',
      lastName: null,
      displayName: null,
    };
    identitiesRepository.findByProvider.mockResolvedValue({
      id: 'link-2',
      userId: 'user-2',
      provider: 'github',
      providerSub: 'sub-2',
    });
    usersRepository.findById.mockResolvedValue(stored);

    const user = await linker.link('github', {
      sub: 'sub-2',
      email: 'new@example.com',
      firstName: 'Новое',
      lastName: null,
      displayName: null,
    });

    expect(usersRepository.create).not.toHaveBeenCalled();
    expect(user.email).toBe('old@example.com');
    expect(user.firstName).toBe('Старое');
    expect(usersRepository.save).not.toHaveBeenCalled();
    expect(identitiesRepository.create).not.toHaveBeenCalled();
  });

  it('migrates a legacy provider/provider_sub link into external_identities', async () => {
    const legacy = {
      id: 'user-3',
      email: 'user@example.com',
      provider: 'authentik',
      providerSub: 'sub-3',
      firstName: null,
      lastName: null,
      displayName: null,
    };
    usersRepository.findByProvider.mockResolvedValue(legacy);

    const user = await linker.link('authentik', {
      sub: 'sub-3',
      email: 'user@example.com',
      firstName: null,
      lastName: null,
      displayName: null,
    });

    expect(user.id).toBe('user-3');
    expect(identitiesRepository.create).toHaveBeenCalledWith({
      userId: 'user-3',
      provider: 'authentik',
      providerSub: 'sub-3',
    });
    expect(usersRepository.save).not.toHaveBeenCalled();
  });

  it('links a provider to an account that already exists by email', async () => {
    const existing = {
      id: 'user-4',
      email: 'a@b.c',
      passwordHash: 'local-hash',
      firstName: null,
      lastName: null,
      displayName: null,
    };
    usersRepository.findByEmail.mockResolvedValue(existing);

    const user = await linker.link('yandex', {
      sub: 'sub-4',
      email: 'a@b.c',
      firstName: null,
      lastName: null,
      displayName: null,
    });

    expect(user.id).toBe('user-4');
    expect(user.passwordHash).toBe('local-hash');
    expect(identitiesRepository.create).toHaveBeenCalledWith({
      userId: 'user-4',
      provider: 'yandex',
      providerSub: 'sub-4',
    });
  });

  it('keeps the old email when the new one belongs to another account', async () => {
    const stored = {
      id: 'user-5',
      email: 'old@example.com',
      firstName: null,
      lastName: null,
      displayName: null,
    };
    identitiesRepository.findByProvider.mockResolvedValue({
      id: 'link-5',
      userId: 'user-5',
    });
    usersRepository.findById.mockResolvedValue(stored);
    usersRepository.findByEmail.mockResolvedValue({
      id: 'user-6',
      email: 'taken@example.com',
    });

    const user = await linker.link('github', {
      sub: 'sub-5',
      email: 'taken@example.com',
      firstName: null,
      lastName: null,
      displayName: null,
    });

    expect(user.email).toBe('old@example.com');
    expect(usersRepository.save).not.toHaveBeenCalled();
  });

  it('rejects a profile without a subject or email', async () => {
    await expect(
      linker.link('github', { ...PROFILE, sub: '' }),
    ).rejects.toThrow(/subject/);
    await expect(
      linker.link('github', { ...PROFILE, email: '' }),
    ).rejects.toThrow(/email/);
  });

  describe('syncProvider', () => {
    it('updates the current user profile from the provider', async () => {
      const stored = {
        id: 'user-7',
        email: 'old@example.com',
        firstName: 'Старое',
        lastName: 'Старая',
        displayName: 'Старое Старое',
      };
      identitiesRepository.findByProvider.mockResolvedValue({
        id: 'link-7',
        userId: 'user-7',
        provider: 'yandex',
        providerSub: 'sub-7',
      });
      usersRepository.findById.mockResolvedValue(stored);
      usersRepository.findByEmail.mockResolvedValue(null);

      const user = await linker.syncProvider(
        'yandex',
        {
          sub: 'sub-7',
          email: 'new@example.com',
          firstName: 'Новое',
          lastName: 'Новое',
          displayName: 'Новое Новое',
        },
        'user-7',
      );

      expect(user.email).toBe('new@example.com');
      expect(user.firstName).toBe('Новое');
      expect(user.lastName).toBe('Новое');
      expect(user.displayName).toBe('Новое Новое');
      expect(usersRepository.save).toHaveBeenCalledWith(stored);
    });

    it('rejects when the provider is not linked to the current user', async () => {
      identitiesRepository.findByProvider.mockResolvedValue({
        id: 'link-8',
        userId: 'other-user',
      });

      await expect(
        linker.syncProvider('github', PROFILE, 'user-1'),
      ).rejects.toThrow(/not linked/);
      expect(usersRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('unlink', () => {
    it('removes the identity when another sign-in method remains', async () => {
      identitiesRepository.findByUserIdAndProvider.mockResolvedValue({
        id: 'link-9',
        userId: 'user-9',
        provider: 'github',
      });
      usersRepository.findById.mockResolvedValue({
        id: 'user-9',
        passwordHash: 'hash',
      });
      identitiesRepository.findByUserId.mockResolvedValue([
        { id: 'link-9', provider: 'github' },
      ]);

      await linker.unlink('github', 'user-9');

      expect(identitiesRepository.remove).toHaveBeenCalledWith('link-9');
    });

    it('refuses to unlink the last sign-in method', async () => {
      identitiesRepository.findByUserIdAndProvider.mockResolvedValue({
        id: 'link-10',
        userId: 'user-10',
        provider: 'authentik',
      });
      usersRepository.findById.mockResolvedValue({
        id: 'user-10',
        passwordHash: null,
      });
      identitiesRepository.findByUserId.mockResolvedValue([
        { id: 'link-10', provider: 'authentik' },
      ]);

      await expect(linker.unlink('authentik', 'user-10')).rejects.toThrow(
        /last sign-in method/,
      );
      expect(identitiesRepository.remove).not.toHaveBeenCalled();
    });

    it('rejects unlinking an unknown provider', async () => {
      identitiesRepository.findByUserIdAndProvider.mockResolvedValue(null);

      await expect(linker.unlink('github', 'user-1')).rejects.toThrow(
        /not linked/,
      );
    });
  });
});
