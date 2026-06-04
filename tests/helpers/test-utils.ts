import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { ProjectConfig } from '../../src/types';

export async function makeTmpDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), `zimt-${prefix}-`));
}

export async function cleanDir(dir: string): Promise<void> {
  await fs.remove(dir);
}

export function readFile(dir: string, ...parts: string[]): string {
  return fs.readFileSync(path.join(dir, ...parts), 'utf-8');
}

export function fileExists(dir: string, ...parts: string[]): boolean {
  return fs.existsSync(path.join(dir, ...parts));
}

export function blankConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    name: 'test-project',
    packageManager: 'npm',
    database: 'prisma-postgresql',
    authStrategy: 'jwt',
    initializeGit: false,
    ...overrides,
  };
}

export function assertFileContains(dir: string, filePath: string, expected: string): void {
  const content = readFile(dir, filePath);
  if (!content.includes(expected)) {
    throw new Error(
      `Expected "${filePath}" to contain:\n  ${expected}\n\nActual content:\n${content.slice(0, 500)}`,
    );
  }
}

export function assertFileNotContains(dir: string, filePath: string, unexpected: string): void {
  const content = readFile(dir, filePath);
  if (content.includes(unexpected)) {
    throw new Error(`Expected "${filePath}" NOT to contain: ${unexpected}`);
  }
}
