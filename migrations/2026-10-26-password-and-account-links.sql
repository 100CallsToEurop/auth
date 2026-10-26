-- Миграция: пароль для SSO-аккаунтов и заявки на привязку входа.
--
-- Применяется к уже существующей схеме, повторный запуск безопасен.
-- В production TypeORM synchronize выключен, поэтому файл нужно выполнить
-- вручную (или подключить к вашему миграционному инструменту):
--
--   psql "$DATABASE_URL" -f migrations/2026-10-26-password-and-account-links.sql

BEGIN;

-- Аккаунт, созданный через внешнего провайдера, может не иметь пароля.
-- Пароль добавляется позже: из профиля или при конфликте регистрации.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Одноразовые заявки на привязку SSO к существующему аккаунту.
-- В token_hash хранится SHA-256 от токена, сам токен в БД не попадает.
CREATE TABLE IF NOT EXISTS pending_account_links (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  token_hash varchar(64) NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider varchar(50) NOT NULL,
  provider_sub varchar(255) NOT NULL,
  email varchar(255) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

-- Индексы создаём только если эквивалентных ещё нет: на базе, которую
-- создавал TypeORM (synchronize), имена индексов другие, и слепой
-- CREATE INDEX IF NOT EXISTS добавил бы дубли.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
    WHERE t.relname = 'pending_account_links'
      AND i.indnatts = 1
      AND i.indisunique
      AND a.attname = 'token_hash'
  ) THEN
    CREATE UNIQUE INDEX idx_pending_account_links_token_hash
      ON pending_account_links (token_hash);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
    WHERE t.relname = 'pending_account_links'
      AND i.indnatts = 1
      AND a.attname = 'user_id'
  ) THEN
    CREATE INDEX idx_pending_account_links_user_id
      ON pending_account_links (user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
    WHERE t.relname = 'pending_account_links'
      AND i.indnatts = 1
      AND a.attname = 'expires_at'
  ) THEN
    CREATE INDEX idx_pending_account_links_expires_at
      ON pending_account_links (expires_at);
  END IF;
END $$;

COMMIT;
