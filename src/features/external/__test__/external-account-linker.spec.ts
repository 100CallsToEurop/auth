import { ConflictException } from '@nestjs/common';
import { ExternalAccountLinker } from '../application/external-account-linker.js';

function createUsersRepositoryMock() {
  return {
    findById: vi.fn(),
    findByEmail: vi.fn(),
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
  emailVerified: true,
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
    identitiesRepository.findByProvider.mockResolvedValue(null);
    usersRepository.create.mockImplementation(
      async (data: Record<string, unknown>) => ({ id: 'user-1', ...data }),
    );
    usersRepository.save.mockImplementation(async (user) => user);
    identitiesRepository.create.mockImplementation(
      async (data: Record<string, unknown>) => ({ id: 'link-1', ...data }),
    );
  });

  describe('link (вход через провайдера)', () => {
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

    it('returns the already linked user on a repeated login', async () => {
      const stored = {
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
        emailVerified: true,
      });

      expect(usersRepository.create).not.toHaveBeenCalled();
      expect(user.email).toBe('old@example.com');
      expect(user.firstName).toBe('Старое');
      expect(usersRepository.save).not.toHaveBeenCalled();
      expect(identitiesRepository.create).not.toHaveBeenCalled();
    });

    it('does NOT merge with an existing account by email (no takeover)', async () => {
      usersRepository.findByEmail.mockResolvedValue({
        id: 'user-victim',
        email: 'victim@example.com',
        passwordHash: 'local-hash',
      });

      await expect(
        linker.link('yandex', {
          sub: 'sub-4',
          email: 'victim@example.com',
          firstName: null,
          lastName: null,
          displayName: null,
          emailVerified: true,
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(usersRepository.create).not.toHaveBeenCalled();
      expect(identitiesRepository.create).not.toHaveBeenCalled();
    });

    it('rejects a malformed email', async () => {
      await expect(
        linker.link('github', { ...PROFILE, email: 'not-an-email' }),
      ).rejects.toThrow(/malformed/);
    });

    it('rejects a profile without a subject or email', async () => {
      await expect(
        linker.link('github', { ...PROFILE, sub: '' }),
      ).rejects.toThrow(/subject/);
      await expect(
        linker.link('github', { ...PROFILE, email: '' }),
      ).rejects.toThrow(/email/);
    });

    it('is idempotent when the unique identity already exists (race)', async () => {
      // findByProvider не нашёл запись (параллельный callback уже создал её),
      // create падает на уникальном индексе email.
      identitiesRepository.findByProvider.mockResolvedValueOnce(null);
      identitiesRepository.findByProvider.mockResolvedValueOnce({
        id: 'link-race',
        userId: 'user-race',
        provider: 'authentik',
        providerSub: 'sub-1',
      });
      usersRepository.findByEmail.mockResolvedValue(null);
      usersRepository.create.mockRejectedValueOnce(
        Object.assign(new Error('duplicate key'), { code: '23505' }),
      );
      usersRepository.findById.mockResolvedValue({
        id: 'user-race',
        email: 'race@example.com',
      });

      const user = await linker.link('authentik', PROFILE);

      expect(user.id).toBe('user-race');
      expect(usersRepository.create).toHaveBeenCalledTimes(1);
    });

    it('tolerates a race on the identity (unique provider+sub)', async () => {
      identitiesRepository.create.mockRejectedValueOnce(
        Object.assign(new Error('duplicate key'), { code: '23505' }),
      );
      identitiesRepository.findByProvider
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'link-existing',
          userId: 'user-existing',
          provider: 'authentik',
          providerSub: 'sub-1',
        });

      const user = await linker.link('authentik', PROFILE);

      expect(user.id).toBe('user-1');
      expect(identitiesRepository.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('linkProvider (явная привязка из профиля)', () => {
    it('links the provider to the current user', async () => {
      const stored = { id: 'user-10', email: 'me@example.com' };
      usersRepository.findById.mockResolvedValue(stored);

      const user = await linker.linkProvider('github', PROFILE, 'user-10');

      expect(user.id).toBe('user-10');
      expect(identitiesRepository.create).toHaveBeenCalledWith({
        userId: 'user-10',
        provider: 'github',
        providerSub: 'sub-1',
      });
    });

    it('is idempotent when the provider is already linked to the same user', async () => {
      usersRepository.findById.mockResolvedValue({ id: 'user-10' });
      identitiesRepository.findByProvider.mockResolvedValue({
        id: 'link-11',
        userId: 'user-10',
        provider: 'github',
      });

      const user = await linker.linkProvider('github', PROFILE, 'user-10');

      expect(user.id).toBe('user-10');
      expect(identitiesRepository.create).not.toHaveBeenCalled();
    });

    it('refuses to link a provider that belongs to another user', async () => {
      usersRepository.findById.mockResolvedValue({ id: 'user-10' });
      identitiesRepository.findByProvider.mockResolvedValue({
        id: 'link-12',
        userId: 'user-other',
        provider: 'github',
      });

      await expect(
        linker.linkProvider('github', PROFILE, 'user-10'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(identitiesRepository.create).not.toHaveBeenCalled();
    });

    it('rejects when the user does not exist', async () => {
      usersRepository.findById.mockResolvedValue(null);

      await expect(
        linker.linkProvider('github', PROFILE, 'user-10'),
      ).rejects.toThrow(/unauthorized|Unauthorized/i);
    });
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
          emailVerified: true,
        },
        'user-7',
      );

      expect(user.email).toBe('new@example.com');
      expect(user.firstName).toBe('Новое');
      expect(user.lastName).toBe('Новое');
      expect(user.displayName).toBe('Новое Новое');
      expect(usersRepository.save).toHaveBeenCalledWith(stored);
    });

    it('does not apply an unverified email from the provider', async () => {
      const stored = {
        id: 'user-8',
        email: 'old@example.com',
        firstName: 'Старое',
        lastName: null,
        displayName: null,
      };
      identitiesRepository.findByProvider.mockResolvedValue({
        id: 'link-8',
        userId: 'user-8',
        provider: 'yandex',
        providerSub: 'sub-8',
      });
      usersRepository.findById.mockResolvedValue(stored);

      const user = await linker.syncProvider(
        'yandex',
        {
          sub: 'sub-8',
          email: 'attacker@example.com',
          firstName: null,
          lastName: null,
          displayName: null,
          emailVerified: false,
        },
        'user-8',
      );

      expect(user.email).toBe('old@example.com');
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

      const user = await linker.syncProvider(
        'github',
        {
          sub: 'sub-5',
          email: 'taken@example.com',
          firstName: null,
          lastName: null,
          displayName: null,
          emailVerified: true,
        },
        'user-5',
      );

      expect(user.email).toBe('old@example.com');
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
