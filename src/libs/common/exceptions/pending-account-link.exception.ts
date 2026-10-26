import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Данные незавершённой привязки SSO-идентичности к существующему аккаунту.
 * Токен — одноразовый секрет: он живёт только в URL-фрагменте браузера или
 * в ответе API и позволяет показать экран подтверждения владения аккаунтом.
 */
export interface PendingAccountLinkSignal {
  /** Одноразовый токен подтверждения (в БД хранится только его хеш). */
  linkToken: string;
  /** Slug провайдера, через который пытались войти. */
  provider: string;
  /** Email уже существующего локального аккаунта. */
  email: string;
  /** Момент истечения заявки в ISO-формате. */
  expiresAt: string;
}

/**
 * Не ошибка входа, а сигнал «нужно подтвердить владение аккаунтом».
 * Passport передаёт исключение из verify в guard, guard переносит сигнал в
 * запрос, а контроллер решает: редирект на промежуточный экран для браузера
 * или JSON с токеном для API-клиента.
 */
export class PendingAccountLinkException extends HttpException {
  constructor(readonly pendingLink: PendingAccountLinkSignal) {
    super({ requiresAccountLink: true, ...pendingLink }, HttpStatus.CONFLICT);
  }
}
