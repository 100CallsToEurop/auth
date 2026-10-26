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
} {
  const cookie = vi.fn();
  return { res: { cookie } as unknown as Response, cookie };
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
  const controller = new ProviderAuthController(
    sessionService as unknown as SessionService,
    configService as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
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
});
