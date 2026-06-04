# Zimt CLI — Отчёт по рефакторингу v0.5 → v1.0-beta

**Ветка:** `feat/06-2026/zimt-v0.5-to-v1`
**Дата:** июнь 2026

---

## Что было найдено (Phase 0 — аудит)

| Проблема | Файл | Критичность |
|----------|------|-------------|
| `js-yaml` импортируется в `main.ts`, но отсутствует в `dependencies` | `template_v002/package.json.ejs` | Критично — падение в production |
| `@prisma/client` в `devDependencies` вместо `dependencies` | `template_v002/package.json.ejs` | Критично — production build не работает |
| `docker-compose.yml` имеет `build: ./postgres` — папки не существует | `template_v002/docker-compose.yml.ejs` | Критично — Docker не запускается |
| Node 20.8.0 в Dockerfile, но `package.json` требует `>=22.14.0` | `template_v002/Dockerfile.ejs` | Мажорное несоответствие |
| Все шаблоны auth/user/db/logger используют `src/...` абсолютные импорты | 7 `.ejs` файлов | Компиляция падает без `paths` в `tsconfig` |
| `UpdateDto` импортируется из файла `create-*.dto` вместо `update-*.dto` | `resource-generator.ts:272` | Баг — ошибка типов в генерируемом коде |
| Типы entity импортируются из DTO-файла в тестах | `resource-generator.ts:438` | Баг в генерируемых тестах |
| `npm run start:dev` захардкожено вне зависимости от пакетного менеджера | `bin/zimt.ts:79` | UX-проблема |
| `library_db` и слабые секреты захардкожены в `.env.example` | `template_v002/.env.example` | Безопасность + неправильное имя БД |

---

## Что было сделано

### Phase 1 — Пакетные менеджеры

- Добавлен `bun` в тип `PackageManager` (`types.ts`)
- `detectPackageManager()` — читает lockfile в директории и автоопределяет PM
- Флаг `--pm`: `zimt init my-app --pm pnpm`
- Если PM не определён и флаг не передан — интерактивный выбор из 4 вариантов
- Все шаблоны (Dockerfile, docker-compose, скрипты) обновлены под npm/yarn/pnpm/bun

### Phase 1 — Пустой проект по умолчанию

Создан `template_blank` — минимальный NestJS без auth:

```
src/
├── app.module.ts       # только PrismaModule
├── app.controller.ts   # GET /health
├── app.service.ts
├── main.ts             # без swagger, без custom logger
└── prisma/
```

Плюс: `Dockerfile`, `docker-compose.yml` (postgres:16), `.env.example`, `.gitignore`, `README.md` — все через EJS с поддержкой всех 4 PM.

### Phase 1 — Команда `zimt auth`

```bash
zimt auth           # или
zimt create auth    # алиас
```

- Проверяет наличие `src/auth/auth.module.ts` — предупреждает перед перезаписью
- Копирует auth / user / crypto / db / logger из `template_v002` в проект
- Добавляет модель `User` в `prisma/schema.prisma`
- Добавляет зависимости в `package.json` (bcrypt, @nestjs/jwt и др.)
- Дописывает JWT-переменные в `.env.example`
- Через **ts-morph AST** вносит `AuthModule`, `UserModule`, `LoggerModule`, `JwtAuthGuard`, `RolesGuard`, `LoggingMiddleware` в `AppModule`

### Phase 2 — Генерация из SQL

```bash
zimt p create "CREATE TABLE order_items (id SERIAL PRIMARY KEY, total DECIMAL NOT NULL)"
```

- Парсит `CREATE TABLE` — извлекает имя таблицы и колонки
- `order_items` → `OrderItem` (snake_case → PascalCase, убирает множественное число)
- Генерирует: controller, service, module, repository, typed DTOs, entity interface
- Печатает готовую Prisma-модель для ручного добавления в `schema.prisma`
- Регистрирует модуль в `AppModule` через AST

### Phase 2 — Вложенные эндпоинты

```bash
zimt generate subscriptions --parent users
# → GET /users/:userId/subscriptions
```

Работает как с именем, так и с SQL-генерацией.

### Phase 2 — Redis кэш

```bash
zimt r users --ttl 300     # или
zimt cache users --ttl 300
```

- Создаёт `src/cache/cache.module.ts` (ioredis через `cache-manager-ioredis-yet`)
- Оборачивает `findAll` / `findOne` в сервисе паттерном cache-aside
- Добавляет Redis-сервис в `docker-compose.yml`
- Добавляет `REDIS_HOST`, `REDIS_PORT`, `CACHE_TTL` в `.env.example`
- Обновляет зависимости в `package.json`

### Phase 3 — Исправления шаблонов

- Все `src/...` абсолютные импорты → относительные (`../`, `../../`)
- `js-yaml` добавлен в `dependencies`
- `@prisma/client` перемещён в `dependencies`
- `docker-compose.yml` — убран `build: ./postgres`, используется `postgres:16-alpine`
- `Dockerfile` — `node:20.8.0-alpine` → `node:22-alpine`
- `.env.example` — динамическое имя БД через EJS, слабые секреты заменены на плейсхолдеры
- Баги импортов в `resource-generator.ts` исправлены

### Phase 4 — Документация

| Файл | Содержание |
|------|------------|
| `CHANGELOG.md` | Полная история изменений v0.0.3 → v1.0-beta |
| `STRUCTURE.md` | Архитектура CLI: каждая команда, шаблонная система, AST-инъекции, SQL-парсер |
| `README.md` | Перезаписан: quick start, таблица команд, структура генерируемого проекта |

---

## Что требует ручного внимания

- `src/commands/generate.ts` — устаревший файл (legacy), не удалён чтобы не ломать возможные внешние зависимости. Можно удалить безопасно.
- `src/templates/repository.ts` — то же самое, мёртвый код.
- `zimt r` оборачивает сервис regex-заменой, а не через AST (ts-morph). Работает для стандартного шаблона; для нестандартных сервисов потребует ручной доработки.
- `POST /user` в шаблоне auth — публичный эндпоинт (любой может создать аккаунт). Это намеренное решение для MVP, но стоит закрыть в production.

---

## Статус сборки

```
✓ tsc — 0 ошибок
✓ copyfiles — шаблоны скопированы в dist/
✓ Pushed → origin/feat/06-2026/zimt-v0.5-to-v1
```
