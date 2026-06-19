import * as fs from 'fs-extra';
import * as path from 'path';
import { PackageManager } from '../types';

export function detectPackageManager(dir: string): PackageManager | null {
  if (fs.existsSync(path.join(dir, 'bun.lockb'))) return 'bun';
  if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(dir, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(dir, 'package-lock.json'))) return 'npm';
  return null;
}

export function getInstallCommand(pm: PackageManager): string {
  switch (pm) {
    case 'yarn':
      return 'yarn install';
    case 'pnpm':
      return 'pnpm install';
    case 'bun':
      return 'bun install';
    default:
      return 'npm install';
  }
}

export function getRunCommand(pm: PackageManager, script: string): string {
  switch (pm) {
    case 'yarn':
      return `yarn ${script}`;
    case 'pnpm':
      return `pnpm run ${script}`;
    case 'bun':
      return `bun run ${script}`;
    default:
      return `npm run ${script}`;
  }
}
