/**
 * Packaging — specs/SPEC-zimt-core-headless.md acceptance #10.
 * npm pack → install the tarball into a temp project → the headless API works
 * and resolves templates from node_modules. Runs only when GOLDEN=1.
 */
import { execSync } from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';
import { makeTmpDir, cleanDir, fileExists } from '../helpers/test-utils';

const golden = process.env.GOLDEN === '1' ? describe : describe.skip;

jest.setTimeout(10 * 60 * 1000);

const repoRoot = path.resolve(__dirname, '../..');

golden('Packaging: tarball install exposes a working headless API', () => {
  let packDir: string;
  let consumerDir: string;
  let outDir: string;

  beforeAll(async () => {
    packDir = await makeTmpDir('golden-pack');
    consumerDir = await makeTmpDir('golden-consumer');
    outDir = await makeTmpDir('golden-out');
  });

  afterAll(async () => {
    await cleanDir(packDir);
    await cleanDir(consumerDir);
    await cleanDir(outDir);
  });

  it('builds, packs, installs and initProject resolves templates from node_modules', () => {
    execSync('npm run build', { cwd: repoRoot, stdio: 'pipe' });
    const tarball = execSync(`npm pack --pack-destination ${packDir}`, {
      cwd: repoRoot,
      stdio: 'pipe',
    })
      .toString()
      .trim()
      .split('\n')
      .pop()!;

    execSync('npm init -y', { cwd: consumerDir, stdio: 'pipe' });
    execSync(`npm install ${path.join(packDir, tarball)} --no-audit --no-fund`, {
      cwd: consumerDir,
      stdio: 'pipe',
    });

    const script = `
      const { initProject } = require('zimt-cli');
      initProject(
        { name: 'pack-app', packageManager: 'npm', database: 'prisma-postgresql', authStrategy: 'jwt' },
        ${JSON.stringify(outDir)},
        { skipInstall: true, silent: true },
      ).then((r) => {
        if (!r.ok) { console.error(r.error); process.exit(1); }
      });
    `;
    fs.writeFileSync(path.join(consumerDir, 'run.js'), script);
    execSync('node run.js', { cwd: consumerDir, stdio: 'pipe' });

    expect(fileExists(outDir, 'package.json')).toBe(true);
    expect(fileExists(outDir, 'src', 'app.module.ts')).toBe(true);
    expect(fileExists(outDir, 'prisma', 'schema.prisma')).toBe(true);
  });
});
