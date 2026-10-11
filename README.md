# Fastify Auth Service

[![CI](https://github.com/brodev3/fastify-auth-service/actions/workflows/ci.yml/badge.svg)](https://github.com/brodev3/fastify-auth-service/actions/workflows/ci.yml)

REST API регистрации, входа, обновления токенов и получения текущего пользователя.
TypeScript в strict-режиме, Fastify 5, PostgreSQL 17 с Prisma 7 и Redis 7.4.

- JWT access- и refresh-токены с разными секретами и audience, проверкой issuer и типа токена.
- Argon2id для хеширования паролей.
- Атомарная одноразовая ротация refresh-сессий в Redis и независимые сессии для нескольких устройств.
- Ограничение запросов на регистрацию и вход с Redis-счётчиками и `Retry-After`.
- Валидация запросов и сериализация ответов через TypeBox/Fastify, единый формат ошибок.
- Unit-тесты и интеграционные тесты через `Fastify.inject` с реальными PostgreSQL и Redis.

## Быстрый запуск

Нужны **Node.js 24.x**, **npm 11.2.0** (версия в `packageManager`) и Docker с Docker Compose,
поддерживающим `up --wait`. Команды выполняются из корня репозитория; Docker должен быть запущен.

### 1. Установите зависимости и подготовьте `.env`

```sh
npm ci
cp .env.example .env
```

В PowerShell вместо `cp` можно использовать `Copy-Item .env.example .env`.

В `.env` замените `POSTGRES_PASSWORD` и тот же пароль в `DATABASE_URL` и `TEST_DATABASE_URL`.
Для локального запуска остальные адреса из шаблона можно оставить: приложение использует
`fastify_auth` и Redis DB 0, тесты — `fastify_auth_test` и Redis DB 1.
Если пароль содержит специальные символы, в URL его нужно percent-encode; подробнее —
[в конфигурации](docs/configuration.md#postgresql-и-redis).

Создайте два случайных JWT-секрета следующей командой — она одинаково работает в Bash и PowerShell:

```sh
node --input-type=module -e "import { randomBytes } from 'node:crypto'; for (const name of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) console.log(name + '=' + randomBytes(32).toString('hex'))"
```

Перенесите полученные значения в `JWT_ACCESS_SECRET` и `JWT_REFRESH_SECRET` в `.env`.
Каждое содержит 64 hex-символа; секреты должны различаться. Не публикуйте их и не коммитьте `.env`.

### 2. Запустите инфраструктуру и подготовьте БД

```sh
docker compose up -d --wait
npm run prisma:generate
npm run prisma:migrate:deploy
```

Compose ждёт успешных healthcheck PostgreSQL и Redis. Миграция создаёт таблицу `users`;
её [SQL](prisma/migrations/20260714000000_init_users/migration.sql) хранится в репозитории.
Тестовая БД создаётся init-скриптом только при первом создании PostgreSQL volume —
[как подготовить существующий volume](docs/configuration.md#тестовая-база-и-существующий-volume).

### 3. Соберите и запустите приложение

```sh
npm run build
npm start
```

Сервис доступен по `http://localhost:3000`. При старте проверяются env, PostgreSQL и Redis;
при недоступности обязательной зависимости запуск завершается с ошибкой.
`SIGINT`/`SIGTERM` запускают graceful shutdown HTTP-сервера и клиентов БД/Redis.

## Пример использования API

Ниже команды для Bash с `curl`; вариант для PowerShell приведён после сценария.
Email и пароль демонстрационные, значения токенов в ответе заменены заглушками.

### Регистрация и получение токенов

```sh
curl -i http://localhost:3000/register -H 'Content-Type: application/json' --data '{"email":"demo@example.com","password":"demo-password-123"}'
```

Ответ `201 Created`:

```json
{
  "accessToken": "<access JWT>",
  "refreshToken": "<refresh JWT>",
  "tokenType": "Bearer",
  "accessTokenExpiresIn": 900,
  "refreshTokenExpiresIn": 604800
}
```

Скопируйте значение поля `accessToken` в следующий запрос вместо `ACCESS_TOKEN`.
Значение поля `refreshToken` понадобится для обновления токенов.
Повторная регистрация того же email вернёт `409`; для существующего пользователя используйте `/login`.

### Получение текущего пользователя

```sh
curl -i http://localhost:3000/me -H 'Authorization: Bearer ACCESS_TOKEN'
```

Ответ `200 OK` имеет следующий формат; UUID и даты будут зависеть от регистрации:

```json
{
  "id": "7b23842f-3995-4e50-b3cc-53d16a610b5c",
  "email": "demo@example.com",
  "createdAt": "2026-07-14T12:00:00.000Z",
  "updatedAt": "2026-07-14T12:00:00.000Z"
}
```

### Обновление токенов

Подставьте значение `refreshToken` из ответа регистрации вместо `REFRESH_TOKEN`:

```sh
curl -i http://localhost:3000/refresh -H 'Content-Type: application/json' --data '{"refreshToken":"REFRESH_TOKEN"}'
```

Ответ `200 OK` содержит новую пару в том же формате. Сохраните оба поля из нового ответа:
после успешной ротации прежний refresh-токен больше не принимается и вернёт `401`.
При двух конкурентных запросах с одним refresh-токеном успешной будет только одна операция.

<details>
<summary>Тот же сценарий в PowerShell</summary>

`Invoke-RestMethod` входит в PowerShell и разбирает JSON без дополнительных утилит:

```powershell
$tokens = Invoke-RestMethod -Method Post -Uri http://localhost:3000/register -ContentType 'application/json' -Body (@{ email = 'demo@example.com'; password = 'demo-password-123' } | ConvertTo-Json)
Invoke-RestMethod -Uri http://localhost:3000/me -Headers @{ Authorization = "Bearer $($tokens.accessToken)" }
$tokens = Invoke-RestMethod -Method Post -Uri http://localhost:3000/refresh -ContentType 'application/json' -Body (@{ refreshToken = $tokens.refreshToken } | ConvertTo-Json)
```

После последней команды `$tokens` содержит новую пару. Используйте новый email, если уже
проходили сценарий в Bash. При обращении к curl из PowerShell вызывайте `curl.exe`, чтобы
не попасть на alias `Invoke-WebRequest`; правила передачи JSON в native-команды зависят от версии PowerShell.

</details>

## API-контракт

| Метод  | Путь        | Входные данные                        | Успешный ответ                    |
| ------ | ----------- | ------------------------------------- | --------------------------------- |
| `POST` | `/register` | `{ email, password }`                 | `201` и пара токенов              |
| `POST` | `/login`    | `{ email, password }`                 | `200` и пара токенов              |
| `POST` | `/refresh`  | `{ refreshToken }`                    | `200` и ротированная пара токенов |
| `GET`  | `/me`       | `Authorization: Bearer <accessToken>` | `200` и текущий пользователь      |

POST-запросы принимают JSON. Все ошибки используют общий формат:

```json
{
  "statusCode": 401,
  "code": "AUTH_INVALID_CREDENTIALS",
  "message": "Invalid email or password"
}
```

Ошибки валидации имеют код `VALIDATION_ERROR` и опциональное поле `details`
с безопасными `field` и `message`. Внутренние ошибки возвращаются как `INTERNAL_SERVER_ERROR`
без stack trace и технических сообщений.

| Статус | Причина                                                |
| ------ | ------------------------------------------------------ |
| `400`  | Невалидный запрос                                      |
| `401`  | Неверные credentials, отсутствующий или неверный токен |
| `404`  | Неизвестный маршрут                                    |
| `409`  | Email уже зарегистрирован                              |
| `413`  | Слишком большое тело запроса                           |
| `415`  | Неподдерживаемый тип содержимого                       |
| `429`  | Превышен лимит запросов                                |
| `503`  | Недоступна обязательная зависимость                    |
| `500`  | Неожиданная внутренняя ошибка                          |

## Архитектура

- [`src/http`](src/http) — маршруты, TypeBox-схемы, преобразование HTTP-запросов/ответов и обработка ошибок.
- [`src/application/auth`](src/application/auth) — `AuthService`, четыре сценария авторизации и интерфейсы зависимостей.
- [`src/infrastructure`](src/infrastructure) — реализации для PostgreSQL/Prisma, Redis, JWT и хеширования паролей.

HTTP-слой вызывает `AuthService`, а сервис работает через интерфейсы репозиториев, токенов и хеширования.
Это позволяет проверять application-логику с подставными зависимостями и заменять адаптеры,
сохраняя HTTP-контракты. [`src/app.ts`](src/app.ts) создаёт Fastify-приложение для `inject()`;
[`src/main.ts`](src/main.ts) собирает реальные зависимости и запускает сервер.

### Ключевые решения

Prisma выбрана для явного описания схемы и миграций PostgreSQL с типобезопасной реализацией репозитория.
Argon2id хеширует пароли с явно заданными параметрами памяти, итераций и параллелизма.
Redis хранит разрешённые идентификаторы refresh-сессий и атомарно ротирует их, что поддерживает несколько устройств без сохранения полных JWT.
TypeBox-схемы регистрируются в Fastify, чтобы runtime-валидация, TypeScript-типы и сериализация ответов использовали единый контракт.

## Поведение и безопасность

- Email обрезается по краям и приводится к нижнему регистру до валидации; уникальное ограничение БД защищает от конкурентных дубликатов.
- Пароль — от 8 до 128 символов; параметры Argon2id: `memoryCost=19456` KiB, `timeCost=2`, `parallelism=1`.
- Access JWT действует 15 минут, refresh JWT — 7 дней; проверяются подпись HS256, issuer, audience, срок действия и claim `type`.
- Redis хранит `auth:refresh:<jti> → userId` с TTL 7 дней. Lua-скрипт проверяет старую сессию, удаляет её и создаёт новую атомарно; grace window нет.
- `/login` допускает 10 запросов за 15 минут на IP, `/register` — 5 в час на IP. Превышение возвращает `429` и `Retry-After` в секундах.
- При ошибке записи refresh-сессии в Redis регистрация откатывает PostgreSQL-транзакцию. Если запись в Redis прошла, но commit БД завершился ошибкой, оставшийся ключ истечёт по TTL.
- `/me` проверяет существование пользователя: access-токен удалённого пользователя возвращает `401`.
- CORS добавляет разрешающие заголовки только для точных origins из `CORS_ORIGINS`; wildcard и cookie credentials отключены. CORS не заменяет проверку access-токена.
- `TRUST_PROXY` по умолчанию выключен. За reverse proxy задавайте доверенные адреса/подсети, чтобы IP-лимиты использовали корректный адрес клиента.
- Logger redaction скрывает Authorization/cookie headers, пароли и поля access/refresh-токенов в предусмотренных структурах логов.

## Тесты и проверки

После быстрого запуска примените миграции также к **тестовой** БД. Prisma CLI читает
`DATABASE_URL`, а не `TEST_DATABASE_URL`; следующая команда временно передаёт тестовый URL
только дочернему процессу и работает в Bash и PowerShell:

```sh
node --env-file=.env --input-type=module -e "import { execSync } from 'node:child_process'; const url = process.env.TEST_DATABASE_URL; if (!url || new URL(url).pathname !== '/fastify_auth_test') throw new Error('TEST_DATABASE_URL must target fastify_auth_test'); execSync('npm run prisma:migrate:deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } })"
```

`TEST_DATABASE_URL` должен указывать на `fastify_auth_test`, а `TEST_REDIS_URL` — на Redis DB 1.
Тестовый helper проверяет эти значения до подключения. Тесты очищают таблицу пользователей
и Redis DB 1, поэтому эти ресурсы должны быть выделены только для тестов.
Если тестовая БД отсутствует в существующем volume, сначала выполните
[инструкцию её создания](docs/configuration.md#тестовая-база-и-существующий-volume).

```sh
npm run prisma:validate
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

Проверяются регистрация и конкурентный дубликат email, неверные credentials, доступ к `/me`,
удалённый пользователь, ротация и повторное использование токенов, конкурентная ротация,
IP-лимиты, CORS, формат ошибок, отказ Redis, rollback регистрации, redaction логов и защита тестовых ресурсов.
`npm run format` применяет Prettier, `npm run test:watch` запускает Vitest в watch-режиме.

### GitHub Actions

[CI](.github/workflows/ci.yml) запускается при `push`, `pull_request` и вручную.
На Node.js 24 с отдельными PostgreSQL 17 и Redis 7.4 он выполняет `npm ci`,
Prisma validate/generate, миграции тестовой БД, format check, lint, typecheck, тесты и сборку.
Текущий статус доступен через бейдж в начале README.

## Подробная конфигурация

[Все переменные окружения, параметры подключения и работа с существующим volume](docs/configuration.md).
Дополнительные Prisma-команды: `npm run prisma:format` форматирует схему,
`npm run prisma:migrate:dev` создаёт и применяет development-миграции.
[План разработки и контрольные точки](docs/development-plan.md) сохранены отдельно.
