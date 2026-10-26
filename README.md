# auth-backend

Сервис аутентификации: локальный вход (email + пароль) и вход через внешних
провайдеров (Authentik/OIDC, Яндекс, GitHub, Invision Community).
Отдаёт короткоживущий access-токен (JWT) и долгоживущий refresh-токен в
httpOnly-cookie.

## Структура модулей

```
src/
├── app.module.ts          # composition root: сборка модулей и глобальные guard'ы
├── libs/
│   ├── common/            # декораторы, фильтры, throttle, guard'ы
│   │   └── guards/        # JWT, external-auth и Origin guard'ы
│   ├── consts/            # константы: TTL, cookie, БД, user-agent, DI-токены
│   └── providers/         # внешние провайдеры
│       ├── contracts/     # SPI: ExternalProvider, ExternalProfile, порт
│       ├── base/          # абстрактные классы провайдеров
│       ├── implementations/ # по папке на провайдера: config + provider
│       └── registry/      # реестр, фабрика стратегий, листовой модуль
└── features/
    ├── user/              # листовой модуль: User + ExternalIdentity + профиль
    ├── session/           # токены и управление сессиями: список, отзыв, logout/all
    ├── auth/              # регистрация, вход, refresh и logout текущей сессии
    └── external/          # OAuth/OIDC-провайдеры и привязка внешних аккаунтов
```

На каждую папку — ровно один Nest-модуль: `external` и листовой
`ExternalProvidersModule` в `libs/providers` разнесены, потому что объединение
вернуло бы цикл `session ↔ external`.

Зависимости направлены только внутрь:

```
auth ──────> user
  └────────> session ──> libs/providers (листовой реестр)
external ──> user
  ├────────> session
  └────────> libs/providers
```

- `libs/consts` и `libs/providers` не зависят от `features`: провайдеры работают
  с аккаунтами через порт `ExternalAccountResolver`, а его реализация
  (`ExternalAccountLinker`) живёт в `features/external`.
- `libs/common/guards` — исключение: guard'ам нужны сервисы `session`
  (`TokensService` и репозитории токенов).
- `user` не зависит от других feature-модулей и не отдаёт наружу репозитории:
  `auth` и `external` работают через `UsersService` и `LinkedAccountsService`.
- `session` владеет жизненным циклом токенов и управлением сессиями:
  список устройств, отзыв одной сессии, «завершить другие» и `logout/all`.
  Реестр внешних провайдеров вынесен в листовой `ExternalProvidersModule`,
  чтобы `session` мог получить URL SSO-выхода без цикла с `external`.
- `auth` отвечает за регистрацию, локальный вход, `refresh` и `logout`
  текущей сессии. `GET /auth/me`, как read-model пользователя, объявлен в
  `user`-модуле.

## Запуск

```bash
pnpm install
pnpm run start:dev      # разработка (схема БД создаётся автоматически)
pnpm run start:prod     # прод
```

## Переменные окружения

### Обязательные

| Переменная                                                                | Назначение                                                                                                                                 |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `JWT_SECRET`                                                              | Подпись access-токенов                                                                                                                     |
| `JWT_REFRESH_SECRET`                                                      | Подпись refresh-токенов                                                                                                                    |
| `SESSION_SECRET`                                                          | Подпись cookie express-сессии (в ней живут OAuth-state и PKCE-verifier). В `NODE_ENV=production` обязателен — иначе приложение не стартует |
| `DATABASE_URL` (или `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE`) | Подключение к PostgreSQL                                                                                                                   |

### Обычные

| Переменная                                                           | По умолчанию            | Назначение                                                                        |
| -------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------- |
| `NODE_ENV`                                                           | —                       | `production` включает Secure-cookie и отключает `synchronize`                     |
| `DB_SYNCHRONIZE`                                                     | `true` вне production   | Синхронизация схемы TypeORM. В production схема меняется вручную (см. «Схема БД») |
| `JWT_ISSUER`                                                         | `auth-backend`          | claim `iss` в токенах                                                             |
| `JWT_AUDIENCE`                                                       | `auth-frontend`         | claim `aud` в токенах                                                             |
| `PORT`                                                               | `3000`                  | HTTP-порт                                                                         |
| `FRONTEND_URL`                                                       | `http://localhost:3000` | Куда возвращать пользователя после входа и SSO-выхода                             |
| `PUBLIC_API_URL`                                                     | `http://localhost:3000` | Публичный адрес API — используется в callback-URL провайдеров                     |
| `CORS_ORIGIN`                                                        | `http://localhost:3000` | Список origin через запятую                                                       |
| `AUTHENTIK_ISSUER`, `AUTHENTIK_CLIENT_ID`, `AUTHENTIK_CLIENT_SECRET` | —                       | OIDC-провайдер (всегда доступен в списке; ключи нужны для входа)                  |

### Внешние провайдеры

Для каждого провайдера `<SLUG>` (authentik, yandex, github, invision):

| Переменная                                 | Назначение                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| `<SLUG>_CLIENT_ID`, `<SLUG>_CLIENT_SECRET` | Клиент OAuth2. Провайдер всегда доступен в списке; без ключей вход не работает |
| `<SLUG>_CALLBACK_URL`                      | Callback-URL. По умолчанию `${PUBLIC_API_URL}/api/auth/<slug>/callback`        |
| `<SLUG>_SCOPES`                            | Запрашиваемые scope. По умолчанию — минимально необходимые                     |
| `<SLUG>_PKCE`                              | `false` отключает PKCE (по умолчанию включён, метод S256)                      |
| `INVISION_BASE_URL`                        | Адрес сообщества Invision (обязателен для этого провайдера)                    |

Scope запрашиваются только сервером: пользователь видит их на странице согласия
провайдера, но изменить их не может.

Redirect URI в настройках OAuth-приложения провайдера должен совпадать с
`<SLUG>_CALLBACK_URL`; по умолчанию это
`${PUBLIC_API_URL}/api/auth/<slug>/callback`.

## Схема БД

В разработке схему создаёт TypeORM (`synchronize`). В production
`synchronize` выключен, поэтому изменения схемы применяются вручную:

```sql
-- refresh-токены: семейство, отзыв и замена при ротации
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS family_id uuid NULL;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS revoked_at timestamptz NULL;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS replaced_by_id uuid NULL;
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family_id ON refresh_tokens (family_id);

-- версия токенов аккаунта («выйти со всех устройств»)
CREATE TABLE IF NOT EXISTS user_token_versions (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 0
);

-- отклонённые refresh-токены (хранятся до истечения срока)
CREATE TABLE IF NOT EXISTS bad_refresh_tokens (
  token_hash varchar(64) PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  reason varchar(32) NOT NULL DEFAULT 'invalid',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bad_refresh_tokens_expires_at
  ON bad_refresh_tokens (expires_at);

-- перенос версии из старой колонки users.token_version (если она была)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'token_version'
  ) THEN
    INSERT INTO user_token_versions (user_id, version)
    SELECT id, token_version FROM users
    ON CONFLICT (user_id) DO NOTHING;

    ALTER TABLE users DROP COLUMN token_version;
  END IF;
END $$;
```

## Как устроен вход через провайдера

У каждого внешнего провайдера — отдельная пара маршрутов:

- `GET /api/auth/github` → `/api/auth/github/callback`
- `GET /api/auth/authentik` → `/api/auth/authentik/callback`
- `GET /api/auth/invision` → `/api/auth/invision/callback`
- `GET /api/auth/yandex` → `/api/auth/yandex/callback`

На старте в сессии сохраняются `state` и PKCE-verifier, затем браузер
перенаправляется к провайдеру. Callback возвращает `{ accessToken }` в теле и
ставит refresh-токен в httpOnly-cookie. SPA открывает маршрут входа в новой
вкладке: приложение остаётся на месте, а после возврата пользователя
обменивает refresh-cookie на сессию.

Аккаунт ищется по паре `(provider, sub)`; если аккаунта нет — создаётся новый.

**Слияния аккаунтов по email не происходит.** Если аккаунт с таким email уже
существует, вход отклоняется с `409`: иначе можно было бы завести аккаунт на
чужой адрес и войти в чужой аккаунт через провайдера. Привязать провайдера к
существующему аккаунту можно явно из профиля:

- `POST /api/auth/:provider/link` — привязка (пользователь уже вошёл);
- `POST /api/auth/:provider/sync` — обновление профиля из провайдера;
- `DELETE /api/auth/:provider` — отвязка способа входа.

`provider` — один из `authentik`, `yandex`, `github`, `invision`.

Маршруты привязки и синхронизации — только POST: refresh-cookie имеет
`SameSite=Lax` и не отправляется на кросс-сайтовом POST, поэтому состояние
меняется лишь для владельца сессии. После ответа провайдера браузер
возвращается на `FRONTEND_URL`.

Дополнительно у этих маршрутов проверяется `Origin` запроса: он должен
совпадать с `CORS_ORIGIN`/`FRONTEND_URL` (или с origin самого API). Cookie с
`SameSite=Lax` уходит и на кросс-сайтовый POST, если фронтенд и API живут на
одном сайте (разные поддомены) — проверка Origin закрывает этот случай.
Запросы без `Origin` (curl, серверные клиенты) пропускаются: там доступ
контролирует сама сессия.

## Refresh-токены

- Ротация при каждом обновлении: старый токен отзывается, выдаётся новый.
- Токены объединены в семейство (`family_id`). Повторное предъявление уже
  использованного токена считается кражей: отзывается всё семейство, вход
  требуется заново.
- Ротация атомарна (`UPDATE ... WHERE revoked_at IS NULL`): параллельный
  refresh не может выдать два действующих токена.
- «Выйти со всех устройств» отзывает все refresh-сессии и увеличивает
  версию токенов аккаунта (`user_token_versions.version`) — ранее выданные
  access-токены перестают работать до истечения своего срока.
- Отклонённые refresh-токены (невалидная подпись, истёкший, отозванный или
  повторно предъявленный токен) сохраняются в `bad_refresh_tokens` по хешу.
  Запись живёт до `exp`, после чего удаляется, а сам токен повторно не
  принимается.

## Защита на уровне HTTP

- `helmet` — защитные заголовки (HSTS, `X-Content-Type-Options`,
  `X-Frame-Options`). CSP выключен: API отдаёт только JSON.
- Глобальный `ValidationPipe` с `whitelist` и `forbidNonWhitelisted`: лишние
  поля в запросе — ошибка 400, а не молчаливое игнорирование.
- Throttling (`@nestjs/throttler`): общий лимит 300 запросов в минуту, на
  вход — 10 за 5 минут, на регистрацию — 10 за 10 минут, на обновление
  токена — 60 в минуту. Вход дополнительно ограничивается по email.
- `QueryFailedFilter`: нарушение уникальности (`23505`) → 409 вместо 500.
- Вход по паролю всегда сверяется с bcrypt-хэшем (заглушкой), чтобы время
  ответа не зависело от существования email.

## Тесты

```bash
pnpm run test       # unit
pnpm run test:e2e   # e2e (нужна доступная БД)
pnpm run lint
```

## Ограничения

- `express-session` работает на встроенном хранилище: сессии теряются при
  перезапуске процесса и не разделяются между инстансами. Для продакшена с
  несколькими репликами нужен внешний session-store.
- Authentik (OIDC) работает без PKCE: библиотека `passport-openidconnect` не
  поддерживает `code_challenge`. Для OAuth2-провайдеров (Яндекс, GitHub,
  Invision) PKCE включён.
