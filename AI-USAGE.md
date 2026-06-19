# zimt-cli — AI Usage Guide

Machine-oriented contract for AI agents (and future MCP servers) that drive zimt-cli
programmatically. If you are an AI generating a backend: read this file, follow the
pipeline order exactly, and only use the headless API — never the interactive CLI.

## What this tool does

zimt-cli generates production-ready NestJS + Prisma (PostgreSQL) backends:
project scaffold, JWT auth + RBAC, CRUD resources from SQL `CREATE TABLE`
statements, Redis cache-aside, Dockerfile included.

## Two surfaces

| Surface | Entry | For |
|---|---|---|
| Headless API | `import { ... } from 'zimt-cli'` (`src/api.ts`) | AI agents, engines, MCP servers |
| Interactive CLI | `zimt init|auth|generate|r` | Humans in a terminal only |

AI integrations MUST use the headless API: it never prompts, never exits the
process, never reads the current working directory, and always resolves to a
`Result` instead of throwing:

```ts
type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };
```

## Pipeline order (invariant)

Operations are filesystem transformations on one target directory. Order matters:

```
initProject → addAuth? → [generateFromSql → appendModelToSchema]×N → addCache×M → cloudify
```

- `appendModelToSchema` MUST follow every `generateFromSql` — otherwise the
  generated code references Prisma types that do not exist and `tsc` fails.
- `cloudify` is always last; it prepares the Dockerfile for managed hosting
  (runs `prisma db push` on container start).
- After the pipeline, the consumer runs `npx prisma generate` and builds/deploys.

## Operations (MCP-ready tool manifest)

```json
{
  "tools": [
    {
      "name": "init_project",
      "maps_to": "initProject(cfg, targetDir, opts)",
      "description": "Create a blank NestJS+Prisma project in targetDir.",
      "input": {
        "targetDir": "string — absolute path, will be created",
        "cfg": {
          "name": "string — kebab-case project name",
          "packageManager": "'npm' (use npm for cloud pipelines)",
          "database": "'prisma-postgresql' (only option)",
          "authStrategy": "'jwt' (only option)"
        },
        "opts": { "skipInstall": "boolean — true for server-side use", "silent": "boolean" }
      }
    },
    {
      "name": "add_auth",
      "maps_to": "addAuth(targetDir, opts)",
      "description": "Add JWT auth, user management, RBAC. Fails with ok:false if auth already exists and overwrite is not set.",
      "input": { "targetDir": "string", "opts": { "overwrite": "boolean", "silent": "boolean" } }
    },
    {
      "name": "generate_from_sql",
      "maps_to": "generateFromSql(targetDir, sql, opts)",
      "description": "Generate full CRUD resource (module/controller/service/DTO/repository/tests) from one SQL CREATE TABLE statement. Returns the Prisma model as a string.",
      "input": {
        "targetDir": "string",
        "sql": "string — single CREATE TABLE statement, PostgreSQL types",
        "opts": { "parent": "string? — parent resource for nested routes (FK column <parent>_id must exist)", "silent": "boolean" }
      },
      "output": { "prismaModel": "string", "resourceName": "string", "entityName": "string" }
    },
    {
      "name": "append_model_to_schema",
      "maps_to": "appendModelToSchema(targetDir, prismaModel)",
      "description": "Append the prismaModel returned by generate_from_sql into prisma/schema.prisma. Idempotent by model name. REQUIRED after every generate_from_sql.",
      "input": { "targetDir": "string", "prismaModel": "string" }
    },
    {
      "name": "add_cache",
      "maps_to": "addCache(targetDir, entity, opts)",
      "description": "Add Redis cache-aside to an existing resource's findAll. Idempotent. Entity accepts singular or plural.",
      "input": { "targetDir": "string", "entity": "string", "opts": { "ttl": "number — seconds, default 300", "silent": "boolean" } }
    },
    {
      "name": "cloudify",
      "maps_to": "cloudify(targetDir, opts)",
      "description": "Prepare for managed deploy: Dockerfile CMD becomes 'npx prisma db push --skip-generate && node dist/main'. Idempotent.",
      "input": { "targetDir": "string", "opts": { "dbPushOnStart": "boolean — default true", "silent": "boolean" } }
    }
  ]
}
```

## Rules for AI agents

1. **SQL-mode only.** Never use name-based generation (`generateResourceByName`,
   `zimt generate <name>`) — it skips the Prisma schema and the generated code
   will not compile. Designing explicit `CREATE TABLE` statements is the point.
2. **One table per call.** Split multi-table designs into separate
   `generate_from_sql` calls; order parents before children and pass `parent`
   for nested REST routes.
3. **Always pair** `generate_from_sql` with `append_model_to_schema`.
4. **Check every Result.** `ok:false` carries a human-readable `error`; stop the
   pipeline and surface it — do not retry blindly.
5. **Use `silent: true`** server-side; output is for terminals.
6. **PostgreSQL types** in SQL: SERIAL/UUID/TEXT/VARCHAR/DECIMAL/BOOLEAN/
   TIMESTAMP/JSONB are mapped to DTO validators and Prisma types.

## Example session (AI-planned task tracker)

```ts
import { initProject, addAuth, generateFromSql, appendModelToSchema, addCache, cloudify } from 'zimt-cli';

const dir = '/tmp/task-tracker';
const opts = { silent: true };

await initProject({ name: 'task-tracker', packageManager: 'npm', database: 'prisma-postgresql', authStrategy: 'jwt' }, dir, { skipInstall: true, ...opts });
await addAuth(dir, opts);

const projects = await generateFromSql(dir, 'CREATE TABLE projects (id UUID PRIMARY KEY, name TEXT NOT NULL)', opts);
if (!projects.ok) throw new Error(projects.error);
await appendModelToSchema(dir, projects.value.prismaModel);

const tasks = await generateFromSql(dir, 'CREATE TABLE tasks (id UUID PRIMARY KEY, title TEXT NOT NULL, done BOOLEAN DEFAULT false, project_id UUID)', { parent: 'project', ...opts });
if (!tasks.ok) throw new Error(tasks.error);
await appendModelToSchema(dir, tasks.value.prismaModel);

await addCache(dir, 'tasks', { ttl: 60, ...opts });
await cloudify(dir, opts);
// → npx prisma generate && docker build — ready for App Runner / any Docker host
```

## Roadmap note

An MCP server exposing exactly this manifest (one MCP tool per operation, plus a
composite `create_backend` tool that runs the whole pipeline from a ProjectPlan)
is planned as a thin wrapper over `src/api.ts`. Keep this file in sync with
`src/api.ts` — it is the contract source for that wrapper and for SaaS-side
AI agents (zimt-project packages/ai-agent).
