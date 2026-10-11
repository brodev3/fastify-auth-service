# Конфигурация

Скопируйте [`.env.example`](../.env.example) в `.env` и настройте значения до запуска.
`npm start` читает `.env` через Node.js, Prisma CLI и интеграционные тесты — через dotenv.
Уже установленные переменные окружения имеют приоритет над значениями из файла.

## Переменные окружения

В таблице различаются значения по умолчанию в приложении и примеры из `.env.example`.
Обязательные переменные проверяются при загрузке конфигурации; `POSTGRES_*` нужны Docker Compose,
а `TEST_*` — тестовому helper.

| Переменная             | Назначение                           | Требование / значение по умолчанию                              |
| ---------------------- | ------------------------------------ | --------------------------------------------------------------- |
| `NODE_ENV`             | Режим запуска                        | `development` по умолчанию; также `test` или `production`       |
| `HOST`                 | Адрес HTTP-сервера                   | `0.0.0.0` по умолчанию                                          |
| `PORT`                 | Порт HTTP-сервера                    | `3000` по умолчанию; целое число от 1 до 65535                  |
| `LOG_LEVEL`            | Уровень логирования                  | `info` по умолчанию; `fatal/error/warn/info/debug/trace/silent` |
| `POSTGRES_USER`        | Пользователь PostgreSQL в Compose    | Обязательно; пример `fastify_auth`                              |
| `POSTGRES_PASSWORD`    | Пароль PostgreSQL в Compose          | Обязательно; заменить заглушку                                  |
| `POSTGRES_DB`          | Development-база в Compose           | Обязательно; пример `fastify_auth`                              |
| `DATABASE_URL`         | Подключение приложения и Prisma CLI  | Обязательно; `postgresql://` или `postgres://`                  |
| `REDIS_URL`            | Подключение приложения к Redis       | Обязательно; `redis://` или `rediss://`; локально DB 0          |
| `TEST_DATABASE_URL`    | PostgreSQL для интеграционных тестов | Обязательно для тестов; имя БД строго `fastify_auth_test`       |
| `TEST_REDIS_URL`       | Redis для интеграционных тестов      | Обязательно для тестов; путь URL строго `/1`                    |
| `JWT_ACCESS_SECRET`    | Секрет подписи access-токенов        | Обязательно; минимум 32 символа                                 |
| `JWT_REFRESH_SECRET`   | Секрет подписи refresh-токенов       | Обязательно; минимум 32 символа, отличается от access-секрета   |
| `JWT_ISSUER`           | Издатель JWT                         | Обязательно; пример `fastify-auth-service`                      |
| `JWT_ACCESS_AUDIENCE`  | Audience access-токена               | Обязательно; пример `fastify-auth-service:access`               |
| `JWT_REFRESH_AUDIENCE` | Audience refresh-токена              | Обязательно; отличается от access audience                      |
| `CORS_ORIGINS`         | Разрешённые origins через запятую    | Обязательно; пример `http://localhost:3000`; без wildcard       |
| `TRUST_PROXY`          | Доверие proxy при определении IP     | `false` по умолчанию; `true` или allowlist через запятую        |

TTL токенов заданы в коде: access — 900 секунд, refresh — 604800 секунд.
Отдельных env-переменных для сроков действия нет. Сгенерируйте независимые JWT-секреты
[командой из быстрого запуска](../README.md#1-установите-зависимости-и-подготовьте-env).
`.env` исключён из Git; не переносите секреты в README, исходный код или логи.

## PostgreSQL и Redis

Приложение запускается на хосте, PostgreSQL и Redis — в Compose. Локальные порты
`5432` и `6379` публикуются только на `127.0.0.1`; они должны быть свободны.

Пароль из `POSTGRES_PASSWORD` должен совпадать с паролем пользователя в обеих строках
подключения — `DATABASE_URL` и `TEST_DATABASE_URL`. Имя пользователя должно совпадать
с `POSTGRES_USER`, имя development-базы — с `POSTGRES_DB`.
Используйте разные базы для приложения и тестов, даже если PostgreSQL-пользователь один.

Если пароль содержит специальные символы, например `@`, `:` или `/`, кодируйте их в URL
как `%40`, `%3A` или `%2F` соответственно; в `POSTGRES_PASSWORD` оставьте исходные символы.
Для первого локального запуска можно выбрать длинный случайный пароль из букв и цифр,
чтобы не требовалось URL-кодирование.

Изменение `POSTGRES_PASSWORD`, `POSTGRES_USER` или `POSTGRES_DB` в `.env` не меняет уже
инициализированный PostgreSQL volume. При существующем volume используйте действующие
параметры или отдельно настройте БД; не удаляйте volume с нужными данными ради повторного init.

В локальной конфигурации refresh-сессии приложения и счётчики лимитов используют Redis DB 0, тесты — DB 1.
Тесты вызывают `FLUSHDB` для DB 1 и удаляют всех пользователей из тестовой БД.
Проверка имени БД/номера Redis DB не проверяет владельца ресурсов: выделите их только для тестов.

## Тестовая база и существующий volume

[`docker/postgres/init-test-db.sql`](../docker/postgres/init-test-db.sql) создаёт
`fastify_auth_test` только при первом init нового PostgreSQL volume. Для нового checkout
с новым volume достаточно `docker compose up -d --wait`.

Если volume уже существует, init-скрипты повторно не выполняются. После запуска PostgreSQL
выполните идемпотентный скрипт вручную — он создаст только отсутствующую тестовую БД:

```sh
docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /docker-entrypoint-initdb.d/10-init-test-db.sql'
```

Команда подходит для Bash и PowerShell 7. В Windows PowerShell 5.1 используйте
вариант без вложенных двойных кавычек (для значений `POSTGRES_USER`/`POSTGRES_DB` из шаблона):

```powershell
docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U fastify_auth -d fastify_auth -f /docker-entrypoint-initdb.d/10-init-test-db.sql
```

При других именах замените два `fastify_auth` своими значениями. Скрипт создаёт базу,
но не таблицы: затем примените миграции к тестовому URL
[по инструкции проверок](../README.md#тесты-и-проверки).

## CORS и reverse proxy

`CORS_ORIGINS` принимает точные HTTP(S) origins через запятую: схема, хост и при необходимости порт.
Пути, query-параметры, credentials в URL и wildcard запрещены. Например:
`http://localhost:3000,https://app.example.com`. Cookie credentials отключены;
access-токен передаётся в `Authorization: Bearer <accessToken>`.

`TRUST_PROXY=false` использует адрес прямого соединения. За известным reverse proxy
задайте его адреса/подсети, например `127.0.0.1,10.0.0.0/8`.
`true` доверяет всем proxy-заголовкам, поэтому этот режим требует, чтобы до приложения
можно было добраться только через доверенный proxy. Настройка влияет на IP для rate limiting.
