/**
 * Golden pipeline — specs/SPEC-zimt-core-headless.md acceptance #8.
 * Real npm install + prisma generate + tsc on a generated project, so it is
 * slow (minutes) and only runs when GOLDEN=1 (npm run test:golden / CI).
 *
 * tmpdir → initProject → addAuth → generateFromSql ×2 (products with parent FK)
 * → appendModelToSchema ×2 → npm install → prisma generate → tsc --noEmit = 0.
 */
import { execSync } from 'child_process';
import { makeTmpDir, cleanDir, readFile, blankConfig } from '../helpers/test-utils';
import {
  initProject,
  addAuth,
  generateFromSql,
  appendModelToSchema,
  addCache,
} from '../../src/api';

const golden = process.env.GOLDEN === '1' ? describe : describe.skip;

jest.setTimeout(10 * 60 * 1000);

golden('Golden pipeline: generated project compiles', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await makeTmpDir('golden-pipeline');
  });

  afterAll(async () => {
    await cleanDir(dir);
  });

  it('runs init → auth → 2×(generateFromSql + appendModelToSchema)', async () => {
    const init = await initProject(blankConfig({ name: 'golden-app' }), dir, {
      skipInstall: true,
      silent: true,
    });
    expect(init).toEqual({ ok: true, value: undefined });

    const auth = await addAuth(dir, { silent: true });
    expect(auth).toEqual({ ok: true, value: undefined });

    const orders = await generateFromSql(
      dir,
      'CREATE TABLE orders (id UUID PRIMARY KEY, total DECIMAL NOT NULL, status TEXT)',
    );
    expect(orders.ok).toBe(true);
    if (!orders.ok) return;
    const appendOrders = await appendModelToSchema(dir, orders.value.prismaModel);
    expect(appendOrders.ok).toBe(true);

    const products = await generateFromSql(
      dir,
      'CREATE TABLE products (id UUID PRIMARY KEY, title TEXT NOT NULL, price DECIMAL, order_id UUID)',
      { parent: 'order' },
    );
    expect(products.ok).toBe(true);
    if (!products.ok) return;
    const appendProducts = await appendModelToSchema(dir, products.value.prismaModel);
    expect(appendProducts.ok).toBe(true);

    // Cache layer must be exercised too — its deps/templates have to stay
    // compatible with the generated NestJS version (regression: @nestjs/cache-manager
    // v2 vs @nestjs/common v11 ERESOLVE). The install+tsc step below proves it.
    const cache = await addCache(dir, 'orders', { ttl: 60, silent: true });
    expect(cache.ok).toBe(true);

    const schema = readFile(dir, 'prisma/schema.prisma');
    expect(schema).toContain('model User');
    expect(schema).toContain('model Order');
    expect(schema).toContain('model Product');
  });

  it('npm install + prisma generate + tsc --noEmit all exit 0', () => {
    const run = (cmd: string) =>
      execSync(cmd, { cwd: dir, stdio: 'pipe', env: { ...process.env, NODE_ENV: 'development' } });

    run('npm install --no-audit --no-fund');
    run('npx prisma generate');
    run('npx tsc --noEmit');
  });
});
