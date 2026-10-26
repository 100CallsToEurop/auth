import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { AccountLinkService } from '../application/account-link.service.js';

function createPendingLinksMock() {
  return {
    describe: vi.fn(),
    consume: vi.fn(),
  };
}

function createUsersServiceMock() {
  return { findById: vi.fn() };
}

function createLinkerMock() {
  return { linkPendingIdentity: vi.fn() };
}

function createSessionServiceMock() {
  return { start: vi.fn() };
}

const PENDING = {
  id: 'pending-1',
  userId: 'user-1',
  provider: 'authentik',
  providerSub: 'sub-1',
  email: 'user@example.com',
  expiresAt: new Date('2030-01-01T00:00:00.000Z'),
};

describe('AccountLinkService', () => {
  const pendingLinks = createPendingLinksMock();
  const usersService = createUsersServiceMock();
  const linker = createLinkerMock();
  const sessionService = createSessionServiceMock();
  const service = new AccountLinkService(
    pendingLinks as never,
    usersService as never,
    { compare: bcrypt.compare } as never,
    linker as never,
    sessionService as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    pendingLinks.describe.mockResolvedValue(PENDING);
    pendingLinks.consume.mockResolvedValue(PENDING);
    usersService.findById.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      passwordHash: 'hash',
    });
    linker.linkPendingIdentity.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
    });
    sessionService.start.mockResolvedValue({ accessToken: 'access-token' });
  });

  describe('describe', () => {
    it('returns account and provider context for the intermediate screen', async () => {
      await expect(service.describe('token')).resolves.toEqual({
        provider: 'authentik',
        email: 'user@example.com',
        hasPassword: true,
        expiresAt: '2030-01-01T00:00:00.000Z',
      });
    });

    it('reports an account without a password', async () => {
      usersService.findById.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        passwordHash: null,
      });

      await expect(service.describe('token')).resolves.toMatchObject({
        hasPassword: false,
      });
    });

    it('rejects when the account disappeared', async () => {
      usersService.findById.mockResolvedValue(null);

      await expect(service.describe('token')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('confirm', () => {
    it('rejects a wrong password without consuming the token', async () => {
      usersService.findById.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        passwordHash: await bcrypt.hash('correct-password', 4),
      });

      await expect(
        service.confirm('token', 'wrong-password', {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(pendingLinks.consume).not.toHaveBeenCalled();
      expect(linker.linkPendingIdentity).not.toHaveBeenCalled();
      expect(sessionService.start).not.toHaveBeenCalled();
    });

    it('does not allow password proof for an account without a password', async () => {
      usersService.findById.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        passwordHash: null,
      });

      await expect(
        service.confirm('token', 'anything', {}),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(pendingLinks.consume).not.toHaveBeenCalled();
      expect(linker.linkPendingIdentity).not.toHaveBeenCalled();
    });

    it('consumes the token, links the identity, and starts a session', async () => {
      usersService.findById.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        passwordHash: await bcrypt.hash('correct-password', 4),
      });

      const result = await service.confirm('token', 'correct-password', {
        userAgent: 'vitest',
        ip: '127.0.0.1',
        provider: 'password',
      });

      expect(pendingLinks.consume).toHaveBeenCalledWith('token');
      expect(linker.linkPendingIdentity).toHaveBeenCalledWith(
        'user-1',
        'authentik',
        'sub-1',
      );
      expect(sessionService.start).toHaveBeenCalledWith(
        { id: 'user-1', email: 'user@example.com' },
        {
          userAgent: 'vitest',
          ip: '127.0.0.1',
          provider: 'authentik',
        },
      );
      expect(result).toEqual({ accessToken: 'access-token' });
    });

    it('rejects an expired or invalid token', async () => {
      pendingLinks.describe.mockRejectedValue(new NotFoundException());

      await expect(
        service.confirm('token', 'password', {}),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(pendingLinks.consume).not.toHaveBeenCalled();
    });

    it('propagates a conflict when the identity belongs to another user', async () => {
      usersService.findById.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        passwordHash: await bcrypt.hash('correct-password', 4),
      });
      linker.linkPendingIdentity.mockRejectedValue(new Error('conflict'));

      await expect(
        service.confirm('token', 'correct-password', {}),
      ).rejects.toThrow('conflict');
      expect(sessionService.start).not.toHaveBeenCalled();
    });
  });
});
