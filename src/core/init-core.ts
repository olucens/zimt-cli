import * as fs from 'fs-extra';
import * as path from 'path';
import { execSync } from 'child_process';
import { copyTemplateFiles, TemplateContext } from '../utils/template-manager';
import { PackageManager, ProjectConfig } from '../types';
import { getInstallCommand } from './pm';

const BLANK_TEMPLATE_NAME = 'template_blank';

const dirname: string =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname((require as any).main?.filename || '');

export function resolveTemplateDir(templateName: string): string {
  const possiblePaths = [
    path.resolve(dirname, '../templates', templateName),
    path.resolve(dirname, '../../../src/templates', templateName),
    path.resolve(dirname, '../../src/templates', templateName),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return path.resolve(dirname, '../templates', templateName);
}

export async function configurePackageManager(
  targetDir: string,
  pm: PackageManager,
): Promise<void> {
  const packageJsonPath = path.join(targetDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) return;

  const pkg = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

  if (pm !== 'npm') {
    const lockFile = path.join(targetDir, 'package-lock.json');
    if (fs.existsSync(lockFile)) await fs.remove(lockFile);
  }

  if (pkg.scripts) {
    for (const [key, val] of Object.entries(pkg.scripts)) {
      if (typeof val !== 'string') continue;
      let updated = val;
      if (pm === 'yarn') {
        updated = updated.replace(/\bnpx\s+/g, 'yarn ');
      } else if (pm === 'pnpm') {
        updated = updated.replace(/\bnpx\s+/g, 'pnpm exec ');
      } else if (pm === 'bun') {
        updated = updated.replace(/\bnpx\s+/g, 'bunx ');
      }
      if (updated !== val) pkg.scripts[key] = updated;
    }
  }

  await fs.writeFile(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
}

export interface InitCoreOptions {
  /** Skip dependency installation. Engine always passes true. Default false. */
  skipInstall?: boolean;
  /** Run `git init` in the created project. Default false. */
  initializeGit?: boolean;
  silent?: boolean;
}

/**
 * Create a blank project from the template. Pure core: headless, no prompts,
 * never exits or inspects the current directory. Throws on failure; the
 * api.ts boundary converts to Result.
 */
export async function initProjectCore(
  config: ProjectConfig,
  targetDir: string,
  opts: InitCoreOptions = {},
): Promise<void> {
  const log = (msg: string) => {
    if (!opts.silent) console.log(msg);
  };

  const templateDir = resolveTemplateDir(BLANK_TEMPLATE_NAME);
  if (!fs.existsSync(templateDir)) {
    throw new Error(`Template directory not found at: ${templateDir}`);
  }

  await fs.ensureDir(targetDir);

  const templateContext: TemplateContext = {
    projectName: config.name,
    description: config.description,
    author: config.author,
    packageManager: config.packageManager,
    database: config.database,
    authStrategy: config.authStrategy,
  };
  await copyTemplateFiles(templateDir, targetDir, templateContext);
  log('✓ Template files copied');

  await configurePackageManager(targetDir, config.packageManager);
  log(`✓ Configured for ${config.packageManager}`);

  if (opts.initializeGit) {
    try {
      execSync('git init', { cwd: targetDir, stdio: 'ignore' });
      log('✓ Git repository initialized');
    } catch {
      log('⚠ Git initialization skipped (git not available)');
    }
  }

  if (!opts.skipInstall) {
    execSync(getInstallCommand(config.packageManager), {
      cwd: targetDir,
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'development' },
    });
    log('✓ Dependencies installed');
  }
}
