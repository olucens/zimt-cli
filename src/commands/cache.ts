import { Command } from 'commander';
import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import * as prompts from '@clack/prompts';
import { tableNameToEntityName, tableNameToResourceName } from '../utils/sql-parser';

export const cacheCommand = new Command('r')
  .alias('cache')
  .description('Add Redis cache-aside layer to an existing endpoint/service')
  .argument('<entity-or-sql>', 'Entity name (e.g. users) or SQL SELECT statement')
  .option('--ttl <seconds>', 'Cache TTL in seconds', '300')
  .action(async (entityOrSql: string, options: { ttl: string }) => {
    try {
      const targetDir = process.cwd();
      const appModulePath = path.join(targetDir, 'src', 'app.module.ts');

      if (!fs.existsSync(appModulePath)) {
        prompts.cancel('Not a NestJS project. Run from your project root.');
        process.exit(1);
      }

      let entityName: string;
      let resourceName: string;

      if (/^SELECT\s/i.test(entityOrSql.trim())) {
        const tableMatch = entityOrSql.match(/FROM\s+["']?(\w+)["']?/i);
        if (!tableMatch) {
          prompts.cancel('Could not extract table name from SQL query.');
          process.exit(1);
        }
        resourceName = tableNameToResourceName(tableMatch[1]);
        entityName = tableNameToEntityName(tableMatch[1]);
      } else {
        resourceName = entityOrSql.toLowerCase().replace(/s$/, '');
        entityName = resourceName.charAt(0).toUpperCase() + resourceName.slice(1);
      }

      const ttl = parseInt(options.ttl, 10);
      const s = prompts.spinner();

      // Check if the service file exists
      const serviceFile = path.join(targetDir, 'src', resourceName, `${resourceName}.service.ts`);
      if (!fs.existsSync(serviceFile)) {
        prompts.cancel(
          `Service file not found: src/${resourceName}/${resourceName}.service.ts\n` +
            `Run "zimt generate ${resourceName}" first.`,
        );
        process.exit(1);
      }

      s.start('Adding CacheModule to project...');

      // Add @nestjs/cache-manager and ioredis to package.json
      await addCacheDependencies(targetDir);
      s.stop('✓ Updated package.json');

      // Create cache module
      s.start('Creating cache module...');
      await createCacheModule(targetDir);
      s.stop('✓ Created src/cache/cache.module.ts');

      // Wrap the service with cache-aside pattern
      s.start(`Wrapping ${entityName}Service with cache-aside...`);
      await wrapServiceWithCache(serviceFile, resourceName, entityName, ttl);
      s.stop(`✓ Updated ${resourceName}.service.ts`);

      // Update app.module.ts to import AppCacheModule
      s.start('Wiring AppCacheModule into app.module.ts...');
      await addCacheModuleToApp(appModulePath);
      s.stop('✓ Updated app.module.ts');

      // Add Redis to docker-compose if it exists
      s.start('Checking docker-compose.yml...');
      const dockerComposePath = path.join(targetDir, 'docker-compose.yml');
      if (fs.existsSync(dockerComposePath)) {
        await addRedisToDockerCompose(dockerComposePath);
        s.stop('✓ Added Redis service to docker-compose.yml');
      } else {
        s.stop('⚠ docker-compose.yml not found — skip Redis service addition');
      }

      // Add REDIS_URL to .env.example
      s.start('Updating .env.example...');
      await appendRedisEnvVar(targetDir);
      s.stop('✓ Updated .env.example');

      prompts.outro(
        chalk.green(`\n✓ Redis caching added to ${entityName}Service (TTL: ${ttl}s)\n`),
      );
      console.log(chalk.yellow('⚠️  Next steps:'));
      console.log(
        chalk.yellow('   1. Run: npm install  (installs @nestjs/cache-manager, ioredis)'),
      );
      console.log(chalk.yellow('   2. Add REDIS_URL to your .env file'));
      console.log(chalk.yellow('   3. Ensure Redis is running (see docker-compose.yml)\n'));
    } catch (error: any) {
      prompts.cancel('Cache setup failed.');
      console.error(chalk.red(`\nError: ${error.message}\n`));
      if (error.stack) console.error(error.stack);
      process.exit(1);
    }
  });

async function addCacheDependencies(targetDir: string): Promise<void> {
  const pkgPath = path.join(targetDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return;

  const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
  const cacheDeps: Record<string, string> = {
    '@nestjs/cache-manager': '^2.0.0',
    'cache-manager': '^5.0.0',
    'cache-manager-ioredis-yet': '^2.0.0',
    ioredis: '^5.3.0',
  };
  const cacheDevDeps: Record<string, string> = {
    '@types/cache-manager': '^4.0.0',
  };

  pkg.dependencies = { ...pkg.dependencies, ...cacheDeps };
  pkg.devDependencies = { ...pkg.devDependencies, ...cacheDevDeps };

  await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
}

async function createCacheModule(targetDir: string): Promise<void> {
  const cacheDir = path.join(targetDir, 'src', 'cache');
  await fs.ensureDir(cacheDir);

  const cacheModuleContent = `import { Global, Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-ioredis-yet';

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async () => ({
        store: await redisStore({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
          password: process.env.REDIS_PASSWORD || undefined,
        }),
        ttl: parseInt(process.env.CACHE_TTL || '300', 10),
      }),
    }),
  ],
  exports: [CacheModule],
})
export class AppCacheModule {}
`;

  await fs.writeFile(path.join(cacheDir, 'cache.module.ts'), cacheModuleContent);
}

async function wrapServiceWithCache(
  serviceFile: string,
  resourceName: string,
  entityName: string,
  ttl: number,
): Promise<void> {
  const content = await fs.readFile(serviceFile, 'utf-8');

  if (content.includes('@Inject(CACHE_MANAGER)') || content.includes('cacheManager')) {
    return;
  }

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

async function addCacheModuleToApp(appModulePath: string): Promise<void> {
  const content = await fs.readFile(appModulePath, 'utf-8');

  if (content.includes('AppCacheModule')) return;

  let updated = content;

  updated = `import { AppCacheModule } from './cache/cache.module';\n` + updated;

  updated = updated.replace(/imports:\s*\[/, `imports: [\n    AppCacheModule,`);

  await fs.writeFile(appModulePath, updated, 'utf-8');
}

async function addRedisToDockerCompose(composePath: string): Promise<void> {
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

  let updated = content.replace(/(volumes:\s*\n\s*pgdata:)/, `${redisService}\n$1`);

  await fs.writeFile(composePath, updated, 'utf-8');
}

async function appendRedisEnvVar(targetDir: string): Promise<void> {
  const envPath = path.join(targetDir, '.env.example');
  if (!fs.existsSync(envPath)) return;

  const content = await fs.readFile(envPath, 'utf-8');
  if (content.includes('REDIS_URL') || content.includes('REDIS_HOST')) return;

  const redisVars = `
# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
CACHE_TTL=300
`;
  await fs.appendFile(envPath, redisVars);
}
