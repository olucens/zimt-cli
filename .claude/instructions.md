# zimt-cli — Claude Code Instructions

## What this is
Open-source NestJS backend generator. npm package. CLI tool.
Current version: 1.0.0. After headless refactor → publish as 1.1.0-next.

Spec of record: `../ZIMT-H0-CONTEXT/05-SPEC-zimt-core-headless.md`
(copy in `specs/SPEC-zimt-core-headless.md` if present — keep them in sync).

## What needs to change (and why)

### 1. Headless API — `src/api.ts` (CRITICAL, do first)
Currently all commands use @clack/prompts and process.cwd() inside Commander actions.
Engine in zimt-project cannot call interactive commands server-side.

Single entrypoint `src/api.ts`:
```ts
export type Result<T = void> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export interface CommonOpts { silent?: boolean }

export function initProject(cfg: ProjectConfig, targetDir: string,
  opts?: { skipInstall?: boolean; initializeGit?: boolean } & CommonOpts): Promise<Result>
export function addAuth(targetDir: string,
  opts?: { overwrite?: boolean } & CommonOpts): Promise<Result>
export function generateFromSql(targetDir: string, sql: string,
  opts?: { parent?: string } & CommonOpts):
  Promise<Result<{ prismaModel: string; resourceName: string; entityName: string }>>
export function appendModelToSchema(targetDir: string, prismaModel: string): Promise<Result>  // NEW
export function addCache(targetDir: string, entity: string,
  opts?: { ttl?: number } & CommonOpts): Promise<Result>
export function cloudify(targetDir: string,
  opts?: { dbPushOnStart?: boolean } & CommonOpts): Promise<Result>  // NEW
```

Rules:
- Core functions: zero @clack, zero process.cwd(), zero process.exit(), never throw across API boundary
- `silent: true` suppresses all output; non-silent core uses plain console.log (no clack in core)
- CLI wrappers (Commander actions) call core functions, handle errors, print to terminal
- @clack stays in src/commands/ and bin/ only

### 2. `appendModelToSchema()` — NEW function
Problem: generateFromSql() returns prismaModel as string but doesn't write it to schema.prisma.
Without this, generated code references Prisma types that don't exist → tsc fails.
Solution: append model to prisma/schema.prisma, idempotent by model name (second call = no duplicate).

### 3. `cloudify()` — NEW function
Problem: generated Dockerfile has `CMD ["node", "dist/main"]` — no migrations on startup.
App Runner will start the container but tables won't exist → CRUD fails.
Solution: patch CMD to `["sh", "-c", "npx prisma db push --skip-generate && node dist/main"]`. Idempotent.

### 4. Delete legacy files
- `src/commands/generate.ts` — uses inquirer, references non-existent src/interfaces/
- `src/templates/repository.ts` — legacy string templates, replaced by resource-generator
- Drop `inquirer` from dependencies once generate.ts is gone

### 5. Fix template_v002 shipping buggy script
- Remove `src/templates/template_v002/src/db/db.create.prisma.part.sh` from copy list
- It has undefined variable `data` and ships into every user project via `zimt auth`

## Acceptance criteria
Each criterion in the spec maps to a test — see spec section "Acceptance criteria".
Highlights: silent mode prints nothing; addAuth without overwrite on existing auth → ok:false,
no files touched; appendModelToSchema idempotent; cloudify idempotent; static guard test that
src/api.ts + core modules contain no process.exit/process.cwd/@clack.

## Gate
```bash
npm run test && npm run build
```

After build: verify `dist/` contains compiled templates (copyfiles script).

## Publish
```bash
npm version minor  # 1.0.0 → 1.1.0
npm publish --tag next
```

## DO NOT
- Change public CLI surface (commands, flags, output format)
- Touch template contents unless fixing the specific bugs above
- Add new CLI commands (that's v2 scope)
- Break existing tests without replacing them

## Git workflow
```
main ← npm published versions only
dev  ← integration, must pass gate before merge to main
feature/*, fix/*, chore/* ← cut from dev, merged back to dev
```

Sequence for every change:
1. `git checkout dev && git pull`
2. `git checkout -b feature/<name>`
3. Write tests → write code → gate green → /selfreview
4. PR to dev → human reviews diff
5. Gate green on dev → merge dev to main → `npm publish --tag next`
