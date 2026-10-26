import { ForbiddenException } from '@nestjs/common';
import { FrontendOriginGuard } from '../frontend-origin.guard.js';

function createContext(origin?: string) {
  const request = {
    headers: origin ? { origin } : {},
    protocol: 'https',
    get: (name: string) => (name === 'host' ? 'auth.example.com' : undefined),
  };
  return {
    request,
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
    },
  };
}

describe('FrontendOriginGuard', () => {
  const configService = {
    get: vi.fn((key: string) => {
      if (key === 'CORS_ORIGIN') {
        return 'https://app.example.com,https://admin.example.com';
      }
      if (key === 'FRONTEND_URL') {
        return 'https://app.example.com';
      }
      return undefined;
    }),
  };

  const guard = new FrontendOriginGuard(configService as never);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows a request from an allowed origin', () => {
    const { context } = createContext('https://app.example.com');
    expect(guard.canActivate(context as never)).toBe(true);
  });

  it('allows a same-origin request', () => {
    const { context } = createContext('https://auth.example.com');
    expect(guard.canActivate(context as never)).toBe(true);
  });

  it('allows a request without Origin (non-browser client)', () => {
    const { context } = createContext();
    expect(guard.canActivate(context as never)).toBe(true);
  });

  it('rejects a request from a foreign origin', () => {
    const { context } = createContext('https://evil.example.com');
    expect(() => guard.canActivate(context as never)).toThrow(
      ForbiddenException,
    );
  });
});
