-- Миграция: расширенные поля профиля и подтверждение телефона.
--
-- Применяется к уже существующей схеме, повторный запуск безопасен.
-- В production TypeORM synchronize выключен, поэтому файл нужно выполнить
-- вручную (или подключить к вашему миграционному инструменту):
--
--   psql "$DATABASE_URL" -f migrations/2026-10-26-profile-fields-and-phone.sql

BEGIN;

-- Личные данные, которые пользователь может редактировать после
-- подтверждения телефона.
ALTER TABLE users ADD COLUMN IF NOT EXISTS middle_name varchar(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization varchar(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS "position" varchar(255);

-- Телефон и момент его подтверждения. Подтверждение условное: SMS не
-- отправляется, но без отметки времени редактирование профиля запрещено.
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone varchar(32);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;

COMMIT;
