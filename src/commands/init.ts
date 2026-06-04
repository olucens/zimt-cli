import * as fs from 'fs-extra';
import * as path from 'path';
import * as prompts from '@clack/prompts';
import chalk from 'chalk';
import { copyTemplateFiles, TemplateContext } from '../utils/template-manager';
import { execSync } from 'child_process';
import { PackageManager, ProjectConfig } from '../types';

const BLANK_TEMPLATE_NAME = 'template_blank';

// @ts-ignore
const dirname: string =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname((require as any).main?.filename || '');

function getTemplateDir(templateName: string): string {
  const possiblePaths = [
    path.resolve(dirname, '../templates', templateName),
    path.resolve(dirname, '../../../src/templates', templateName),
    path.resolve(dirname, '../../src/templates', templateName),
    path.resolve(process.cwd(), 'src/templates', templateName),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return path.resolve(dirname, '../templates', templateName);
}

export function detectPackageManager(dir: string): PackageManager | null {
  if (fs.existsSync(path.join(dir, 'bun.lockb'))) return 'bun';
  if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(dir, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(dir, 'package-lock.json'))) return 'npm';
  return null;
}

export function getInstallCommand(pm: PackageManager): string {
  switch (pm) {
    case 'yarn': return 'yarn install';
    case 'pnpm': return 'pnpm install';
    case 'bun': return 'bun install';
    default: return 'npm install';
  }
}

export function getRunCommand(pm: PackageManager, script: string): string {
  switch (pm) {
    case 'yarn': return `yarn ${script}`;
    case 'pnpm': return `pnpm run ${script}`;
    case 'bun': return `bun run ${script}`;
    default: return `npm run ${script}`;
  }
}

export async function createProject(
  config: ProjectConfig,
  targetDir: string,
): Promise<void> {
  const templateDir = getTemplateDir(BLANK_TEMPLATE_NAME);

  if (!fs.existsSync(templateDir)) {
    throw new Error(`Template directory not found at: ${templateDir}`);
  }

  const s = prompts.spinner();

  s.start('Creating project directory...');
  await fs.ensureDir(targetDir);
  s.stop('✓ Project directory created');

  s.start('Copying template files...');
  const templateContext: TemplateContext = {
    projectName: config.name,
    description: config.description,
    author: config.author,
    packageManager: config.packageManager,
    database: config.database,
    authStrategy: config.authStrategy,
  };
  await copyTemplateFiles(templateDir, targetDir, templateContext);
  s.stop('✓ Template files copied');

  s.start(`Configuring for ${config.packageManager}...`);
  await configurePackageManager(targetDir, config.packageManager);
  s.stop(`✓ Configured for ${config.packageManager}`);

  if (config.initializeGit) {
    s.start('Initializing git repository...');
    try {
      execSync('git init', { cwd: targetDir, stdio: 'ignore' });
      s.stop('✓ Git repository initialized');
    } catch {
      s.stop('⚠ Git initialization skipped (git not available)');
    }
  }

  s.start(`Installing dependencies with ${config.packageManager}...`);
  try {
    execSync(getInstallCommand(config.packageManager), {
      cwd: targetDir,
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'development' },
    });
    s.stop(`✓ Dependencies installed`);
  } catch (error: any) {
    s.stop(
      `⚠ Installation failed — run manually: ${getInstallCommand(config.packageManager)}`,
    );
    console.warn(chalk.yellow(`Warning: ${error.message}`));
  }
}

async function configurePackageManager(
  targetDir: string,
  pm: PackageManager,
): Promise<void> {
  const packageJsonPath = path.join(targetDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) return;

  try {
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
  } catch {
    console.warn(`Warning: Could not configure package.json for ${pm}`);
  }
}

export async function promptProjectConfig(
  projectName?: string,
  pmFlag?: PackageManager,
): Promise<ProjectConfig> {
  prompts.intro(chalk.cyan('ZIMT CLI — Create a production-ready NestJS project'));

  const detectedPm = detectPackageManager(process.cwd());

  const config = await prompts.group(
    {
      name: projectName
        ? async () => projectName
        : async () =>
            await prompts.text({
              message: 'What is your project name?',
              placeholder: 'my-awesome-api',
              validate: (value: string) => {
                if (!value || value.trim().length === 0) return 'Project name is required';
                if (!/^[a-z0-9-]+$/.test(value))
                  return 'Project name must be lowercase, alphanumeric with hyphens only';
                return undefined;
              },
            }),

      packageManager: pmFlag
        ? async () => pmFlag
        : detectedPm
          ? async () => {
              console.log(
                chalk.dim(`  Detected ${detectedPm} from lockfile.`),
              );
              return detectedPm;
            }
          : async () =>
              await prompts.select({
                message: 'Which package manager would you like to use?',
                options: [
                  { value: 'npm', label: 'npm' },
                  { value: 'yarn', label: 'yarn' },
                  { value: 'pnpm', label: 'pnpm' },
                  { value: 'bun', label: 'bun' },
                ],
              }),

      database: async () => 'prisma-postgresql' as const,

      authStrategy: async () => 'jwt' as const,

      description: () =>
        prompts.text({
          message: 'Project description (optional)',
          placeholder: 'A production-ready NestJS application',
          initialValue: '',
        }),

      author: () =>
        prompts.text({
          message: 'Author (optional)',
          placeholder: 'Your Name',
          initialValue: '',
        }),

      initializeGit: () =>
        prompts.confirm({
          message: 'Initialize a git repository?',
          initialValue: true,
        }),
    },
    {
      onCancel: () => {
        prompts.cancel('Project creation cancelled.');
        process.exit(0);
      },
    },
  );

  return config as ProjectConfig;
}
