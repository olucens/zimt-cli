import * as fs from 'fs-extra';
// import * as path from 'path';
import * as prompts from '@clack/prompts';
import chalk from 'chalk';
import { copyTemplateFiles, TemplateContext } from '../utils/template-manager';
import { execSync } from 'child_process';
import { PackageManager, ProjectConfig } from '../types';
import { resolveTemplateDir, configurePackageManager } from '../core/init-core';
import { detectPackageManager, getInstallCommand, getRunCommand } from '../core/pm';

export { detectPackageManager, getInstallCommand, getRunCommand };

const BLANK_TEMPLATE_NAME = 'template_blank';

export async function createProject(config: ProjectConfig, targetDir: string): Promise<void> {
  const templateDir = resolveTemplateDir(BLANK_TEMPLATE_NAME);

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
    s.stop(`⚠ Installation failed — run manually: ${getInstallCommand(config.packageManager)}`);
    console.warn(chalk.yellow(`Warning: ${error.message}`));
  }
}

export async function promptProjectConfig(
  projectName?: string,
  pmFlag?: PackageManager,
): Promise<ProjectConfig> {
  prompts.intro(chalk.cyan('ZIMT CLI — Create a production-ready NestJS project'));

  // Non-interactive mode: all required fields supplied via CLI args — skip all prompts.
  if (projectName && pmFlag) {
    return {
      name: projectName,
      packageManager: pmFlag,
      database: 'prisma-postgresql',
      authStrategy: 'jwt',
      description: 'A production-ready NestJS application',
      author: '',
      initializeGit: false,
    };
  }

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
              console.log(chalk.dim(`  Detected ${detectedPm} from lockfile.`));
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
