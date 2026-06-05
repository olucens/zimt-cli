/**
 * Scenario 1: blank project
 * zimt init test-blank
 * Verifies: clean NestJS scaffold with health check, no auth, rate limiter wired.
 */

import { makeTmpDir, cleanDir, fileExists, readFile, blankConfig, assertFileContains, assertFileNotContains } from '../helpers/test-utils';
import { createProject } from '../../src/commands/init';

jest.mock('@clack/prompts', () => ({
  spinner: () => ({ start: jest.fn(), stop: jest.fn() }),
  cancel: jest.fn(),
}));
jest.mock('child_process', () => ({ execSync: jest.fn() }));

describe('Scenario: blank project generation', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await makeTmpDir('blank');
    await createProject(blankConfig({ name: 'test-blank' }), tmpDir);
  });

  afterAll(async () => {
    await cleanDir(tmpDir);
  });

  // ── File existence ──────────────────────────────────────────────────────────

  it('creates package.json', () => {
    expect(fileExists(tmpDir, 'package.json')).toBe(true);
  });

  it('creates src/main.ts', () => {
    expect(fileExists(tmpDir, 'src', 'main.ts')).toBe(true);
  });

  it('creates src/app.module.ts', () => {
    expect(fileExists(tmpDir, 'src', 'app.module.ts')).toBe(true);
  });

  it('creates src/app.controller.ts', () => {
    expect(fileExists(tmpDir, 'src', 'app.controller.ts')).toBe(true);
  });

  it('creates prisma/schema.prisma', () => {
    expect(fileExists(tmpDir, 'prisma', 'schema.prisma')).toBe(true);
  });

  it('creates Dockerfile', () => {
    expect(fileExists(tmpDir, 'Dockerfile')).toBe(true);
  });

  it('creates docker-compose.yml', () => {
    expect(fileExists(tmpDir, 'docker-compose.yml')).toBe(true);
  });

  it('creates .env.example', () => {
    expect(fileExists(tmpDir, '.env.example')).toBe(true);
  });

  it('creates .gitignore', () => {
    expect(fileExists(tmpDir, '.gitignore')).toBe(true);
  });

  it('creates README.md', () => {
    expect(fileExists(tmpDir, 'README.md')).toBe(true);
  });

  // ── Content correctness ─────────────────────────────────────────────────────

  it('package.json has correct project name', () => {
    const pkg = JSON.parse(readFile(tmpDir, 'package.json'));
    expect(pkg.name).toBe('test-blank');
  });

  it('package.json includes @nestjs/throttler', () => {
    const pkg = JSON.parse(readFile(tmpDir, 'package.json'));
    expect(pkg.dependencies['@nestjs/throttler']).toBeDefined();
  });

  it('package.json includes @prisma/client in dependencies (not devDependencies)', () => {
    const pkg = JSON.parse(readFile(tmpDir, 'package.json'));
    expect(pkg.dependencies['@prisma/client']).toBeDefined();
    expect(pkg.devDependencies?.['@prisma/client']).toBeUndefined();
  });

  it('app.module.ts imports ThrottlerModule', () => {
    assertFileContains(tmpDir, 'src/app.module.ts', 'ThrottlerModule');
  });

  it('app.module.ts imports PrismaModule', () => {
    assertFileContains(tmpDir, 'src/app.module.ts', 'PrismaModule');
  });

  it('app.controller.ts has GET /health endpoint', () => {
    assertFileContains(tmpDir, 'src/app.controller.ts', "health");
    assertFileContains(tmpDir, 'src/app.controller.ts', "@Get('health')");
  });

  it('app.service.ts health() returns status and timestamp', () => {
    assertFileContains(tmpDir, 'src/app.service.ts', 'status');
    assertFileContains(tmpDir, 'src/app.service.ts', 'timestamp');
  });

  it('main.ts sets up ValidationPipe', () => {
    assertFileContains(tmpDir, 'src/main.ts', 'ValidationPipe');
  });

  it('prisma/schema.prisma has postgresql datasource', () => {
    assertFileContains(tmpDir, 'prisma/schema.prisma', 'postgresql');
  });

  it('.env.example has DATABASE_URL', () => {
    assertFileContains(tmpDir, '.env.example', 'DATABASE_URL');
  });

  it('.env.example uses dynamic project name for DB', () => {
    assertFileContains(tmpDir, '.env.example', 'test-blank_db');
  });

  it('.env.example does NOT have hardcoded weak secrets', () => {
    assertFileNotContains(tmpDir, '.env.example', 'secret123123');
  });

  it('docker-compose.yml uses postgres:16', () => {
    assertFileContains(tmpDir, 'docker-compose.yml', 'postgres:16');
  });

  it('docker-compose.yml does NOT have build: ./postgres', () => {
    assertFileNotContains(tmpDir, 'docker-compose.yml', 'build: ./postgres');
  });

  it('Dockerfile uses node:22', () => {
    assertFileContains(tmpDir, 'Dockerfile', 'node:22');
  });

  // ── No auth in blank project ────────────────────────────────────────────────

  it('does NOT create src/auth/', () => {
    expect(fileExists(tmpDir, 'src', 'auth')).toBe(false);
  });

  it('does NOT create src/user/', () => {
    expect(fileExists(tmpDir, 'src', 'user')).toBe(false);
  });

  it('app.module.ts does NOT import AuthModule', () => {
    assertFileNotContains(tmpDir, 'src/app.module.ts', 'AuthModule');
  });
});
