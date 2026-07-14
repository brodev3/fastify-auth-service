# fastify-auth-service

Переиспользуемый REST-сервис регистрации и авторизации на Fastify, TypeScript, PostgreSQL и
Redis, приближенный к production-требованиям без лишней сложности. Проект сфокусирован на
регистрации, входе, ротации refresh-токенов и получении данных авторизованного пользователя.

## Требования

- Node.js 24
- npm 11
- Docker с Docker Compose

## Настройка

1. Скопируйте шаблон переменных окружения и замените все значения-заглушки секретов.

   ```sh
   cp .env.example .env
   ```

2. Запустите PostgreSQL и Redis.

   ```sh
   docker compose up -d
   ```

3. Установите зависимости, примените миграции и сгенерируйте Prisma Client.

   ```sh
   npm install
   npm run prisma:migrate:deploy
   npm run prisma:generate
   ```

Соберите и запустите сервис.

```sh
npm run build
npm start
```

Исполняемый composition root создаёт Prisma- и Redis-клиенты, проверяет их при запуске и корректно
закрывает при `SIGINT`/`SIGTERM`. Init-скрипт PostgreSQL создаёт `fastify_auth_test` только при первом
создании Docker volume.

## Переменные окружения

| Переменная             | Назначение                                       | Значение по умолчанию или пример            |
| ---------------------- | ------------------------------------------------ | ------------------------------------------- |
| `NODE_ENV`             | Режим запуска                                    | `development`                               |
| `HOST`                 | Адрес HTTP-сервера                               | `0.0.0.0`                                   |
| `PORT`                 | Порт HTTP-сервера                                | `3000`                                      |
| `LOG_LEVEL`            | Уровень логирования Fastify                      | `info`                                      |
| `POSTGRES_USER`        | Пользователь PostgreSQL в локальном Compose      | `fastify_auth`                              |
| `POSTGRES_PASSWORD`    | Пароль PostgreSQL в локальном Compose            | Обязательная заглушка                       |
| `POSTGRES_DB`          | Локальная development-база                       | `fastify_auth`                              |
| `DATABASE_URL`         | URL подключения приложения к PostgreSQL          | Обязательно                                 |
| `REDIS_URL`            | URL Redis для приложения с DB 0                  | Обязательно                                 |
| `TEST_DATABASE_URL`    | URL PostgreSQL для интеграционных тестов         | Должен указывать на `fastify_auth_test`     |
| `TEST_REDIS_URL`       | URL Redis для интеграционных тестов              | Должен использовать DB 1                    |
| `JWT_ACCESS_SECRET`    | Секрет подписи access-токенов                    | Не менее 32 символов                        |
| `JWT_REFRESH_SECRET`   | Отдельный секрет подписи refresh-токенов         | Не менее 32 символов                        |
| `JWT_ISSUER`           | Издатель JWT                                     | `fastify-auth-service`                      |
| `JWT_ACCESS_AUDIENCE`  | Audience access-токена                           | `fastify-auth-service:access`               |
| `JWT_REFRESH_AUDIENCE` | Audience refresh-токена                          | `fastify-auth-service:refresh`              |
| `CORS_ORIGINS`         | Список разрешённых HTTP(S) origins через запятую | Wildcard запрещён                           |
| `TRUST_PROXY`          | Политика доверия proxy в Fastify                 | `false`, `true` или allowlist через запятую |

Секреты access- и refresh-токенов должны различаться. Не коммитьте `.env` и не используйте
примерные значения вне локальной разработки.

## API-контракт

| Метод  | Путь        | Входные данные                        | Успешный ответ                    |
| ------ | ----------- | ------------------------------------- | --------------------------------- |
| `POST` | `/register` | `{ email, password }`                 | `201` и пара токенов              |
| `POST` | `/login`    | `{ email, password }`                 | `200` и пара токенов              |
| `POST` | `/refresh`  | `{ refreshToken }`                    | `200` и ротированная пара токенов |
| `GET`  | `/me`       | `Authorization: Bearer <accessToken>` | `200` и текущий пользователь      |

Ответ с парой токенов имеет следующий формат:

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "tokenType": "Bearer",
  "accessTokenExpiresIn": 900,
  "refreshTokenExpiresIn": 604800
}
```

`GET /me` возвращает `id`, `email`, `createdAt` и `updatedAt`. Все ошибки используют единый
формат:

```json
{
  "statusCode": 401,
  "code": "AUTH_INVALID_CREDENTIALS",
  "message": "Invalid email or password"
}
```

Опциональное поле `details` предназначено только для безопасного контекста валидации. Ожидаемые
статусы: `400` для ошибок валидации, `401` для неверных credentials или токенов, `404` для
неизвестного маршрута, `409` для дубликата email, `413` для слишком большого тела, `415` для
неподдерживаемого media type, `429` для rate limit, `503` при недоступности обязательной
инфраструктуры и `500` для неожиданных ошибок.

Ошибки валидации возвращаются с кодом `VALIDATION_ERROR` и безопасными `details`, а неизвестные
внутренние ошибки — с `INTERNAL_SERVER_ERROR` без технических сообщений.

## Безопасность

- Email обрезается по краям, приводится к нижнему регистру и защищён уникальным ограничением БД.
- Пароль должен содержать от 8 до 128 символов и хешируется с помощью Argon2id.
- Access JWT действует 15 минут, refresh JWT — 7 дней.
- Redis хранит только `auth:refresh:<jti> -> userId` с соответствующим TTL, но не полный JWT.
- Ротация refresh-токенов атомарная и строгая: из конкурентных запросов со старым токеном проходит один.
- `/login` допускает 10 запросов за 15 минут на один IP.
- `/register` допускает 5 запросов в час на один IP.
- При превышении лимита сервис возвращает `429` с заголовком `Retry-After`; счётчики хранятся в Redis.
- CORS разрешает только точные origins из `CORS_ORIGINS`; wildcard и cookies не используются.
- `TRUST_PROXY` по умолчанию выключен и может быть включён только явной env-настройкой.
- Authorization headers, passwords, cookies и токены скрываются в логах приложения.

## Команды

| Команда                         | Назначение                                              |
| ------------------------------- | ------------------------------------------------------- |
| `npm run build`                 | Собрать сервис в `dist`                                 |
| `npm run typecheck`             | Проверить TypeScript без создания файлов                |
| `npm run lint`                  | Запустить ESLint                                        |
| `npm run format`                | Отформатировать поддерживаемые файлы с помощью Prettier |
| `npm run format:check`          | Проверить форматирование без изменения файлов           |
| `npm test`                      | Однократно запустить Vitest                             |
| `npm run test:watch`            | Запустить Vitest в watch-режиме                         |
| `npm run prisma:format`         | Отформатировать Prisma schema                           |
| `npm run prisma:validate`       | Проверить Prisma config и schema                        |
| `npm run prisma:generate`       | Сгенерировать Prisma Client                             |
| `npm run prisma:migrate:dev`    | Создать или применить локальные development-миграции    |
| `npm run prisma:migrate:deploy` | Применить закоммиченные миграции                        |
| `npm start`                     | Запустить собранный сервис с `.env`, если он существует |

Интеграционные тесты используют `TEST_DATABASE_URL` и `TEST_REDIS_URL` из `.env`. Запуск
блокируется до подключения, если PostgreSQL URL не указывает на `fastify_auth_test` или Redis URL не
использует DB 1.

GitHub Actions запускает тот же набор проверок на Node.js 24 с чистыми PostgreSQL 17 и Redis 7.4
service containers при `push`, `pull_request` и ручном запуске workflow.

## Ключевые решения

Prisma выбрана для явного описания схемы и миграций PostgreSQL с типобезопасной реализацией репозитория.
Пароли хешируются с помощью Argon2id с явно заданными параметрами памяти, итераций и параллелизма, поэтому обратимое хранение credentials исключено.
Redis хранит только разрешённые идентификаторы refresh-сессий и атомарно ротирует их, что поддерживает несколько устройств без сохранения полных JWT.
TypeBox schemas регистрируются непосредственно в Fastify, чтобы runtime-валидация, TypeScript inference и сериализация ответов использовали единый контракт.
