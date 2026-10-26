import type { Request, Response } from 'express';
import { ProviderAuthController } from '../api/provider-auth.controller.js';
import type { SessionService } from '../../session/application/session.service.js';

function createRequest(withUser = true): Request {
  return {
    user: withUser ? { id: 'user-1' } : undefined,
    headers: { 'user-agent': 'vitest' },
    ip: '127.0.0.1',
  } as unknown as Request;
}

function createResponse(): {
  res: Response;
  cookie: ReturnType<typeof vi.fn>;
  redirect: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
} {
  const cookie = vi.fn();
  const redirect = vi.fn();
  const status = vi.fn();
  return {
    res: { cookie, redirect, status } as unknown as Response,
    cookie,
    redirect,
    status,
  };
}

describe('ProviderAuthController', () => {
  const sessionService = {
    start: vi.fn().mockResolvedValue({
      user: { id: 'user-1' },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      jti: 'jti-1',
    }),
  };
  const configService = { get: vi.fn() };
  const queryBus = { execute: vi.fn() };
  const providersRegistry = { list: vi.fn() };
  const linker = { unlink: vi.fn() };
  const accountLinkService = { describe: vi.fn(), confirm: vi.fn() };
  const controller = new ProviderAuthController(
    sessionService as unknown as SessionService,
    configService as never,
    queryBus as never,
    providersRegistry as never,
    linker as never,
    accountLinkService as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    configService.get.mockReset();
  });

  it.each([
    [
      'github',
      (req: Request, res: Response) => controller.githubAuthCallback(req, res),
    ],
    [
      'authentik',
      (req: Request, res: Response) =>
        controller.authentikAuthCallback(req, res),
    ],
    [
      'invision',
      (req: Request, res: Response) =>
        controller.invisionAuthCallback(req, res),
    ],
    [
      'yandex',
      (req: Request, res: Response) => controller.yandexAuthCallback(req, res),
    ],
  ] as const)('returns an access token for %s', async (provider, callback) => {
    const req = createRequest();
    const { res, cookie } = createResponse();

    await expect(callback(req, res)).resolves.toEqual({
      accessToken: 'access-token',
    });

    expect(sessionService.start).toHaveBeenCalledWith(req.user, {
      userAgent: 'vitest',
      ip: '127.0.0.1',
      provider,
    });
    expect(cookie).toHaveBeenCalledWith(
      'refresh_token',
      'refresh-token',
      expect.objectContaining({ httpOnly: true }),
    );
  });

  it('rejects a callback without a provider user', async () => {
    const { res } = createResponse();
    await expect(
      controller.githubAuthCallback(createRequest(false), res),
    ).rejects.toThrow('Внешний провайдер не вернул пользователя');
  });

  it.each(['link', 'sync'] as const)(
    'redirects to the frontend after %s',
    async (externalAction) => {
      const req = createRequest() as Request & {
        externalAction?: 'link' | 'sync';
      };
      req.externalAction = externalAction;
      const { res, cookie, redirect } = createResponse();
      configService.get.mockImplementation((key: string) =>
        key === 'FRONTEND_URL' ? 'https://front.example.com' : undefined,
      );

      await expect(
        controller.githubAuthCallback(req, res),
      ).resolves.toBeUndefined();

      expect(cookie).toHaveBeenCalledWith(
        'refresh_token',
        'refresh-token',
        expect.objectContaining({ httpOnly: true }),
      );
      expect(redirect).toHaveBeenCalledWith('https://front.example.com');
    },
  );

  it('redirects a browser login to the frontend with the access token', async () => {
    const req = createRequest();
    req.headers.accept =
      'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
    const { res, cookie, redirect } = createResponse();
    configService.get.mockImplementation((key: string) =>
      key === 'FRONTEND_URL' ? 'https://front.example.com' : undefined,
    );

    await expect(
      controller.githubAuthCallback(req, res),
    ).resolves.toBeUndefined();

    expect(cookie).toHaveBeenCalledWith(
      'refresh_token',
      'refresh-token',
      expect.objectContaining({ httpOnly: true }),
    );
    expect(redirect).toHaveBeenCalledWith(
      'https://front.example.com/#access_token=access-token',
    );
  });

  it('returns JSON to API clients that do not accept HTML', async () => {
    const req = createRequest();
    req.headers.accept = '*/*';
    const { res, redirect } = createResponse();

    await expect(controller.githubAuthCallback(req, res)).resolves.toEqual({
      accessToken: 'access-token',
    });

    expect(redirect).not.toHaveBeenCalled();
  });

  describe('existing account collision', () => {
    const pending = {
      linkToken: 'link-token',
      provider: 'authentik',
      email: 'user@example.com',
      expiresAt: '2030-01-01T00:00:00.000Z',
    };

    function requestWithPending(): Request {
      const req = createRequest() as Request & {
        pendingAccountLink?: typeof pending;
      };
      req.pendingAccountLink = pending;
      return req;
    }

    it('redirects a browser to the confirmation screen without a session', async () => {
      const req = requestWithPending();
      req.headers.accept =
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
      const { res, cookie, redirect } = createResponse();
      configService.get.mockImplementation((key: string) =>
        key === 'FRONTEND_URL' ? 'https://front.example.com' : undefined,
      );

      await expect(
        controller.authentikAuthCallback(req, res),
      ).resolves.toBeUndefined();

      expect(redirect).toHaveBeenCalledWith(
        'https://front.example.com/link-account#link_token=link-token',
      );
      expect(cookie).not.toHaveBeenCalled();
      expect(sessionService.start).not.toHaveBeenCalled();
    });

    it('returns 409 with the one-time token to API clients', async () => {
      const req = requestWithPending();
      req.headers.accept = '*/*';
      const { res, cookie, redirect, status } = createResponse();

      await expect(controller.authentikAuthCallback(req, res)).resolves.toEqual(
        {
          requiresAccountLink: true,
          ...pending,
        },
      );

      expect(status).toHaveBeenCalledWith(409);
      expect(redirect).not.toHaveBeenCalled();
      expect(cookie).not.toHaveBeenCalled();
      expect(sessionService.start).not.toHaveBeenCalled();
    });
  });

  it('describes a pending account link for the confirmation screen', async () => {
    accountLinkService.describe.mockResolvedValueOnce({
      provider: 'github',
      email: 'user@example.com',
      hasPassword: true,
      expiresAt: '2030-01-01T00:00:00.000Z',
    });
    providersRegistry.list.mockReturnValueOnce([
      { slug: 'github', displayName: 'GitHub' },
    ]);

    await expect(
      controller.accountLinkInfo({ token: 'link-token' }),
    ).resolves.toEqual({
      provider: 'github',
      providerName: 'GitHub',
      email: 'user@example.com',
      hasPassword: true,
      expiresAt: '2030-01-01T00:00:00.000Z',
    });
    expect(accountLinkService.describe).toHaveBeenCalledWith('link-token');
  });

  it('confirms the link and issues a session', async () => {
    const issued = {
      user: { id: 'user-1' },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      jti: 'jti-1',
    };
    accountLinkService.confirm.mockResolvedValueOnce(issued);
    const req = createRequest();
    const { res, cookie } = createResponse();

    await expect(
      controller.accountLinkConfirm(
        { token: 'link-token', password: 'password' },
        req,
        res,
      ),
    ).resolves.toEqual({ user: issued.user, accessToken: 'access-token' });

    expect(accountLinkService.confirm).toHaveBeenCalledWith(
      'link-token',
      'password',
      { userAgent: 'vitest', ip: '127.0.0.1', provider: 'password' },
    );
    expect(cookie).toHaveBeenCalledWith(
      'refresh_token',
      'refresh-token',
      expect.objectContaining({ httpOnly: true }),
    );
  });

  it('lists available providers', () => {
    const providers = [{ slug: 'github', displayName: 'GitHub' }];
    providersRegistry.list.mockReturnValueOnce(providers);

    expect(controller.listProviders()).toEqual(providers);
  });

  it.each([
    ['github', (user: never) => controller.unlinkGithub(user)],
    ['authentik', (user: never) => controller.unlinkAuthentik(user)],
    ['invision', (user: never) => controller.unlinkInvision(user)],
    ['yandex', (user: never) => controller.unlinkYandex(user)],
  ] as const)(
    'unlinks %s from the current account',
    async (provider, unlink) => {
      const user = { id: 'user-1', email: 'user@example.com' };
      queryBus.execute.mockResolvedValueOnce(user);

      await expect(unlink(user as never)).resolves.toEqual(user);
      expect(linker.unlink).toHaveBeenCalledWith(provider, 'user-1');
    },
  );
});
