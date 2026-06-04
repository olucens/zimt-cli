/**
 * Scenario 2: auth-only
 * zimt init test-auth && zimt auth
 * Verifies: auth files added, User model in schema, AppModule wired with guards.
 */

import * as path from 'path';
import { makeTmpDir, cleanDir, fileExists, readFile, blankConfig, assertFileContains } from '../helpers/test-utils';
import { createProject } from '../../src/commands/init';

jest.mock('@clack/prompts', () => ({
  spinner: () => ({ start: jest.fn(), stop: jest.fn() }),
  cancel: jest.fn(),
  confirm: jest.fn().mockResolvedValue(false),
  intro: jest.fn(),
  outro: jest.fn(),
}));
jest.mock('child_process', () => ({ execSync: jest.fn() }));

describe('Scenario: auth-only (blank + zimt auth)', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await makeTmpDir('auth');

    // Step 1: generate blank project
    await createProject(blankConfig({ name: 'test-auth' }), tmpDir);

    // Step 2: run auth command internals directly
    const { wireAuthIntoProject } = await import('../helpers/auth-test-helper');
    await wireAuthIntoProject(tmpDir, 'test-auth');
  });

  afterAll(async () => {
    await cleanDir(tmpDir);
  });

  // ── Auth files created ──────────────────────────────────────────────────────

  it('creates src/auth/auth.module.ts', () => {
    expect(fileExists(tmpDir, 'src', 'auth', 'auth.module.ts')).toBe(true);
  });

  it('creates src/auth/auth.service.ts', () => {
    expect(fileExists(tmpDir, 'src', 'auth', 'auth.service.ts')).toBe(true);
  });

  it('creates src/auth/auth.controller.ts', () => {
    expect(fileExists(tmpDir, 'src', 'auth', 'auth.controller.ts')).toBe(true);
  });

  it('creates src/auth/jwt-auth.guard.ts', () => {
    expect(fileExists(tmpDir, 'src', 'auth', 'jwt-auth.guard.ts')).toBe(true);
  });

  it('creates src/auth/roles.guard.ts', () => {
    expect(fileExists(tmpDir, 'src', 'auth', 'roles.guard.ts')).toBe(true);
  });

  it('creates src/auth/decorators/public.decorator.ts', () => {
    expect(fileExists(tmpDir, 'src', 'auth', 'decorators', 'public.decorator.ts')).toBe(true);
  });

  it('creates src/auth/decorators/roles.decorator.ts', () => {
    expect(fileExists(tmpDir, 'src', 'auth', 'decorators', 'roles.decorator.ts')).toBe(true);
  });

  it('creates src/user/user.module.ts', () => {
    expect(fileExists(tmpDir, 'src', 'user', 'user.module.ts')).toBe(true);
  });

  it('creates src/user/user.service.ts', () => {
    expect(fileExists(tmpDir, 'src', 'user', 'user.service.ts')).toBe(true);
  });

  it('creates src/crypto/hashPassword.ts', () => {
    expect(fileExists(tmpDir, 'src', 'crypto', 'hashPassword.ts')).toBe(true);
  });

  it('creates src/db/user/prisma.user.repository.ts', () => {
    expect(fileExists(tmpDir, 'src', 'db', 'user', 'prisma.user.repository.ts')).toBe(true);
  });

  // ── No src/... absolute imports in auth files ───────────────────────────────

  it('auth.service.ts uses relative imports, not src/ absolute', () => {
    const content = readFile(tmpDir, 'src', 'auth', 'auth.service.ts');
    expect(content).not.toMatch(/from 'src\//);
    expect(content).toMatch(/from '\.\.\//);
  });

  it('user.service.ts uses relative imports', () => {
    const content = readFile(tmpDir, 'src', 'user', 'user.service.ts');
    expect(content).not.toMatch(/from 'src\//);
  });

  it('prisma.user.repository.ts uses relative imports', () => {
    const content = readFile(tmpDir, 'src', 'db', 'user', 'prisma.user.repository.ts');
    expect(content).not.toMatch(/from 'src\//);
  });

  // ── Schema has User model ───────────────────────────────────────────────────

  it('prisma/schema.prisma has User model', () => {
    assertFileContains(tmpDir, 'prisma/schema.prisma', 'model User');
  });

  it('User model has login field', () => {
    assertFileContains(tmpDir, 'prisma/schema.prisma', 'login');
  });

  it('User model has roles field', () => {
    assertFileContains(tmpDir, 'prisma/schema.prisma', 'roles');
  });

  // ── App module wired ────────────────────────────────────────────────────────

  it('app.module.ts imports AuthModule', () => {
    assertFileContains(tmpDir, 'src/app.module.ts', 'AuthModule');
  });

  it('app.module.ts imports UserModule', () => {
    assertFileContains(tmpDir, 'src/app.module.ts', 'UserModule');
  });

  it('app.module.ts has JwtAuthGuard provider', () => {
    assertFileContains(tmpDir, 'src/app.module.ts', 'JwtAuthGuard');
  });

  it('app.module.ts has RolesGuard provider', () => {
    assertFileContains(tmpDir, 'src/app.module.ts', 'RolesGuard');
  });

  // ── Package.json has auth deps ──────────────────────────────────────────────

  it('package.json has @nestjs/jwt', () => {
    const pkg = JSON.parse(readFile(tmpDir, 'package.json'));
    expect(pkg.dependencies['@nestjs/jwt']).toBeDefined();
  });

  it('package.json has bcrypt', () => {
    const pkg = JSON.parse(readFile(tmpDir, 'package.json'));
    expect(pkg.dependencies['bcrypt']).toBeDefined();
  });

  // ── .env.example has JWT vars ───────────────────────────────────────────────

  it('.env.example has JWT_SECRET_KEY', () => {
    assertFileContains(tmpDir, '.env.example', 'JWT_SECRET_KEY');
  });

  it('.env.example JWT_SECRET_KEY is not weak default', () => {
    const content = readFile(tmpDir, '.env.example');
    expect(content).not.toContain('secret123123');
  });
});
