# Zimt-CLI Changelog

## [1.0.0-beta] — June 2026

### Added

- **Multi package manager support** — npm, yarn, pnpm, and bun are all supported
  - Auto-detection from lockfile: `bun.lockb` → bun, `pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn
  - `--pm` flag: `zimt init my-app --pm pnpm`
  - Interactive selection when no lockfile is detected and no flag given
- **Blank project init by default** — `zimt init` now creates a minimal NestJS project with no auth, no user module, no extras
  - Health check at `GET /health`
  - PrismaModule wired globally
  - Dockerfile + docker-compose with PostgreSQL 16
  - PM-aware scripts and Docker commands
- **`zimt auth` command** — opt-in auth/user module generation
  - Copies JWT auth module, user module, RBAC guards, logging middleware, crypto utilities
  - Adds User model to `prisma/schema.prisma`
  - Wires AuthModule + UserModule + LoggerModule into AppModule via AST
  - Updates `.env.example` with JWT vars
  - Updates `package.json` with bcrypt, @nestjs/jwt deps
  - Alias: `zimt create auth`
  - Guard: warns before overwriting if auth already present
- **SQL-to-endpoint generation** — `zimt generate create "<CREATE TABLE ...>"`
  - Extracts entity name directly from the SQL `CREATE TABLE` statement
  - Handles snake_case → PascalCase/camelCase (e.g. `order_items` → `OrderItems`)
  - Generates: controller, service, module, repository, DTOs (Create + Update), entity interface
  - Infers Prisma model from SQL column types (prints it in output for manual addition)
  - Wires module into AppModule automatically via AST
- **Nested endpoint support** — `--parent` flag on `zimt generate`
  - `zimt generate subscriptions --parent users` → `/users/:userId/subscriptions`
  - Works with both name-based and SQL-based generation
- **`zimt r` / `zimt cache` command** — Redis cache-aside layer generation
  - Wraps existing service's `findAll`/`findOne` with cache-aside pattern
  - Creates `src/cache/cache.module.ts` (ioredis adapter via `cache-manager-ioredis-yet`)
  - Configurable TTL via `--ttl <seconds>` (default: 300)
  - Adds Redis service to `docker-compose.yml` if present
  - Adds `REDIS_HOST`, `REDIS_PORT`, `CACHE_TTL` to `.env.example`
  - Updates `package.json` with `@nestjs/cache-manager`, `ioredis`

### Changed

- `zimt init` no longer generates auth by default — use `zimt auth` to add it
- `zimt new` is now an alias for `zimt init` (was the primary command before)
- Template system overhauled for NestJS v11+ and Node 22 compatibility
- `bun` added to `PackageManager` union type
- All PM-aware scripts in templates now handle npm/yarn/pnpm/bun correctly

### Fixed

- **Missing `js-yaml` dependency** in `template_v002/package.json.ejs` — it was imported in `main.ts` but absent from `dependencies`
- **`@prisma/client` moved to `dependencies`** (was in `devDependencies` — caused production build failures)
- **`docker-compose.yml` had `build: ./postgres`** — no postgres directory exists; fixed to use the official image directly
- **Node version mismatch** — Dockerfile used `node:20.8.0-alpine` while `package.json` required `>=22.14.0`; updated to `node:22-alpine`
- **Absolute `src/...` imports in templates** — all auth, user, db, crypto files used `src/...` style imports (non-relative, requires `paths` config that wasn't present); fixed to use proper relative imports (`../`, `../../`)
- **Repository interface imported `Update${Name}Dto` from the wrong file** (`create-${name}.dto` instead of `update-${name}.dto`) in `resource-generator.ts`
- **Unit test spec imported `${Name}` entity type from DTO file** — the type lives in `entities/`, not `dto/`; imports corrected
- **Hardcoded `npm run start:dev`** in `bin/zimt.ts` regardless of chosen package manager
- **Hardcoded `library_db`** in `.env.example` — now uses EJS template variable `<%= projectName %>_db`
- **Weak default secrets** in `.env.example` (`secret123123`) — replaced with `change_me_in_production` placeholder
- **`docker-compose.yml` command** used hardcoded `npx` and `npm run start:dev` — now PM-aware

---

## [0.0.3] — February 2026

- Initial MVP release
- `zimt new` — scaffolds full NestJS project with JWT auth, Prisma PostgreSQL, RBAC, Docker
- `zimt generate <name>` — generates CRUD resource (Module, Controller, Service, DTO, Repository, unit + e2e tests)
- ts-morph AST injection for safe `app.module.ts` updates
