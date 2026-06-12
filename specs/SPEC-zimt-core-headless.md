# SPEC: zimt-core-headless

## Goal
Expose a fully programmatic, prompt-free API from zimt-cli so `packages/engine` (zimt-project) can generate, configure, and cloud-prepare NestJS projects server-side.

## Current status (audited 11 Jun 2026)
- `generateResourceByName(targetDir, name, opts)` — DONE: exported, prompt-free, explicit targetDir.
- `generateResourceFromSql(targetDir, sql, opts)` → `{ prismaModel, resourceName, entityName }` — DONE.
- `createProject(config, targetDir)` — PARTIAL: exported, but (a) always runs package-manager install via execSync, (b) uses @clack spinners internally.
- `auth` — MISSING as API: logic lives inside the Commander action (process.cwd, interactive confirm, process.exit). Pure helpers already exist module-private: `appendUserModelToSchema`, `addAuthDependencies`, `appendAuthEnvVars`, `wireAuthIntoAppModule` — all take explicit paths.
- `cache` — MISSING as API: same pattern; pure helpers exist (`addCacheDependencies`, `createCacheModule`, `wrapServiceWithCache`, `addCacheModuleToApp`, `addRedisToDockerCompose`, `appendRedisEnvVar`).

## Contract — new single entrypoint `src/api.ts`

```ts
export type Result<T = void> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export interface CommonOpts { silent?: boolean }          // suppress all spinner/console output

// 1. Init
export interface InitOptions extends CommonOpts {
  skipInstall?: boolean;        // default false; engine passes true
  initializeGit?: boolean;      // default false
}
export function initProject(cfg: ProjectConfig, targetDir: string, opts?: InitOptions): Promise<Result>;

// 2. Auth
export interface AuthOptions extends CommonOpts {
  overwrite?: boolean;          // default false; if auth exists and !overwrite → ok:false, no prompt
}
export function addAuth(targetDir: string, opts?: AuthOptions): Promise<Result>;

// 3. Resource from SQL (thin re-export with Result wrapper)
export function generateFromSql(
  targetDir: string,
  sql: string,
  opts?: { parent?: string } & CommonOpts,
): Promise<Result<{ prismaModel: string; resourceName: string; entityName: string }>>;

// 4. Cache
export function addCache(
  targetDir: string,
  entity: string,
  opts?: { ttl?: number } & CommonOpts,
): Promise<Result>;

// 5. NEW — append a returned prismaModel into prisma/schema.prisma
export function appendModelToSchema(targetDir: string, prismaModel: string): Promise<Result>;

// 6. NEW — prepare project for managed deploy (App Runner)
export interface CloudifyOptions extends CommonOpts {
  dbPushOnStart?: boolean;      // default true: CMD → "npx prisma db push --skip-generate && node dist/main"
}
export function cloudify(targetDir: string, opts?: CloudifyOptions): Promise<Result>;
```

## Refactor rules
1. Extract pure core functions; CLI Commander actions become thin wrappers: prompts → build options → call core → map Result to exit code. Core NEVER contains `process.cwd()`, `process.exit()`, or `@clack` imports.
2. Spinner output: core takes `silent`; when not silent, plain `console.log` lines (no clack in core). Clack stays in CLI wrappers only.
3. Errors: core returns `Result`, never throws across the API boundary; never calls process.exit.
4. Delete legacy `src/commands/generate.ts` and `src/templates/repository.ts`; drop `inquirer` from dependencies (templates reference non-existent `src/interfaces/` — generates broken code).
5. Remove `db.create.prisma.part.sh` from `template_v002/src/db/` (or add to copy exclusion list) — buggy legacy script (undefined `data` var) currently shipped into every user project by `zimt auth`.
6. Engine consumption is SQL-mode ONLY. Name-based generation never appends schema models → generated code cannot compile (`this.prisma.<accessor>` requires generated client types). Keep name mode CLI-only; document this in README.

## Acceptance criteria (each → test)
1. `initProject({...}, dir, { skipInstall: true, silent: true })` in a temp dir creates the full blank project, no `node_modules`, resolves `ok:true`, prints nothing, never exits the process.
2. `addAuth(dir, { silent: true })` on a fresh blank project (non-TTY env) → `ok:true`; `src/auth/auth.module.ts` exists; `prisma/schema.prisma` contains `model User`; `package.json` deps include `@nestjs/jwt` and `bcrypt`; `app.module.ts` contains both APP_GUARD providers and `configure(` (ts-morph wiring intact).
3. `addAuth` on a project that already has auth and `overwrite` unset → `ok:false` with explanatory error; no files modified.
4. `generateFromSql(dir, "CREATE TABLE orders (id SERIAL PRIMARY KEY, total DECIMAL NOT NULL, user_id UUID)")` → `ok:true`; files under `src/orders/` exist; `value.prismaModel` contains `model Order`.
5. `appendModelToSchema(dir, model)` appends the model; calling it twice results in exactly one occurrence (idempotent by model name).
6. `addCache(dir, 'order', { ttl: 60 })` after generating `order` → service `findAll` contains cache-aside (`cacheManager.get`/`set`); `src/cache/cache.module.ts` exists; second call is a no-op `ok:true`.
7. `cloudify(dir)` rewrites final Dockerfile CMD to `["sh","-c","npx prisma db push --skip-generate && node dist/main"]`; idempotent.
8. PIPELINE (golden precursor, runs in CI): tmpdir → `initProject(skipInstall:false)` → `addAuth` → `generateFromSql` ×2 (orders + products, products with `--parent` orders FK) → `appendModelToSchema` ×2 → `npx prisma generate` → `tsc --noEmit` exits 0. Nightly/full CI additionally: `docker build` + container `GET /health` = 200.
9. Static guard: grep/lint test asserting `src/api.ts` and all core modules contain no `process.exit`, no `process.cwd`, no `@clack` import.
10. Packaging: `npm pack` → install tarball into a tmp project → `initProject` resolves templates from `node_modules` (validates `files` field includes `src/templates/**` or build copies templates into `dist`).

## Out of scope
- Name-based generation in engine path; Swagger setup (separate stretch spec); multi-package-manager in cloud mode (npm only); Windows support; changing the public CLI surface.

## Test plan
- Unit: each API function in `fs.mkdtemp` sandbox, cleaned up in afterEach.
- Pipeline test = acceptance #8, tagged `@golden`, wired into GitHub Actions for zimt-cli (PR-blocking up to tsc; docker boot stage on main only).
- Packaging test = acceptance #10 in CI after build.

## Known risks for downstream (engine) — informational
- Vercel bundling may exclude `.ejs` template files when zimt-cli is imported as a library → zimt-project must set `outputFileTracingIncludes` for `node_modules/zimt-cli/**/templates/**`; verify on first Vercel deploy (Day 15).
- `wrapServiceWithCache` uses regex (not ts-morph) — happy-path only; acceptable for hackathon, note in ADR.
- template_v002 was authored under `strictNullChecks: false`, blank template uses `true`; pipeline test (#8) is the arbiter — fix type errors in auth templates if tsc fails.
