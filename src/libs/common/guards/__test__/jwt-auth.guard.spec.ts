import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from '../jwt-auth.guard.js';

function createContext(options: { token?: string; isPublic?: boolean }) {
  const request: {
    headers: Record<string, string>;
    user?: { id: string; email: string };
  } = { headers: {} };
  if (options.token) {
    request.headers.authorization = `Bearer ${options.token}`;
  }
  return {
    request,
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => 'handler',
      getClass: () => 'class',
    },
  };
}

describe('JwtAuthGuard', () => {
  const tokensService = {
    verifyAccess: vi.fn(),
  };
  const tokenVersionsRepository = {
    findVersion: vi.fn(),
  };
  const reflector = {
    getAllAndOverride: vi.fn(),
  };

  const guard = new JwtAuthGuard(
    tokensService as never,
    reflector as never,
    tokenVersionsRepository as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    reflector.getAllAndOverride.mockReturnValue(false);
    tokensService.verifyAccess.mockResolvedValue({
      sub: 'user-1',
      email: 'a@b.c',
      ver: 2,
    });
    tokenVersionsRepository.findVersion.mockResolvedValue(2);
  });

  it('passes a valid token and puts the user into the request', async () => {
    const { request, context } = createContext({ token: 'token' });

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(request.user).toEqual({ id: 'user-1', email: 'a@b.c' });
  });

  it('rejects a request without a token', async () => {
    const { context } = createContext({});

    await expect(guard.canActivate(context as never)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an invalid token', async () => {
    tokensService.verifyAccess.mockResolvedValue(null);
    const { context } = createContext({ token: 'token' });

    await expect(guard.canActivate(context as never)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token issued before "logout all devices"', async () => {
    // Версия токена в JWT (1) не совпадает с текущей версией аккаунта (2).
    tokensService.verifyAccess.mockResolvedValue({
      sub: 'user-1',
      email: 'a@b.c',
      ver: 1,
    });
    const { context } = createContext({ token: 'token' });

    await expect(guard.canActivate(context as never)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('skips public routes', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const { context } = createContext({});

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(tokensService.verifyAccess).not.toHaveBeenCalled();
  });
});
