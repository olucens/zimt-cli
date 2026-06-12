/**
 * Headless API scenario — specs/SPEC-zimt-core-headless.md
 * Every test maps to an acceptance criterion. All functions must resolve to
 * Result, never throw, never prompt, never print in silent mode.
 */
import * as fs from 'fs-extra';
import * as path from 'path';
import { makeTmpDir, cleanDir, fileExists, readFile, blankConfig } from '../helpers/test-utils';
import {
  initProject,
  addAuth,
  generateFromSql,
  appendModelToSchema,
  addCache,
  cloudify,
} from '../../src/api';

jest.mock('child_process', () => ({ execSync: jest.fn() }));

const ORDERS_SQL =
  'CREATE TABLE orders (id SERIAL PRIMARY KEY, total DECIMAL NOT NULL, user_id UUID)';

async function freshProject(prefix: string): Promise<string> {
  const dir = await makeTmpDir(prefix);
  const result = await initProject(blankConfig({ name: `test-${prefix}` }), dir, {
    skipInstall: true,
    silent: true,
  });
  if (!result.ok) throw new Error(`initProject failed: ${result.error}`);
  return dir;
}

describe('Acceptance 1: initProject — silent, skipInstall, no process exit', () => {
  let dir: string;
  let logSpy: jest.SpyInstance;

  beforeAll(async () => {
    logSpy = jest.spyOn(console, 'log').mockImplementation();
    dir = await makeTmpDir('api-init');
  });

  afterAll(async () => {
    logSpy.mockRestore();
    await cleanDir(dir);
  });

  it('creates the full blank project, resolves ok:true, prints nothing', async () => {
    const result = await initProject(blankConfig({ name: 'test-headless' }), dir, {
      skipInstall: true,
      silent: true,
    });
    expect(result.ok).toBe(true);
    expect(fileExists(dir, 'package.json')).toBe(true);
    expect(fileExists(dir, 'src', 'app.module.ts')).toBe(true);
    expect(fileExists(dir, 'prisma', 'schema.prisma')).toBe(true);
    expect(fileExists(dir, 'Dockerfile')).toBe(true);
    expect(fileExists(dir, 'node_modules')).toBe(false);
    expect(logSpy).not.toHaveBeenCalled();
  });
});

describe('Acceptance 2+3: addAuth', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await freshProject('api-auth');
  });

  afterAll(async () => {
    await cleanDir(dir);
  });

  it('adds auth to a fresh project: files, schema, deps, app.module wiring', async () => {
    const result = await addAuth(dir, { silent: true });
    expect(result).toEqual({ ok: true, value: undefined });

    expect(fileExists(dir, 'src', 'auth', 'auth.module.ts')).toBe(true);
    expect(readFile(dir, 'prisma/schema.prisma')).toContain('model User');

    const pkg = JSON.parse(readFile(dir, 'package.json'));
    expect(pkg.dependencies['@nestjs/jwt']).toBeDefined();
    expect(pkg.dependencies['bcrypt']).toBeDefined();

    const appModule = readFile(dir, 'src/app.module.ts');
    expect(appModule.match(/APP_GUARD/g)!.length).toBeGreaterThanOrEqual(2);
    expect(appModule).toContain('configure(');
  });

  it('returns ok:false without modifying files when auth exists and overwrite unset', async () => {
    const before = readFile(dir, 'src/app.module.ts');
    const result = await addAuth(dir, { silent: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('already exists');
    expect(readFile(dir, 'src/app.module.ts')).toBe(before);
  });
});

describe('Acceptance 4: generateFromSql', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await freshProject('api-gen');
  });

  afterAll(async () => {
    await cleanDir(dir);
  });

  it('generates the resource and returns the prisma model', async () => {
    const result = await generateFromSql(dir, ORDERS_SQL);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.prismaModel).toContain('model Order');
      expect(result.value.resourceName).toBe('orders');
      expect(result.value.entityName).toBe('Order');
    }
    expect(fileExists(dir, 'src', 'orders', 'orders.service.ts')).toBe(true);
    expect(fileExists(dir, 'src', 'orders', 'orders.controller.ts')).toBe(true);
  });

  it('returns ok:false (not throw) on invalid SQL', async () => {
    const result = await generateFromSql(dir, 'DROP TABLE orders');
    expect(result.ok).toBe(false);
  });
});

describe('Acceptance 5: appendModelToSchema is idempotent by model name', () => {
  let dir: string;
  const model = 'model Order {\n  id Int @id @default(autoincrement())\n  total Decimal\n}';

  beforeAll(async () => {
    dir = await freshProject('api-schema');
  });

  afterAll(async () => {
    await cleanDir(dir);
  });

  it('appends the model once, even when called twice', async () => {
    const first = await appendModelToSchema(dir, model);
    expect(first.ok).toBe(true);

    const second = await appendModelToSchema(dir, model);
    expect(second.ok).toBe(true);

    const schema = readFile(dir, 'prisma/schema.prisma');
    expect(schema.match(/model Order /g)!.length).toBe(1);
  });

  it('returns ok:false when schema.prisma is missing', async () => {
    const empty = await makeTmpDir('api-schema-empty');
    const result = await appendModelToSchema(empty, model);
    expect(result.ok).toBe(false);
    await cleanDir(empty);
  });

  it('returns ok:false for a string with no model declaration', async () => {
    const result = await appendModelToSchema(dir, 'not a prisma model');
    expect(result.ok).toBe(false);
  });
});

describe('Acceptance 6: addCache', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await freshProject('api-cache');
    const gen = await generateFromSql(dir, ORDERS_SQL);
    if (!gen.ok) throw new Error(gen.error);
  });

  afterAll(async () => {
    await cleanDir(dir);
  });

  it('wraps findAll with cache-aside and creates the cache module', async () => {
    const result = await addCache(dir, 'order', { ttl: 60, silent: true });
    expect(result.ok).toBe(true);

    const service = readFile(dir, 'src/orders/orders.service.ts');
    expect(service).toContain('cacheManager.get');
    expect(service).toContain('cacheManager.set');
    expect(fileExists(dir, 'src', 'cache', 'cache.module.ts')).toBe(true);
  });

  it('second call is a no-op ok:true', async () => {
    const before = readFile(dir, 'src/orders/orders.service.ts');
    const result = await addCache(dir, 'order', { ttl: 60, silent: true });
    expect(result.ok).toBe(true);
    expect(readFile(dir, 'src/orders/orders.service.ts')).toBe(before);
  });

  it('returns ok:false for an entity with no generated service', async () => {
    const result = await addCache(dir, 'ghost', { silent: true });
    expect(result.ok).toBe(false);
  });
});

describe('Acceptance 7: cloudify patches the Dockerfile CMD, idempotent', () => {
  let dir: string;
  const CLOUD_CMD = 'CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/main"]';

  beforeAll(async () => {
    dir = await freshProject('api-cloudify');
  });

  afterAll(async () => {
    await cleanDir(dir);
  });

  it('rewrites the final CMD', async () => {
    const result = await cloudify(dir, { silent: true });
    expect(result.ok).toBe(true);

    const dockerfile = readFile(dir, 'Dockerfile');
    expect(dockerfile).toContain(CLOUD_CMD);
    expect(dockerfile).not.toContain('CMD ["node", "dist/main"]');
  });

  it('is idempotent', async () => {
    const before = readFile(dir, 'Dockerfile');
    const result = await cloudify(dir, { silent: true });
    expect(result.ok).toBe(true);
    expect(readFile(dir, 'Dockerfile')).toBe(before);
  });

  it('returns ok:false when no Dockerfile exists', async () => {
    const empty = await makeTmpDir('api-cloudify-empty');
    const result = await cloudify(empty, { silent: true });
    expect(result.ok).toBe(false);
    await cleanDir(empty);
  });
});

describe('Acceptance 9: static guard — core stays headless', () => {
  const FORBIDDEN = [/@clack/, /process\.exit/, /process\.cwd/];

  it('src/api.ts and src/core/* contain no @clack, process.exit, process.cwd', () => {
    const coreDir = path.resolve(__dirname, '../../src/core');
    const files = fs
      .readdirSync(coreDir)
      .map((f) => path.join(coreDir, f))
      .concat(path.resolve(__dirname, '../../src/api.ts'));

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const pattern of FORBIDDEN) {
        if (pattern.test(content)) {
          throw new Error(`${file} violates headless rule: matches ${pattern}`);
        }
      }
    }
  });
});
