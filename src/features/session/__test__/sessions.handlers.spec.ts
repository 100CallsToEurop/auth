import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { LogoutAllHandler } from '../application/commands/logout-all/logout-all.handler.js';
import { LogoutAllCommand } from '../application/commands/logout-all/logout-all.command.js';
import { RevokeSessionHandler } from '../application/commands/revoke-session/revoke-session.handler.js';
import { RevokeSessionCommand } from '../application/commands/revoke-session/revoke-session.command.js';
import { ListSessionsHandler } from '../application/queries/list-sessions/list-sessions.handler.js';
import { ListSessionsQuery } from '../application/queries/list-sessions/list-sessions.query.js';

function createRepositoryMock() {
  return {
    findByUserId: vi.fn(),
    removeAllByUserId: vi.fn(),
    removeAllByUserIdExcept: vi.fn(),
    removeByIdForUser: vi.fn(),
  };
}

describe('LogoutAllHandler', () => {
  const repository = createRepositoryMock();
  const handler = new LogoutAllHandler(repository as never);

  beforeEach(() => {
    vi.clearAllMocks();
    repository.removeAllByUserId.mockResolvedValue(3);
    repository.removeAllByUserIdExcept.mockResolvedValue(2);
  });

  it('revokes every session of the user', async () => {
    const result = await handler.execute(new LogoutAllCommand('user-1', 'jti-1'));

    expect(repository.removeAllByUserId).toHaveBeenCalledWith('user-1');
    expect(repository.removeAllByUserIdExcept).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, revoked: 3 });
  });

  it('keeps the current session when exceptCurrent is set', async () => {
    const result = await handler.execute(
      new LogoutAllCommand('user-1', 'jti-1', true),
    );

    expect(repository.removeAllByUserIdExcept).toHaveBeenCalledWith(
      'user-1',
      'jti-1',
    );
    expect(repository.removeAllByUserId).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, revoked: 2 });
  });

  it('requires a user id', async () => {
    await expect(
      handler.execute(new LogoutAllCommand('')),
    ).rejects.toThrow(UnauthorizedException);
  });
});

describe('RevokeSessionHandler', () => {
  const repository = createRepositoryMock();
  const handler = new RevokeSessionHandler(repository as never);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('revokes a session owned by the user', async () => {
    repository.removeByIdForUser.mockResolvedValue(true);

    const result = await handler.execute(new RevokeSessionCommand('s-1', 'user-1'));

    expect(repository.removeByIdForUser).toHaveBeenCalledWith('s-1', 'user-1');
    expect(result).toEqual({ ok: true });
  });

  it('throws 404 when the session is not the user\'s', async () => {
    repository.removeByIdForUser.mockResolvedValue(false);

    await expect(
      handler.execute(new RevokeSessionCommand('s-x', 'user-1')),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('ListSessionsHandler', () => {
  const repository = createRepositoryMock();
  const handler = new ListSessionsHandler(repository as never);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps active sessions and marks the current one', async () => {
    repository.findByUserId.mockResolvedValue([
      {
        id: 's-1',
        userAgent: 'Firefox',
        ip: '1.2.3.4',
        createdAt: new Date(),
        lastUsedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      },
      {
        id: 's-2',
        userAgent: 'Chrome',
        ip: '5.6.7.8',
        createdAt: new Date(),
        lastUsedAt: null,
        expiresAt: new Date(Date.now() - 60_000),
      },
    ]);

    const result = await handler.execute(new ListSessionsQuery('user-1', 's-1'));

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 's-1', current: true });
  });

  it('requires a user id', async () => {
    await expect(
      handler.execute(new ListSessionsQuery('')),
    ).rejects.toThrow(UnauthorizedException);
  });
});
