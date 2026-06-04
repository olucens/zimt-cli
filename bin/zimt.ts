#!/usr/bin/env node
import { Command } from 'commander';
import { resourceGeneratorCommand } from '../src/commands/resource-generator';
import { authCommand } from '../src/commands/auth';
import { cacheCommand } from '../src/commands/cache';
import {
  createProject,
  promptProjectConfig,
  detectPackageManager,
  getRunCommand,
} from '../src/commands/init';
import chalk from 'chalk';
import * as prompts from '@clack/prompts';
import * as path from 'path';
import * as fs from 'fs-extra';
import { PackageManager } from '../src/types';

const program = new Command();

program
  .name('zimt')
  .description('ZIMT CLI — The secret ingredient for production-ready NestJS apps')
  .version('1.0.0-beta');

// ─── zimt init / zimt new ────────────────────────────────────────────────────

const initAction = async (name: string | undefined, options: { pm?: string }) => {
  try {
    const pmFlag = options.pm as PackageManager | undefined;

    const projectName =
      name ||
      ((await prompts.text({
        message: 'What is your project name?',
        placeholder: 'my-awesome-api',
        validate: (value: string) => {
          if (!value || value.trim().length === 0) return 'Project name is required';
          if (!/^[a-z0-9-]+$/.test(value))
            return 'Project name must be lowercase, alphanumeric with hyphens only';
          return undefined;
        },
      })) as string);

    if (!projectName) {
      prompts.cancel('Project creation cancelled.');
      process.exit(0);
    }

    const targetDir = path.resolve(process.cwd(), projectName);

    if (fs.existsSync(targetDir)) {
      const shouldOverwrite = await prompts.confirm({
        message: `Directory "${projectName}" already exists. Overwrite?`,
        initialValue: false,
      });

      if (!shouldOverwrite) {
        prompts.cancel('Project creation cancelled.');
        process.exit(0);
      }

      await fs.remove(targetDir);
    }

    const config = await promptProjectConfig(projectName, pmFlag);

    await createProject(config, targetDir);

    const pm = config.packageManager;
    prompts.outro(chalk.green(`\n✓ Project "${projectName}" created successfully!\n`));
    console.log(chalk.cyan(`  cd ${projectName}`));
    console.log(chalk.cyan(`  cp .env.example .env`));
    console.log(chalk.cyan(`  ${pm === 'npm' ? 'npm run prisma:migrate' : pm === 'yarn' ? 'yarn prisma:migrate' : pm === 'bun' ? 'bun run prisma:migrate' : 'pnpm run prisma:migrate'}`));
    console.log(chalk.cyan(`  ${getRunCommand(pm, 'start:dev')}\n`));
    console.log(chalk.dim('  To add auth: ') + chalk.cyan('zimt auth'));
    console.log(chalk.dim('  To generate endpoints: ') + chalk.cyan('zimt generate <name>') + '\n');
  } catch (error: any) {
    prompts.cancel('Project creation failed.');
    console.error(chalk.red(`\nError: ${error.message}\n`));
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
};

program
  .command('init [name]')
  .alias('new')
  .alias('n')
  .description('Create a new blank NestJS project')
  .option('--pm <manager>', 'Package manager to use (npm | yarn | pnpm | bun)')
  .action(initAction);

// ─── zimt auth ───────────────────────────────────────────────────────────────

program.addCommand(authCommand);

// Also support: zimt create auth
const createCmd = new Command('create')
  .description('Scaffold features into an existing project');

createCmd
  .command('auth')
  .description('Add JWT auth to an existing zimt project')
  .action(async () => { await authCommand.parseAsync(['auth'], { from: 'user' }); });

program.addCommand(createCmd);

// ─── zimt generate / zimt p ──────────────────────────────────────────────────

program.addCommand(resourceGeneratorCommand);

// ─── zimt r / zimt cache ─────────────────────────────────────────────────────

program.addCommand(cacheCommand);

program.parse(process.argv);
