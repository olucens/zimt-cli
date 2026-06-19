import * as fs from 'fs-extra';
import * as path from 'path';

export async function addCacheDependencies(targetDir: string): Promise<void> {
  const pkgPath = path.join(targetDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return;

  const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
  // NestJS 11 stack: @nestjs/cache-manager@3 requires cache-manager>=6 (Keyv-based)
  // and keyv>=5. The legacy cache-manager@5 + cache-manager-ioredis-yet API is
  // incompatible with @nestjs/common@11 (peer ^9||^10) and was the ERESOLVE cause.
  const cacheDeps: Record<string, string> = {
    '@nestjs/cache-manager': '^3.0.0',
    'cache-manager': '^6.0.0',
    '@keyv/redis': '^5.0.0',
    keyv: '^5.0.0',
  };

  pkg.dependencies = { ...pkg.dependencies, ...cacheDeps };

  await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
}

export async function createCacheModule(targetDir: string): Promise<void> {
  const cacheDir = path.join(targetDir, 'src', 'cache');
  await fs.ensureDir(cacheDir);

  const cacheModuleContent = `import { Global, Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { createKeyv } from '@keyv/redis';

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: () => ({
        stores: [createKeyv(process.env.REDIS_URL || 'redis://localhost:6379')],
        ttl: parseInt(process.env.CACHE_TTL || '300', 10) * 1000,
      }),
    }),
  ],
  exports: [CacheModule],
})
export class AppCacheModule {}
`;

  await fs.writeFile(path.join(cacheDir, 'cache.module.ts'), cacheModuleContent);
}

export async function wrapServiceWithCache(
  serviceFile: string,
  resourceName: string,
  entityName: string,
  ttl: number,
): Promise<void> {
  const content = await fs.readFile(serviceFile, 'utf-8');

  if (content.includes('@Inject(CACHE_MANAGER)') || content.includes('cacheManager')) {
    return;
  }

  // The generated resource service already imports Inject from @nestjs/common.
  const cacheImport = `import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
`;

  const injectCacheInConstructor = (src: string): string => {
    return src.replace(
      /constructor\s*\(/,
      `constructor(\n    @Inject(CACHE_MANAGER) private cacheManager: Cache,\n    `,
    );
  };

  const wrapFindAll = (src: string): string => {
    return src.replace(
      /async findAll\([^)]*\)\s*\{[\s\S]*?return this\.repository\.findAll\([^)]*\);[\s\S]*?\}/,
      `async findAll(parentId?: string) {
    const cacheKey = \`${resourceName}:all:\${parentId ?? ''}\`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;
    const result = await this.repository.findAll(parentId);
    await this.cacheManager.set(cacheKey, result, ${ttl} * 1000);
    return result;
  }`,
    );
  };

  let updated = cacheImport + content;
  updated = injectCacheInConstructor(updated);
  updated = wrapFindAll(updated);

  await fs.writeFile(serviceFile, updated, 'utf-8');
}

export async function addCacheModuleToApp(appModulePath: string): Promise<void> {
  const content = await fs.readFile(appModulePath, 'utf-8');

  if (content.includes('AppCacheModule')) return;

  let updated = content;

  updated = `import { AppCacheModule } from './cache/cache.module';\n` + updated;

  updated = updated.replace(/imports:\s*\[/, `imports: [\n    AppCacheModule,`);

  await fs.writeFile(appModulePath, updated, 'utf-8');
}

export async function addRedisToDockerCompose(composePath: string): Promise<void> {
  const content = await fs.readFile(composePath, 'utf-8');

  if (content.includes('redis:')) return;

  const redisService = `
  redis:
    container_name: redis
    image: redis:7-alpine
    restart: unless-stopped
    ports:
      - "\${REDIS_PORT:-6379}:6379"
    command: redis-server --requirepass \${REDIS_PASSWORD:-}
    networks:
      - app-network
`;

  const updated = content.replace(/(volumes:\s*\n\s*pgdata:)/, `${redisService}\n$1`);

  await fs.writeFile(composePath, updated, 'utf-8');
}

export async function appendRedisEnvVar(targetDir: string): Promise<void> {
  const envPath = path.join(targetDir, '.env.example');
  if (!fs.existsSync(envPath)) return;

  const content = await fs.readFile(envPath, 'utf-8');
  if (content.includes('REDIS_URL') || content.includes('REDIS_HOST')) return;

  const redisVars = `
# Redis (cache-manager + Keyv). CACHE_TTL is in seconds.
REDIS_URL=redis://localhost:6379
CACHE_TTL=300
`;
  await fs.appendFile(envPath, redisVars);
}

export interface CacheCoreOptions {
  /** Cache TTL in seconds. Default 300. */
  ttl?: number;
  silent?: boolean;
}

/**
 * Add a Redis cache-aside layer to an existing resource service. Pure core:
 * headless, no prompts, never exits or inspects the current directory.
 * Throws on failure. Idempotent: a second call on an already-cached service
 * is a no-op.
 */
export async function addCacheCore(
  targetDir: string,
  entity: string,
  opts: CacheCoreOptions = {},
): Promise<void> {
  const log = (msg: string) => {
    if (!opts.silent) console.log(msg);
  };

  const appModulePath = path.join(targetDir, 'src', 'app.module.ts');
  if (!fs.existsSync(appModulePath)) {
    throw new Error(
      `Not a NestJS project: ${path.join(targetDir, 'src', 'app.module.ts')} not found`,
    );
  }

  // Resource folders may be named after the singular entity (name mode) or
  // the raw table name (SQL mode, usually plural) — accept either.
  const base = entity.toLowerCase();
  const candidates = [...new Set([base, base.replace(/s$/, ''), `${base}s`])];
  const resourceName = candidates.find((name) =>
    fs.existsSync(path.join(targetDir, 'src', name, `${name}.service.ts`)),
  );
  if (!resourceName) {
    throw new Error(
      `Service file not found for entity "${entity}" (tried ${candidates.join(', ')}) — generate the resource first`,
    );
  }

  const singular = resourceName.replace(/s$/, '');
  const entityName = singular.charAt(0).toUpperCase() + singular.slice(1);
  const ttl = opts.ttl ?? 300;

  const serviceFile = path.join(targetDir, 'src', resourceName, `${resourceName}.service.ts`);

  await addCacheDependencies(targetDir);
  log('✓ Updated package.json');

  await createCacheModule(targetDir);
  log('✓ Created src/cache/cache.module.ts');

  await wrapServiceWithCache(serviceFile, resourceName, entityName, ttl);
  log(`✓ Updated ${resourceName}.service.ts`);

  await addCacheModuleToApp(appModulePath);
  log('✓ Updated app.module.ts');

  const dockerComposePath = path.join(targetDir, 'docker-compose.yml');
  if (fs.existsSync(dockerComposePath)) {
    await addRedisToDockerCompose(dockerComposePath);
    log('✓ Added Redis service to docker-compose.yml');
  }

  await appendRedisEnvVar(targetDir);
  log('✓ Updated .env.example');
}
