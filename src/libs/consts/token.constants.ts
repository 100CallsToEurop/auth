/** Время жизни access-токена. */
export const ACCESS_TOKEN_TTL = '15m';
/** Время жизни refresh-токена. */
export const REFRESH_TOKEN_TTL = '7d';
/** То же в миллисекундах — для cookie и записей в БД. */
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
