/**
 * Scenario 4: api-full
 * Multiple endpoints + auth.
 * Verifies: all CRUD files exist, auth wired, protected routes use guards,
 * JWT errors return 401, input validation returns 400.
 */

import { makeTmpDir, cleanDir, fileExists, readFile, blankConfig, assertFileContains } from '../helpers/test-utils';
import { createProject } from '../../src/commands/init';
import { runGenerateFromNameDirect } from '../helpers/generator-test-helper';
import { wireAuthIntoProject } from '../helpers/auth-test-helper';

jest.mock('@clack/prompts', () => ({
  spinner: () => ({ start: jest.fn(), stop: jest.fn() }),
  cancel: jest.fn(),
  confirm: jest.fn().mockResolvedValue(false),
  intro: jest.fn(),
  outro: jest.fn(),
}));
jest.mock('child_process', () => ({ execSync: jest.fn() }));

describe('Scenario: api-full (resources + auth)', () => {
  let tmpDir: string;
  const resources = ['article', 'comment'];

  beforeAll(async () => {
    tmpDir = await makeTmpDir('api-full');

    await createProject(blankConfig({ name: 'test-full' }), tmpDir);

    // Add auth
    await wireAuthIntoProject(tmpDir, 'test-full');

    // Add resources
    for (const resource of resources) {
      await runGenerateFromNameDirect(tmpDir, resource);
    }
  });

  afterAll(async () => {
    await cleanDir(tmpDir);
  });

  // ── Auth files ──────────────────────────────────────────────────────────────

  it('auth module exists', () => {
    expect(fileExists(tmpDir, 'src', 'auth', 'auth.module.ts')).toBe(true);
  });

  it('JwtAuthGuard exists', () => {
    expect(fileExists(tmpDir, 'src', 'auth', 'jwt-auth.guard.ts')).toBe(true);
  });

  it('RolesGuard exists', () => {
    expect(fileExists(tmpDir, 'src', 'auth', 'roles.guard.ts')).toBe(true);
  });

  it('Public decorator exists', () => {
    expect(fileExists(tmpDir, 'src', 'auth', 'decorators', 'public.decorator.ts')).toBe(true);
  });

  it('User model in prisma schema', () => {
    assertFileContains(tmpDir, 'prisma/schema.prisma', 'model User');
  });

  // ── Resource files ──────────────────────────────────────────────────────────

  it.each(resources)('%s: all CRUD files exist', (resource) => {
    expect(fileExists(tmpDir, 'src', resource, `${resource}.module.ts`)).toBe(true);
    expect(fileExists(tmpDir, 'src', resource, `${resource}.controller.ts`)).toBe(true);
    expect(fileExists(tmpDir, 'src', resource, `${resource}.service.ts`)).toBe(true);
  });

  it.each(resources)('%s: DTOs are separate files', (resource) => {
    expect(fileExists(tmpDir, 'src', resource, 'dto', `create-${resource}.dto.ts`)).toBe(true);
    expect(fileExists(tmpDir, 'src', resource, 'dto', `update-${resource}.dto.ts`)).toBe(true);
  });

  // ── App module wiring ───────────────────────────────────────────────────────

  it('app.module.ts has all resource modules', () => {
    const content = readFile(tmpDir, 'src', 'app.module.ts');
    for (const resource of resources) {
      const Name = resource.charAt(0).toUpperCase() + resource.slice(1);
      expect(content).toContain(`${Name}Module`);
    }
  });

  it('app.module.ts imports AuthModule', () => {
    assertFileContains(tmpDir, 'src/app.module.ts', 'AuthModule');
  });

  it('app.module.ts has JwtAuthGuard as APP_GUARD', () => {
    assertFileContains(tmpDir, 'src/app.module.ts', 'JwtAuthGuard');
  });

  it('app.module.ts has RolesGuard as APP_GUARD', () => {
    assertFileContains(tmpDir, 'src/app.module.ts', 'RolesGuard');
  });

  // ── JWT guard checks ────────────────────────────────────────────────────────

  it('JwtAuthGuard verifies token with env secret (no hardcoded key)', () => {
    const content = readFile(tmpDir, 'src', 'auth', 'jwt-auth.guard.ts');
    expect(content).toContain('process.env.JWT_SECRET_KEY');
    expect(content).not.toMatch(/'[a-z0-9]{8,}'/i); // no hardcoded string secret
  });

  it('JwtAuthGuard throws UnauthorizedException on missing token', () => {
    assertFileContains(tmpDir, 'src/auth/jwt-auth.guard.ts', 'UnauthorizedException');
  });

  it('auth.service.ts checks for non-existent JWT secret key', () => {
    const content = readFile(tmpDir, 'src', 'auth', 'auth.service.ts');
    expect(content).toContain('JWT_SECRET_KEY');
    expect(content).not.toContain('secret123123');
  });

  // ── Validation (400 expected) ───────────────────────────────────────────────

  it('main.ts has ValidationPipe with whitelist and forbidNonWhitelisted', () => {
    const content = readFile(tmpDir, 'src', 'main.ts');
    expect(content).toContain('whitelist');
    expect(content).toContain('forbidNonWhitelisted');
  });

  it.each(resources)('%s: create DTO has @IsNotEmpty validator', (resource) => {
    assertFileContains(tmpDir, `src/${resource}/dto/create-${resource}.dto.ts`, '@IsNotEmpty');
  });

  // ── .env.example security ───────────────────────────────────────────────────

  it('.env.example has JWT_SECRET_KEY placeholder', () => {
    assertFileContains(tmpDir, '.env.example', 'JWT_SECRET_KEY');
  });

  it('.env.example does NOT have weak secrets', () => {
    const content = readFile(tmpDir, '.env.example');
    expect(content).not.toContain('secret123123');
    expect(content).not.toContain('password=12345');
  });
});
