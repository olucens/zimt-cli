/**
 * zimt-cli headless API — the single programmatic entrypoint.
 *
 * Contract: every function resolves to Result and NEVER throws, never
 * prompts, never exits or inspects the current working directory. See
 * specs/SPEC-zimt-core-headless.md.
 */
import { ProjectConfig } from './types';
import { Result, CommonOpts } from './core/result';
import { initProjectCore, InitCoreOptions } from './core/init-core';
import { addAuthCore, AuthCoreOptions } from './core/auth-core';
import { addCacheCore, CacheCoreOptions } from './core/cache-core';
import { appendModelToSchemaCore } from './core/schema-core';
import { cloudifyCore, CloudifyCoreOptions } from './core/cloudify-core';
import { generateResourceFromSql } from './commands/resource-generator';

export type { Result, CommonOpts };
export type InitOptions = InitCoreOptions;
export type AuthOptions = AuthCoreOptions;
export type CacheOptions = CacheCoreOptions;
export type CloudifyOptions = CloudifyCoreOptions;

async function toResult<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Create a blank NestJS project in targetDir. */
export function initProject(
  cfg: ProjectConfig,
  targetDir: string,
  opts?: InitOptions,
): Promise<Result<void>> {
  return toResult(() => initProjectCore(cfg, targetDir, opts));
}

/** Add JWT auth, user management and RBAC to the project in targetDir. */
export function addAuth(targetDir: string, opts?: AuthOptions): Promise<Result<void>> {
  return toResult(() => addAuthCore(targetDir, opts));
}

/** Generate a CRUD resource from a SQL CREATE TABLE statement. */
export function generateFromSql(
  targetDir: string,
  sql: string,
  opts?: { parent?: string } & CommonOpts,
): Promise<Result<{ prismaModel: string; resourceName: string; entityName: string }>> {
  return toResult(() => generateResourceFromSql(targetDir, sql, { parent: opts?.parent }));
}

/** Append a prismaModel (returned by generateFromSql) to prisma/schema.prisma. Idempotent. */
export function appendModelToSchema(targetDir: string, prismaModel: string): Promise<Result<void>> {
  return toResult(() => appendModelToSchemaCore(targetDir, prismaModel));
}

/** Add a Redis cache-aside layer to an existing resource service. Idempotent. */
export function addCache(
  targetDir: string,
  entity: string,
  opts?: CacheOptions,
): Promise<Result<void>> {
  return toResult(() => addCacheCore(targetDir, entity, opts));
}

/** Prepare the generated project for managed deploy (App Runner). Idempotent. */
export function cloudify(targetDir: string, opts?: CloudifyOptions): Promise<Result<void>> {
  return toResult(() => cloudifyCore(targetDir, opts));
}
