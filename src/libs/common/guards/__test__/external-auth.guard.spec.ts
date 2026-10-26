import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';
import passport from 'passport';
import {
  PendingAccountLinkException,
  type PendingAccountLinkSignal,
} from '../../exceptions/pending-account-link.exception.js';
import { ExternalAuthGuard } from '../external-auth.guard.js';

vi.mock('passport', () => ({
  default: { authenticate: vi.fn() },
}));

class TestExternalAuthGuard extends ExternalAuthGuard {
  protected readonly fixedSlug = 'authentik';
}

function createContext(req: Request, res: Response): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
}

function createRequest(): Request {
  return {
    query: { code: 'code', state: 'state' },
    headers: {},
    session: {},
  } as unknown as Request;
}

describe('ExternalAuthGuard', () => {
  const passportMock = passport as unknown as {
    authenticate: ReturnType<typeof vi.fn>;
  };
  const registry = { require: vi.fn() };
  const guard = new TestExternalAuthGuard(
    registry as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockCallbackResult(error?: unknown, user?: unknown): void {
    passportMock.authenticate.mockImplementation(
      (_slug: string, _options: unknown, callback: Function) => () =>
        callback(error, user, undefined),
    );
  }

  it('passes a pending-link signal to the request instead of rejecting', async () => {
    const pending: PendingAccountLinkSignal = {
      linkToken: 'link-token',
      provider: 'authentik',
      email: 'user@example.com',
      expiresAt: '2030-01-01T00:00:00.000Z',
    };
    mockCallbackResult(new PendingAccountLinkException(pending));

    const req = createRequest();
    const context = createContext(req, {} as Response);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(
      (req as Request & { pendingAccountLink?: PendingAccountLinkSignal })
        .pendingAccountLink,
    ).toEqual(pending);
    expect(req.user).toBeUndefined();
  });

  it('still rejects real authentication errors', async () => {
    mockCallbackResult(new Error('provider exploded'));

    await expect(
      guard.canActivate(createContext(createRequest(), {} as Response)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('passes an authenticated user to the request', async () => {
    const user = { id: 'user-1' };
    mockCallbackResult(undefined, user);

    const req = createRequest();
    await expect(
      guard.canActivate(createContext(req, {} as Response)),
    ).resolves.toBe(true);
    expect(req.user).toBe(user);
  });
});
