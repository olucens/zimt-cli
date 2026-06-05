/**
 * Scenario 5: nested endpoints
 * zimt generate comments --parent posts  →  /posts/:postsId/comments
 * Verifies: correct route path, parent param in controller methods,
 * module wired into AppModule.
 */

import { makeTmpDir, cleanDir, fileExists, readFile, blankConfig, assertFileContains } from '../helpers/test-utils';
import { createProject } from '../../src/commands/init';
import { runGenerateFromNameDirect, runGenerateFromSqlDirect } from '../helpers/generator-test-helper';

jest.mock('@clack/prompts', () => ({
  spinner: () => ({ start: jest.fn(), stop: jest.fn() }),
  cancel: jest.fn(),
  outro: jest.fn(),
}));
jest.mock('child_process', () => ({ execSync: jest.fn() }));

describe('Scenario: nested endpoints', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await makeTmpDir('nested');
    await createProject(blankConfig({ name: 'test-nested' }), tmpDir);

    // Parent resource
    await runGenerateFromNameDirect(tmpDir, 'post');

    // Nested resource: /posts/:postsId/comments
    await runGenerateFromNameDirect(tmpDir, 'comment', 'post');

    // Nested from SQL: /users/:usersId/subscriptions
    await runGenerateFromSqlDirect(
      tmpDir,
      `CREATE TABLE subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        plan VARCHAR(100) NOT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        user_id UUID NOT NULL
      )`,
      'user',
    );
  });

  afterAll(async () => {
    await cleanDir(tmpDir);
  });

  // ── Name-based nested ───────────────────────────────────────────────────────

  it('parent (post) module exists', () => {
    expect(fileExists(tmpDir, 'src', 'post', 'post.module.ts')).toBe(true);
  });

  it('nested (comment) module exists', () => {
    expect(fileExists(tmpDir, 'src', 'comment', 'comment.module.ts')).toBe(true);
  });

  it('comment controller has nested route /posts/:postId/comments', () => {
    const content = readFile(tmpDir, 'src', 'comment', 'comment.controller.ts');
    // Route should reference parent: posts/...Id.../comments
    expect(content).toMatch(/posts.*postId.*comment/s);
  });

  it('comment controller findAll accepts parent ID param', () => {
    const content = readFile(tmpDir, 'src', 'comment', 'comment.controller.ts');
    expect(content).toContain('postId');
  });

  it('comment controller create accepts parent ID param', () => {
    const content = readFile(tmpDir, 'src', 'comment', 'comment.controller.ts');
    expect(content).toContain('postId');
  });

  it('comment service findAll passes parentId to repository', () => {
    const content = readFile(tmpDir, 'src', 'comment', 'comment.service.ts');
    expect(content).toContain('parentId');
  });

  it('comment repository findAll accepts optional parentId', () => {
    const content = readFile(tmpDir, 'src', 'comment', 'comment.repository.interface.ts');
    expect(content).toContain('parentId');
  });

  // ── SQL-based nested ────────────────────────────────────────────────────────

  // SQL parser uses table name as resource dir (subscriptions → src/subscriptions/)
  it('SQL-based subscription module exists', () => {
    expect(fileExists(tmpDir, 'src', 'subscriptions', 'subscriptions.module.ts')).toBe(true);
  });

  it('SQL-based subscription controller exists', () => {
    expect(fileExists(tmpDir, 'src', 'subscriptions', 'subscriptions.controller.ts')).toBe(true);
  });

  it('SQL-based subscription controller has /users/:userId/subscriptions route', () => {
    const content = readFile(tmpDir, 'src', 'subscriptions', 'subscriptions.controller.ts');
    expect(content).toMatch(/users.*userId.*subscription/s);
  });

  it('SQL: entity has camelCase field names from snake_case SQL', () => {
    const content = readFile(tmpDir, 'src', 'subscriptions', 'entities', 'subscriptions.entity.ts');
    expect(content).toContain('userId'); // user_id → userId
    expect(content).not.toContain('user_id'); // no snake_case
  });

  it('SQL: create DTO has correct validators per column type', () => {
    const content = readFile(tmpDir, 'src', 'subscriptions', 'dto', 'create-subscriptions.dto.ts');
    expect(content).toContain('@IsString'); // plan is VARCHAR
    expect(content).toContain('@IsBoolean'); // active is BOOLEAN
  });

  it('SQL: update DTO extends create DTO via PartialType', () => {
    assertFileContains(
      tmpDir,
      'src/subscriptions/dto/update-subscriptions.dto.ts',
      'PartialType(CreateSubscriptionDto',
    );
  });

  // ── App module ──────────────────────────────────────────────────────────────

  it('app.module.ts has CommentModule', () => {
    assertFileContains(tmpDir, 'src/app.module.ts', 'CommentModule');
  });

  it('app.module.ts has SubscriptionModule', () => {
    assertFileContains(tmpDir, 'src/app.module.ts', 'SubscriptionModule');
  });

  it('app.module.ts has PostModule', () => {
    assertFileContains(tmpDir, 'src/app.module.ts', 'PostModule');
  });

  // ── Correctness of routing isolation ───────────────────────────────────────

  it('post controller uses top-level route (not nested)', () => {
    const content = readFile(tmpDir, 'src', 'post', 'post.controller.ts');
    // Post was generated without parent, should be @Controller('posts')
    expect(content).toContain("@Controller('posts')");
    expect(content).not.toContain('userId');
  });
});
