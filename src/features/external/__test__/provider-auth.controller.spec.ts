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
} {
  const cookie = vi.fn();
  const redirect = vi.fn();
  return { res: { cookie, redirect } as unknown as Response, cookie, redirect };
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
  const controller = new ProviderAuthController(
    sessionService as unknown as SessionService,
    configService as never,
    queryBus as never,
    providersRegistry as never,
    linker as never,
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
    ).rejects.toThrow('External provider did not return a user');
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
