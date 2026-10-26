import { BadRequestException, ConflictException } from '@nestjs/common';
import { EmailAlreadyRegisteredException } from '../../../libs/common/exceptions/email-already-registered.exception.js';
import { UsersService } from '../application/users.service.js';

function createRepositoryMock() {
  return {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
  };
}

function createLinkedAccountsMock() {
  return {
    findByUserId: vi.fn(),
  };
}

describe('UsersService', () => {
  const repository = createRepositoryMock();
  const linkedAccounts = createLinkedAccountsMock();
  const service = new UsersService(
    repository as never,
    linkedAccounts as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    linkedAccounts.findByUserId.mockResolvedValue([]);
  });

  describe('registerWithPassword', () => {
    it('creates a new local account when the email is free', async () => {
      repository.findByEmail.mockResolvedValue(null);
      repository.create.mockImplementation(
        async (data: Record<string, unknown>) => ({ id: 'user-1', ...data }),
      );

      const user = await service.registerWithPassword('a@b.c', 'password-hash');

      expect(repository.create).toHaveBeenCalledWith({
        email: 'a@b.c',
        passwordHash: 'password-hash',
      });
      expect(user.id).toBe('user-1');
    });

    it('refuses to attach a password to an account created via a provider', async () => {
      // Иначе знание чужого email позволяло бы завладеть SSO-аккаунтом.
      const existing = {
        id: 'user-9',
        email: 'a@b.c',
        passwordHash: null,
      };
      repository.findByEmail.mockResolvedValue(existing);
      linkedAccounts.findByUserId.mockResolvedValue([
        { provider: 'authentik' },
      ]);

      const error = await service
        .registerWithPassword('a@b.c', 'password-hash')
        .then(
          () => {
            throw new Error('регистрация не должна была пройти');
          },
          (err: unknown) => err,
        );

      expect(error).toBeInstanceOf(EmailAlreadyRegisteredException);
      expect((error as EmailAlreadyRegisteredException).canAttachPassword).toBe(
        true,
      );
      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
      expect(existing.passwordHash).toBeNull();
    });

    it('does not offer password attachment for an account without identities', async () => {
      repository.findByEmail.mockResolvedValue({
        id: 'user-9',
        email: 'a@b.c',
        passwordHash: null,
      });
      linkedAccounts.findByUserId.mockResolvedValue([]);

      const error = await service
        .registerWithPassword('a@b.c', 'password-hash')
        .then(
          () => {
            throw new Error('регистрация не должна была пройти');
          },
          (err: unknown) => err,
        );

      expect(error).toBeInstanceOf(EmailAlreadyRegisteredException);
      expect((error as EmailAlreadyRegisteredException).canAttachPassword).toBe(
        false,
      );
    });

    it('rejects an account that already has a password', async () => {
      repository.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.c',
        passwordHash: 'existing-hash',
      });
      linkedAccounts.findByUserId.mockResolvedValue([
        { provider: 'authentik' },
      ]);

      const error = await service
        .registerWithPassword('a@b.c', 'new-hash')
        .then(
          () => {
            throw new Error('регистрация не должна была пройти');
          },
          (err: unknown) => err,
        );

      expect(error).toBeInstanceOf(EmailAlreadyRegisteredException);
      expect((error as EmailAlreadyRegisteredException).canAttachPassword).toBe(
        false,
      );
      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    });
  });

  describe('setPassword', () => {
    it('sets a password on an account that has none', async () => {
      const user = { id: 'user-1', email: 'a@b.c', passwordHash: null };
      repository.findById.mockResolvedValue(user);
      repository.save.mockImplementation(async (value: unknown) => value);

      await service.setPassword('user-1', 'new-hash');

      expect(user.passwordHash).toBe('new-hash');
      expect(repository.save).toHaveBeenCalledWith(user);
    });

    it('rejects when the password is already set', async () => {
      repository.findById.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.c',
        passwordHash: 'existing-hash',
      });

      await expect(service.setPassword('user-1', 'new-hash')).rejects.toThrow(
        BadRequestException,
      );
      expect(repository.save).not.toHaveBeenCalled();
    });
  });

  describe('attachPasswordToProviderAccount', () => {
    it('attaches a password to an account with an external identity', async () => {
      const user = { id: 'user-9', email: 'a@b.c', passwordHash: null };
      repository.findByEmail.mockResolvedValue(user);
      linkedAccounts.findByUserId.mockResolvedValue([{ provider: 'github' }]);
      repository.save.mockImplementation(async (value: unknown) => value);

      await service.attachPasswordToProviderAccount('a@b.c', 'new-hash');

      expect(user.passwordHash).toBe('new-hash');
      expect(repository.save).toHaveBeenCalledWith(user);
    });

    it('rejects an account that already has a password', async () => {
      repository.findByEmail.mockResolvedValue({
        id: 'user-9',
        email: 'a@b.c',
        passwordHash: 'existing-hash',
      });

      await expect(
        service.attachPasswordToProviderAccount('a@b.c', 'new-hash'),
      ).rejects.toThrow(ConflictException);
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('rejects an account without external identities', async () => {
      repository.findByEmail.mockResolvedValue({
        id: 'user-9',
        email: 'a@b.c',
        passwordHash: null,
      });
      linkedAccounts.findByUserId.mockResolvedValue([]);

      await expect(
        service.attachPasswordToProviderAccount('a@b.c', 'new-hash'),
      ).rejects.toThrow(ConflictException);
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('rejects an unknown email', async () => {
      repository.findByEmail.mockResolvedValue(null);

      await expect(
        service.attachPasswordToProviderAccount('a@b.c', 'new-hash'),
      ).rejects.toThrow(ConflictException);
    });
  });
});
