/** Имя httpOnly-cookie с refresh-токеном. */
export const REFRESH_COOKIE = 'refresh_token';
/** Путь, на котором браузер отправляет refresh-cookie. */
export const REFRESH_COOKIE_PATH = '/api/auth';

/** Как часто чистить старые записи отозванных/просроченных токенов. */
export const PURGE_PROBABILITY = 0.02;
/** Записи старше этого срока удаляем (записи ротаций копятся). */
export const PURGE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
