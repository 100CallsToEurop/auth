import { NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PENDING_ACCOUNT_LINK_TTL_MS } from '../../../libs/consts/account-link.constants.js';
import { PendingAccountLinksService } from '../application/pending-account-links.service.js';

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function createRepositoryMock() {
  return {
    findByTokenHash: vi.fn(),
    create: vi.fn(),
    deleteById: vi.fn(),
    deleteByProviderSub: vi.fn(),
    deleteExpired: vi.fn(),
  };
}

const INPUT = {
  provider: 'authentik',
  providerSub: 'sub-1',
  userId: 'user-1',
  email: 'user@example.com',
};

describe('PendingAccountLinksService', () => {
  const repository = createRepositoryMock();
  const service = new PendingAccountLinksService(repository as never);

  beforeEach(() => {
    vi.clearAllMocks();
    repository.deleteByProviderSub.mockResolvedValue(undefined);
    repository.deleteExpired.mockResolvedValue(undefined);
    repository.deleteById.mockResolvedValue(true);
    repository.create.mockImplementation(
      async (data: Record<string, unknown>) => ({ id: 'link-1', ...data }),
    );
  });

  describe('create', () => {
    it('stores only a hash of a random token', async () => {
      const before = Date.now();
      const result = await service.create(INPUT);

      expect(repository.deleteByProviderSub).toHaveBeenCalledWith(
        'authentik',
        'sub-1',
      );
      expect(result.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);

      const data = repository.create.mock.calls[0][0] as {
        tokenHash: string;
        userId: string;
        provider: string;
        providerSub: string;
        email: string;
        expiresAt: Date;
      };
      expect(data.tokenHash).toBe(hash(result.token));
      expect(data.tokenHash).not.toBe(result.token);
      expect(data).toMatchObject({
        userId: 'user-1',
        provider: 'authentik',
        providerSub: 'sub-1',
        email: 'user@example.com',
      });
      expect(data.expiresAt.getTime()).toBeGreaterThanOrEqual(
        before + PENDING_ACCOUNT_LINK_TTL_MS,
      );
      expect(data.expiresAt.getTime()).toBeLessThanOrEqual(
        Date.now() + PENDING_ACCOUNT_LINK_TTL_MS,
      );
    });
  });

  describe('describe', () => {
    it('returns a pending link by its raw token', async () => {
      const record = {
        id: 'link-1',
        tokenHash: hash('raw-token'),
        expiresAt: new Date(Date.now() + 60_000),
      };
      repository.findByTokenHash.mockResolvedValue(record);

      await expect(service.describe('raw-token')).resolves.toBe(record);
      expect(repository.findByTokenHash).toHaveBeenCalledWith(
        hash('raw-token'),
      );
    });

    it('rejects an unknown token', async () => {
      repository.findByTokenHash.mockResolvedValue(null);

      await expect(service.describe('unknown')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects and removes an expired token', async () => {
      const record = {
        id: 'link-1',
        tokenHash: hash('old-token'),
        expiresAt: new Date(Date.now() - 1_000),
      };
      repository.findByTokenHash.mockResolvedValue(record);

      await expect(service.describe('old-token')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repository.deleteById).toHaveBeenCalledWith(
        'link-1',
        record.tokenHash,
      );
    });
  });

  describe('consume', () => {
    it('returns the link and makes the token one-time', async () => {
      const record = {
        id: 'link-1',
        tokenHash: hash('raw-token'),
        expiresAt: new Date(Date.now() + 60_000),
      };
      repository.findByTokenHash.mockResolvedValue(record);

      await expect(service.consume('raw-token')).resolves.toBe(record);
      expect(repository.deleteById).toHaveBeenCalledWith(
        'link-1',
        record.tokenHash,
      );
    });

    it('rejects when a parallel request already consumed the token', async () => {
      repository.findByTokenHash.mockResolvedValue({
        id: 'link-1',
        tokenHash: hash('raw-token'),
        expiresAt: new Date(Date.now() + 60_000),
      });
      repository.deleteById.mockResolvedValue(false);

      await expect(service.consume('raw-token')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
