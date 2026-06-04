/**
 * Scenario 3: api-no-auth
 * Wide API with multiple endpoints, no auth.
 * Verifies: CRUD files correct, all modules wired into AppModule, DTOs have validators.
 */

import { makeTmpDir, cleanDir, fileExists, readFile, blankConfig, assertFileContains, assertFileNotContains } from '../helpers/test-utils';
import { createProject } from '../../src/commands/init';

jest.mock('@clack/prompts', () => ({
  spinner: () => ({ start: jest.fn(), stop: jest.fn() }),
  cancel: jest.fn(),
  outro: jest.fn(),
}));
jest.mock('child_process', () => ({ execSync: jest.fn() }));

describe('Scenario: api-no-auth (multiple endpoints, no auth)', () => {
  let tmpDir: string;
  const resources = ['product', 'order', 'category'];

  beforeAll(async () => {
    tmpDir = await makeTmpDir('api-no-auth');
    await createProject(blankConfig({ name: 'test-api' }), tmpDir);

    // Generate multiple resources
    const { runGenerateFromNameDirect } = await import('../helpers/generator-test-helper');
    for (const resource of resources) {
      await runGenerateFromNameDirect(tmpDir, resource);
    }
  });

  afterAll(async () => {
    await cleanDir(tmpDir);
  });

  // ── One resource block (product) ────────────────────────────────────────────

  it.each(resources)('%s: module file exists', (resource) => {
    expect(fileExists(tmpDir, 'src', resource, `${resource}.module.ts`)).toBe(true);
  });

  it.each(resources)('%s: controller file exists', (resource) => {
    expect(fileExists(tmpDir, 'src', resource, `${resource}.controller.ts`)).toBe(true);
  });

  it.each(resources)('%s: service file exists', (resource) => {
    expect(fileExists(tmpDir, 'src', resource, `${resource}.service.ts`)).toBe(true);
  });

  it.each(resources)('%s: create DTO file exists', (resource) => {
    expect(fileExists(tmpDir, 'src', resource, 'dto', `create-${resource}.dto.ts`)).toBe(true);
  });

  it.each(resources)('%s: update DTO file exists (separate from create)', (resource) => {
    expect(fileExists(tmpDir, 'src', resource, 'dto', `update-${resource}.dto.ts`)).toBe(true);
  });

  it.each(resources)('%s: entity file exists', (resource) => {
    expect(fileExists(tmpDir, 'src', resource, 'entities', `${resource}.entity.ts`)).toBe(true);
  });

  it.each(resources)('%s: repository interface file exists', (resource) => {
    expect(fileExists(tmpDir, 'src', resource, `${resource}.repository.interface.ts`)).toBe(true);
  });

  it.each(resources)('%s: Prisma repository file exists', (resource) => {
    expect(fileExists(tmpDir, 'src', resource, `${resource}.repository.ts`)).toBe(true);
  });

  it.each(resources)('%s: service unit test exists', (resource) => {
    expect(fileExists(tmpDir, 'src', resource, `${resource}.service.spec.ts`)).toBe(true);
  });

  it.each(resources)('%s: controller unit test exists', (resource) => {
    expect(fileExists(tmpDir, 'src', resource, `${resource}.controller.spec.ts`)).toBe(true);
  });

  it.each(resources)('%s: e2e test file exists', (resource) => {
    expect(fileExists(tmpDir, 'test', resource, `${resource}.e2e-spec.ts`)).toBe(true);
  });

  // ── Content checks ──────────────────────────────────────────────────────────

  it.each(resources)('%s: controller has all 5 CRUD methods', (resource) => {
    const content = readFile(tmpDir, 'src', resource, `${resource}.controller.ts`);
    expect(content).toContain('findAll');
    expect(content).toContain('findOne');
    expect(content).toContain('create');
    expect(content).toContain('update');
    expect(content).toContain('remove');
  });

  it.each(resources)('%s: service uses repository injection token', (resource) => {
    const Name = resource.charAt(0).toUpperCase() + resource.slice(1);
    assertFileContains(tmpDir, `src/${resource}/${resource}.service.ts`, `${Name.toUpperCase()}_REPOSITORY`);
  });

  it.each(resources)('%s: service throws NotFoundException on missing item', (resource) => {
    assertFileContains(tmpDir, `src/${resource}/${resource}.service.ts`, 'NotFoundException');
  });

  it.each(resources)('%s: update DTO extends PartialType of create DTO', (resource) => {
    const Name = resource.charAt(0).toUpperCase() + resource.slice(1);
    assertFileContains(tmpDir, `src/${resource}/dto/update-${resource}.dto.ts`, `PartialType(Create${Name}Dto)`);
  });

  it.each(resources)('%s: create DTO imports from class-validator', (resource) => {
    assertFileContains(tmpDir, `src/${resource}/dto/create-${resource}.dto.ts`, "from 'class-validator'");
  });

  it.each(resources)('%s: repository interface imports UpdateDto from correct file', (resource) => {
    const content = readFile(tmpDir, 'src', resource, `${resource}.repository.interface.ts`);
    // UpdateDto must come from update- file, NOT create- file
    expect(content).toContain(`update-${resource}.dto`);
    expect(content).not.toMatch(new RegExp(`Create.*Update.*from.*create-${resource}`));
  });

  it.each(resources)('%s: Prisma repository imports UpdateDto from update file', (resource) => {
    const content = readFile(tmpDir, 'src', resource, `${resource}.repository.ts`);
    expect(content).toContain(`update-${resource}.dto`);
  });

  // ── AppModule wired ─────────────────────────────────────────────────────────

  it.each(resources)('%s: module added to app.module.ts imports', (resource) => {
    const Name = resource.charAt(0).toUpperCase() + resource.slice(1);
    assertFileContains(tmpDir, 'src/app.module.ts', `${Name}Module`);
  });

  it('app.module.ts has import statement for all resource modules', () => {
    const content = readFile(tmpDir, 'src', 'app.module.ts');
    for (const resource of resources) {
      const Name = resource.charAt(0).toUpperCase() + resource.slice(1);
      expect(content).toContain(`${Name}Module`);
    }
  });

  // ── No auth in api-no-auth ──────────────────────────────────────────────────

  it('does NOT create auth module', () => {
    expect(fileExists(tmpDir, 'src', 'auth')).toBe(false);
  });
});
