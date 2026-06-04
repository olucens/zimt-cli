# ZIMT-CLI — Project Structure

## Repository Layout

```
zimt-cli/
├── bin/
│   └── zimt.ts                   # CLI entry point — registers all commands
├── src/
│   ├── commands/
│   │   ├── init.ts               # zimt init — project scaffolding
│   │   ├── resource-generator.ts # zimt generate — CRUD endpoint generation
│   │   ├── auth.ts               # zimt auth — opt-in auth module generation
│   │   ├── cache.ts              # zimt r / zimt cache — Redis cache layer
│   │   └── generate.ts           # DEPRECATED — legacy stub, replaced by resource-generator
│   ├── templates/
│   │   ├── template_blank/       # Default blank project template
│   │   │   ├── src/
│   │   │   │   ├── app.module.ts.ejs
│   │   │   │   ├── app.controller.ts.ejs
│   │   │   │   ├── app.service.ts.ejs
│   │   │   │   ├── main.ts.ejs
│   │   │   │   └── prisma/
│   │   │   │       ├── prisma.service.ts.ejs
│   │   │   │       └── prisma.module.ts.ejs
│   │   │   ├── prisma/
│   │   │   │   └── schema.prisma
│   │   │   ├── docker-compose.yml.ejs
│   │   │   ├── Dockerfile.ejs
│   │   │   ├── package.json.ejs
│   │   │   ├── tsconfig.json.ejs
│   │   │   ├── .env.example.ejs
│   │   │   ├── .gitignore.ejs
│   │   │   └── README.md.ejs
│   │   ├── template_v002/        # Full auth template (used by zimt auth)
│   │   │   ├── src/
│   │   │   │   ├── auth/         # JWT auth module + guards + decorators
│   │   │   │   ├── user/         # User module + controller + service + DTOs
│   │   │   │   ├── prisma/       # PrismaService + PrismaModule
│   │   │   │   ├── logger/       # File logger + middleware
│   │   │   │   ├── crypto/       # bcrypt helpers
│   │   │   │   ├── db/user/      # Repository pattern (interface + Prisma impl)
│   │   │   │   ├── app.module.ts.ejs
│   │   │   │   ├── main.ts.ejs
│   │   │   │   └── exceptions.filter.ts.ejs
│   │   │   ├── prisma/
│   │   │   │   └── schema.prisma  # User model
│   │   │   ├── docker-compose.yml.ejs
│   │   │   ├── Dockerfile.ejs
│   │   │   ├── package.json.ejs
│   │   │   └── .env.example.ejs
│   │   └── repository.ts         # DEPRECATED — legacy string templates
│   ├── utils/
│   │   ├── template-manager.ts   # EJS template processing + recursive file copy
│   │   └── sql-parser.ts         # SQL CREATE TABLE parser + type mapper
│   └── types.ts                  # Shared TypeScript interfaces + type aliases
├── CHANGELOG.md
├── STRUCTURE.md
├── README.md
├── package.json
├── tsconfig.json
├── eslint.config.js
└── .prettierrc
```

---

## Command Architecture

### `bin/zimt.ts`

The CLI entry point. Uses [Commander.js](https://github.com/tj/commander.js/) to register commands. No business logic lives here — it delegates to command files in `src/commands/`.

### `src/commands/init.ts`

Handles `zimt init [name] [--pm manager]`.

**Key exports:**
- `createProject(config, targetDir)` — copies the blank template, configures the PM, optionally inits git, installs deps
- `promptProjectConfig(name?, pmFlag?)` — interactive prompt using `@clack/prompts`
- `detectPackageManager(dir)` — reads lockfiles in directory to auto-detect PM
- `getInstallCommand(pm)` / `getRunCommand(pm, script)` — PM-aware command strings

**Template selection:** Always uses `template_blank`. Auth is separate (`zimt auth`).

### `src/commands/resource-generator.ts`

Handles `zimt generate <name>`, `zimt g <name>`, `zimt p <name>`, `zimt p create "<SQL>"`.

**Modes:**
1. **Name-based** (`zimt generate products`) — generates boilerplate with a `name: string` field; developer fills in schema manually
2. **SQL-based** (`zimt generate create "CREATE TABLE ..."`) — parses SQL, extracts column names and types, generates typed DTOs and entity interface; prints Prisma model for manual schema addition

**Generated files per resource:**
- `{name}.module.ts`
- `{name}.controller.ts`
- `{name}.service.ts`
- `dto/create-{name}.dto.ts`
- `dto/update-{name}.dto.ts`
- `entities/{name}.entity.ts`
- `{name}.repository.interface.ts`
- `{name}.repository.ts`
- `{name}.service.spec.ts`
- `{name}.controller.spec.ts`
- `test/{name}/{name}.e2e-spec.ts`

**AST injection:** Uses [ts-morph](https://ts-morph.com/) to safely add `import` and add the new module to the `imports` array of `AppModule` without touching unrelated code.

### `src/commands/auth.ts`

Handles `zimt auth` (alias: `zimt create auth`).

**What it does:**
1. Checks for `src/auth/auth.module.ts` — warns if auth already present
2. Copies auth/user/crypto/db/logger from `template_v002` into the project
3. Appends `User` model to `prisma/schema.prisma`
4. Adds `bcrypt`, `@nestjs/jwt` etc. to `package.json`
5. Appends JWT env vars to `.env.example`
6. Uses ts-morph to wire `AuthModule`, `UserModule`, `LoggerModule`, guards, and middleware into `AppModule`

### `src/commands/cache.ts`

Handles `zimt r <entity>` (alias: `zimt cache <entity>`).

**What it does:**
1. Adds `@nestjs/cache-manager`, `ioredis`, `cache-manager-ioredis-yet` to `package.json`
2. Creates `src/cache/cache.module.ts` with Redis adapter configured from env vars
3. Wraps `findAll` and `findOne` in the target service with cache-aside pattern
4. Adds `AppCacheModule` import to `app.module.ts`
5. Adds Redis service to `docker-compose.yml`
6. Adds `REDIS_HOST`, `REDIS_PORT`, `CACHE_TTL` to `.env.example`

---

## Template System

Templates live in `src/templates/` and are EJS files (`.ejs` extension). The template manager (`src/utils/template-manager.ts`) processes them:

1. Walks the source directory recursively
2. For `.ejs` files: renders with EJS using a context object, writes without the `.ejs` extension
3. For other files: copies as-is
4. Skips: `node_modules`, `.git`, `dist`, `.DS_Store`, `package-lock.json`

**Context variables available in templates:**
| Variable | Description |
|----------|-------------|
| `projectName` | Project name from CLI arg or prompt |
| `description` | Optional project description |
| `author` | Optional author name |
| `license` | License string (default: `UNLICENSED`) |
| `packageManager` | `npm` \| `yarn` \| `pnpm` \| `bun` |
| `database` | `prisma-postgresql` |
| `authStrategy` | `jwt` |

---

## SQL Parser (`src/utils/sql-parser.ts`)

Parses `CREATE TABLE` statements to extract:
- Table name → entity name (snake_case → PascalCase, strips plural `s`)
- Column definitions with: name, SQL type, nullability, uniqueness, PK, auto-increment, defaults

Exports:
- `parseSqlCreateTable(sql)` → `ParsedSqlTable`
- `sqlTypeToPrisma(column)` → Prisma schema field string
- `snakeToCamel`, `snakeToPascal`, `tableNameToEntityName`, `tableNameToRoute`

Supports composite `PRIMARY KEY` and `UNIQUE` constraints in table-level definitions.

---

## AST-Based Code Injection

Both the resource generator and auth command use [ts-morph](https://ts-morph.com/) to modify existing TypeScript files safely:

- **Imports**: checks if the import path already exists; adds named import or creates new import statement
- **`@Module` decorator**: navigates the AST to the `imports` array and appends the new module name
- **`implements NestModule`**: adds the interface and `configure()` method if not present

This avoids fragile string manipulation and preserves existing formatting.

---

## Technologies

| Tool | Purpose |
|------|---------|
| TypeScript 5.x | Source language, strict mode |
| Commander.js | CLI argument/option parsing |
| @clack/prompts | Interactive terminal UI (spinners, selects, confirms) |
| EJS | Template engine for generated project files |
| ts-morph | TypeScript AST manipulation for safe code injection |
| fs-extra | Enhanced file system operations |
| chalk | Terminal colors |
| Node.js ≥20 | Runtime |
