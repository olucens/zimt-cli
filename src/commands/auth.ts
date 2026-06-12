import { Command } from 'commander';
import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import * as prompts from '@clack/prompts';
import { addAuthCore } from '../core/auth-core';

export const authCommand = new Command('auth')
  .description('Add JWT auth, user management, and RBAC to an existing zimt project')
  .action(async () => {
    try {
      const targetDir = process.cwd();
      const appModulePath = path.join(targetDir, 'src', 'app.module.ts');

      if (!fs.existsSync(appModulePath)) {
        prompts.cancel('Not a NestJS project. Run this command from your project root.');
        process.exit(1);
      }

      let overwrite = false;
      const authModulePath = path.join(targetDir, 'src', 'auth', 'auth.module.ts');
      if (fs.existsSync(authModulePath)) {
        const confirmed = await prompts.confirm({
          message: 'Auth module already exists (src/auth/auth.module.ts). Overwrite?',
          initialValue: false,
        });
        if (!confirmed) {
          prompts.cancel('Auth setup cancelled.');
          process.exit(0);
        }
        overwrite = true;
      }

      const s = prompts.spinner();
      s.start('Adding auth module...');
      await addAuthCore(targetDir, { overwrite, silent: true });
      s.stop('✓ Auth module files added and wired into app.module.ts');

      prompts.outro(chalk.green('\n✓ Auth module added successfully!\n'));

      console.log(chalk.yellow('⚠️  Next steps:'));
      console.log(
        chalk.yellow('   1. Run: npm install  (to install new deps: bcrypt, @nestjs/jwt, etc.)'),
      );
      console.log(chalk.yellow('   2. Run: npx prisma migrate dev --name add-user-auth'));
      console.log(chalk.yellow('   3. Run: npx prisma generate'));
      console.log(chalk.yellow('   4. Update your .env with proper JWT secrets\n'));
    } catch (error: any) {
      prompts.cancel('Auth setup failed.');
      console.error(chalk.red(`\nError: ${error.message}\n`));
      if (error.stack) console.error(error.stack);
      process.exit(1);
    }
  });
