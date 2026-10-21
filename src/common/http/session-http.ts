import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { IssuedSession } from '../../features/session/application/session.service.js';
import type { SessionMeta } from '../../features/session/application/session.service.js';
import {
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  REFRESH_TOKEN_TTL_MS,
} from '../../constants/session.constants.js';

/** URL фронтенда для редиректов (OAuth callback, SSO-выход). */
export function frontendUrl(configService: ConfigService): string {
  return (
    configService.get<string>('FRONTEND_URL') || 'http://localhost:3000'
  );
}

/** Метаданные клиента для списка активных сессий (IP, устройство, способ входа). */
export function sessionMeta(req: Request, provider = 'password'): SessionMeta {
  const forwarded = req.headers['x-forwarded-for'];
  const forwardedIp = Array.isArray(forwarded)
    ? forwarded[0]
    : forwarded?.split(',')[0];
  return {
    userAgent: req.headers['user-agent']?.slice(0, 512) ?? null,
    ip: (forwardedIp?.trim() || req.ip) ?? null,
    provider,
  };
}

/** Устанавливает refresh-токен в httpOnly cookie. */
export function setRefreshCookie(
  res: Response,
  token: string,
  configService: ConfigService,
): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: configService.get<string>('NODE_ENV') === 'production',
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}

/** Ставит refresh-cookie и формирует тело ответа с accessToken. */
export function sessionResponse(
  session: IssuedSession,
  res: Response,
  configService: ConfigService,
): {
  user: IssuedSession['user'];
  accessToken: string;
} {
  setRefreshCookie(res, session.refreshToken, configService);
  return { user: session.user, accessToken: session.accessToken };
}
