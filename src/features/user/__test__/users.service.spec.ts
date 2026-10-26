import { ConflictException } from '@nestjs/common';
import { UsersService } from '../application/users.service.js';

function createRepositoryMock() {
  return {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
  };
}

describe('UsersService', () => {
  const repository = createRepositoryMock();
  const service = new UsersService(repository as never);

  beforeEach(() => {
    vi.clearAllMocks();
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

    it('attaches a password to an account created via a provider', async () => {
      const existing = {
        id: 'user-9',
        email: 'a@b.c',
        passwordHash: null,
      };
      repository.findByEmail.mockResolvedValue(existing);
      repository.save.mockImplementation(async (user) => user);

      const user = await service.registerWithPassword('a@b.c', 'password-hash');

      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalledWith(existing);
      expect(user.passwordHash).toBe('password-hash');
    });

    it('rejects an account that already has a password', async () => {
      repository.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.c',
        passwordHash: 'existing-hash',
      });

      await expect(
        service.registerWithPassword('a@b.c', 'new-hash'),
      ).rejects.toThrow(ConflictException);
      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    });
  });
});
