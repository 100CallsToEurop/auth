import type { ThrottlerGetTrackerFunction } from '@nestjs/throttler';

/**
 * Трекер ограничений по email: считает попытки на конкретный аккаунт, а не по
 * IP. Иначе перебор пароля можно распределить по десяткам адресов и обойти
 * лимит «запросов с одного IP».
 *
 * Если email не пришёл (кривой запрос) — считаем по IP, чтобы невалидные
 * запросы тоже ограничивались.
 */
export const emailTracker: ThrottlerGetTrackerFunction = (req) => {
  const body = req.body as { email?: unknown } | undefined;
  const email =
    typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  return email || `ip:${String(req.ip ?? 'unknown')}`;
};

/**
 * Трекер для подтверждения привязки SSO: считает попытки на конкретный
 * одноразовый токен. Иначе подбор пароля к украденному токену можно было бы
 * распределить по разным IP. Без токена ограничиваем по IP.
 */
export const pendingLinkTracker: ThrottlerGetTrackerFunction = (req) => {
  const body = req.body as { token?: unknown } | undefined;
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  return token ? `pending-link:${token}` : `ip:${String(req.ip ?? 'unknown')}`;
};
