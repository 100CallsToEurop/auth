import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { IssuedSession } from '../application/session.service.js';
import type { SessionMeta } from '../application/session.service.js';
import {
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
} from '../../../libs/consts/session.constants.js';
import { REFRESH_TOKEN_TTL_MS } from '../../../libs/consts/token.constants.js';

/** URL фронтенда для редиректов после OAuth callback. */
export function frontendUrl(configService: ConfigService): string {
  return configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
}

/**
 * URL возврата на фронтенд после входа через провайдера. Access-токен
 * передаётся во фрагменте: он не уходит на сервер и не попадает в логи,
 * а SPA сразу забирает его и очищает адресную строку.
 */
export function frontendLoginUrl(
  configService: ConfigService,
  accessToken: string,
): string {
  const url = new URL(frontendUrl(configService));
  url.hash = new URLSearchParams({ access_token: accessToken }).toString();
  return url.toString();
}

/**
 * URL промежуточного экрана подтверждения владения аккаунтом. Одноразовый
 * токен передаётся во фрагменте — он не попадает в логи сервера и referer.
 */
export function frontendAccountLinkUrl(
  configService: ConfigService,
  linkToken: string,
): string {
  const url = new URL(frontendUrl(configService));
  url.pathname = '/link-account';
  url.hash = new URLSearchParams({ link_token: linkToken }).toString();
  return url.toString();
}

/**
 * IP клиента. express учитывает X-Forwarded-For с учётом trust proxy,
 * поэтому берём req.ip, а заголовок читаем только как запасной вариант
 * (если приложение почему-то стоит без прокси).
 */
function clientIp(req: Request): string | null {
  if (req.ip) {
    return req.ip;
  }
  const forwarded = req.headers['x-forwarded-for'];
  const value = Array.isArray(forwarded)
    ? forwarded[0]
    : forwarded?.split(',')[0];
  return value?.trim() || null;
}

/** Метаданные клиента для списка активных сессий (IP, устройство, способ входа). */
export function sessionMeta(req: Request, provider = 'password'): SessionMeta {
  return {
    userAgent: req.headers['user-agent']?.slice(0, 512) ?? null,
    ip: clientIp(req),
    provider,
  };
}

/**
 * Параметры refresh-cookie. Secure выставляется, если соединение по HTTPS
 * (req.secure с учётом X-Forwarded-Proto за прокси) или приложение
 * работает в production.
 */
function refreshCookieOptions(
  req: Request,
  configService: ConfigService,
): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  maxAge: number;
} {
  const isProduction = configService.get<string>('NODE_ENV') === 'production';
  return {
    httpOnly: true,
    secure: isProduction || req.secure === true,
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_TTL_MS,
  };
}

/** Устанавливает refresh-токен в httpOnly cookie. */
export function setRefreshCookie(
  res: Response,
  token: string,
  req: Request,
  configService: ConfigService,
): void {
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions(req, configService));
}

/** Удаляет refresh-cookie (те же атрибуты, что и при установке). */
export function clearRefreshCookie(
  res: Response,
  req: Request,
  configService: ConfigService,
): void {
  const options = refreshCookieOptions(req, configService);
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: options.sameSite,
    path: options.path,
  });
}

/** Ставит refresh-cookie и формирует тело ответа с accessToken. */
export function sessionResponse(
  session: IssuedSession,
  res: Response,
  req: Request,
  configService: ConfigService,
): {
  user: IssuedSession['user'];
  accessToken: string;
} {
  setRefreshCookie(res, session.refreshToken, req, configService);
  return { user: session.user, accessToken: session.accessToken };
}
