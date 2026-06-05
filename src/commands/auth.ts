import { Command } from 'commander';
import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import * as prompts from '@clack/prompts';
import { Project, SyntaxKind } from 'ts-morph';
import { copyTemplateFiles, renderTemplate, TemplateContext } from '../utils/template-manager';
import { PackageManager } from '../types';

const dirname: string =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname((require as any).main?.filename || '');

function getAuthTemplateDir(): string {
  const possible = [
    path.resolve(dirname, '../templates/template_v002'),
    path.resolve(dirname, '../../../src/templates/template_v002'),
    path.resolve(dirname, '../../src/templates/template_v002'),
    path.resolve(process.cwd(), 'src/templates/template_v002'),
  ];
  for (const p of possible) {
    if (fs.existsSync(p)) return p;
  }
  return path.resolve(dirname, '../templates/template_v002');
}

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

      const authModulePath = path.join(targetDir, 'src', 'auth', 'auth.module.ts');
      if (fs.existsSync(authModulePath)) {
        const overwrite = await prompts.confirm({
          message: 'Auth module already exists (src/auth/auth.module.ts). Overwrite?',
          initialValue: false,
        });
        if (!overwrite) {
          prompts.cancel('Auth setup cancelled.');
          process.exit(0);
        }
      }

      const authTemplateDir = getAuthTemplateDir();
      if (!fs.existsSync(authTemplateDir)) {
        throw new Error(`Auth template not found at: ${authTemplateDir}`);
      }

      const pkgJsonPath = path.join(targetDir, 'package.json');
      let pm: PackageManager = 'npm';
      let projectName = 'app';
      if (fs.existsSync(pkgJsonPath)) {
        const pkg = JSON.parse(await fs.readFile(pkgJsonPath, 'utf-8'));
        projectName = pkg.name || 'app';
      }

      const context: TemplateContext = {
        projectName,
        packageManager: pm,
      };

      const s = prompts.spinner();

      // Copy auth-related folders from template_v002
      const foldersToAdd = ['auth', 'user', 'crypto', 'db'];
      for (const folder of foldersToAdd) {
        const src = path.join(authTemplateDir, 'src', folder);
        const dest = path.join(targetDir, 'src', folder);
        if (fs.existsSync(src)) {
          s.start(`Copying ${folder}/...`);
          await fs.ensureDir(dest);
          await copyTemplateFiles(src, dest, context);
          s.stop(`✓ Copied src/${folder}/`);
        }
      }

      // Copy logger
      const loggerSrc = path.join(authTemplateDir, 'src', 'logger');
      const loggerDest = path.join(targetDir, 'src', 'logger');
      if (fs.existsSync(loggerSrc)) {
        s.start('Copying logger/...');
        await fs.ensureDir(loggerDest);
        await copyTemplateFiles(loggerSrc, loggerDest, context);
        s.stop('✓ Copied src/logger/');
      }

      // Copy exceptions.filter.ts if it doesn't exist
      const filterSrc = path.join(authTemplateDir, 'src', 'exceptions.filter.ts.ejs');
      const filterDest = path.join(targetDir, 'src', 'exceptions.filter.ts');
      if (fs.existsSync(filterSrc) && !fs.existsSync(filterDest)) {
        s.start('Copying exceptions.filter.ts...');
        const filterContent = await fs.readFile(filterSrc, 'utf-8');
        await fs.writeFile(filterDest, renderTemplate(filterContent, context), 'utf-8');
        s.stop('✓ Copied exceptions.filter.ts');
      }

      // Replace app.controller.ts with the auth-aware version that marks /health as @Public()
      const controllerSrc = path.join(authTemplateDir, 'src', 'app.controller.ts.ejs');
      const controllerDest = path.join(targetDir, 'src', 'app.controller.ts');
      if (fs.existsSync(controllerSrc)) {
        s.start('Updating app.controller.ts...');
        const controllerContent = await fs.readFile(controllerSrc, 'utf-8');
        await fs.writeFile(controllerDest, renderTemplate(controllerContent, context), 'utf-8');
        s.stop('✓ Updated app.controller.ts');
      }

      // Update prisma/schema.prisma — add User model
      s.start('Updating prisma/schema.prisma...');
      await appendUserModelToSchema(targetDir);
      s.stop('✓ Updated prisma/schema.prisma');

      // Update package.json — add missing deps
      s.start('Updating package.json dependencies...');
      await addAuthDependencies(targetDir);
      s.stop('✓ Updated package.json');

      // Update .env.example
      s.start('Updating .env.example...');
      await appendAuthEnvVars(targetDir, projectName);
      s.stop('✓ Updated .env.example');

      // Update app.module.ts using ts-morph
      s.start('Wiring AuthModule into app.module.ts...');
      await wireAuthIntoAppModule(appModulePath);
      s.stop('✓ Updated app.module.ts');

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

async function appendUserModelToSchema(targetDir: string): Promise<void> {
  const schemaPath = path.join(targetDir, 'prisma', 'schema.prisma');
  if (!fs.existsSync(schemaPath)) return;

  const content = await fs.readFile(schemaPath, 'utf-8');
  if (content.includes('model User')) return;

  const userModel = `
model User {
  id        String   @id @default(uuid())
  login     String   @unique
  password  String
  roles     String[] @default(["user"])
  version   Int      @default(1)
  createdAt DateTime @default(now()) @map("createdAt")
  updatedAt DateTime @updatedAt @map("updatedAt")

  @@map("User")
}
`;
  await fs.appendFile(schemaPath, userModel);
}

async function addAuthDependencies(targetDir: string): Promise<void> {
  const pkgPath = path.join(targetDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return;

  const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));

  const authDeps: Record<string, string> = {
    '@nestjs/jwt': '^11.0.0',
    bcrypt: '^5.1.0',
    jsonwebtoken: '^9.0.0',
    '@nestjs/swagger': '^11.0.0',
    'swagger-ui-express': '^5.0.0',
    'js-yaml': '^4.1.0',
  };
  const authDevDeps: Record<string, string> = {
    '@types/bcrypt': '^5.0.0',
    '@types/jsonwebtoken': '^9.0.0',
    '@types/js-yaml': '^4.0.9',
  };

  pkg.dependencies = { ...authDeps, ...(pkg.dependencies || {}) };
  pkg.devDependencies = { ...authDevDeps, ...(pkg.devDependencies || {}) };

  await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
}

async function appendAuthEnvVars(targetDir: string, _projectName: string): Promise<void> {
  const envPath = path.join(targetDir, '.env.example');
  if (!fs.existsSync(envPath)) return;

  const content = await fs.readFile(envPath, 'utf-8');
  if (content.includes('JWT_SECRET_KEY')) return;

  const authVars = `
CRYPT_SALT=10
JWT_SECRET_KEY=change_me_in_production
JWT_SECRET_REFRESH_KEY=change_me_refresh_in_production
TOKEN_EXPIRE_TIME=1h
TOKEN_REFRESH_EXPIRE_TIME=24h

# Logging
LOG_LEVEL=4
LOG_DIR=logs
LOG_FILE_SIZE_KB=10
`;
  await fs.appendFile(envPath, authVars);
}

async function wireAuthIntoAppModule(appModulePath: string): Promise<void> {
  const project = new Project();
  const sourceFile = project.addSourceFileAtPath(appModulePath);

  const moduleImports: Array<{ name: string; from: string }> = [
    { name: 'AuthModule', from: './auth/auth.module' },
    { name: 'UserModule', from: './user/user.module' },
    { name: 'LoggerModule', from: './logger/logger.module' },
    { name: 'APP_GUARD', from: '@nestjs/core' },
    { name: 'JwtAuthGuard', from: './auth/jwt-auth.guard' },
    { name: 'RolesGuard', from: './auth/roles.guard' },
    { name: 'LoggerService', from: './logger/logger.service' },
    { name: 'LoggingMiddleware', from: './logger/logging.middleware' },
    { name: 'MiddlewareConsumer', from: '@nestjs/common' },
    { name: 'NestModule', from: '@nestjs/common' },
  ];

  const existingImports = sourceFile.getImportDeclarations();

  for (const { name, from } of moduleImports) {
    const existing = existingImports.find((i) => i.getModuleSpecifierValue() === from);
    if (existing) {
      const named = existing.getNamedImports().map((n) => n.getName());
      if (!named.includes(name)) {
        existing.addNamedImport(name);
      }
    } else {
      sourceFile.addImportDeclaration({ moduleSpecifier: from, namedImports: [{ name }] });
    }
  }

  const appClass = sourceFile.getClass('AppModule');
  if (!appClass) {
    sourceFile.saveSync();
    return;
  }

  const moduleDecorator = appClass.getDecorator('Module');
  if (!moduleDecorator) {
    sourceFile.saveSync();
    return;
  }

  const args = moduleDecorator.getArguments();
  if (!args || args.length === 0) {
    sourceFile.saveSync();
    return;
  }

  const firstArg = args[0];
  if (firstArg.getKind() !== SyntaxKind.ObjectLiteralExpression) {
    sourceFile.saveSync();
    return;
  }

  const objExpr = firstArg.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);

  // Add to imports array
  const addToArray = (propName: string, values: string[]) => {
    const prop = objExpr.getProperty(propName);
    if (prop && prop.getKind() === SyntaxKind.PropertyAssignment) {
      const pa = prop.asKindOrThrow(SyntaxKind.PropertyAssignment);
      const init = pa.getInitializer();
      if (init && init.getKind() === SyntaxKind.ArrayLiteralExpression) {
        const arr = init.asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
        const existing = arr.getElements().map((e: any) => e.getText().trim());
        for (const v of values) {
          if (!existing.includes(v)) arr.addElement(v);
        }
      }
    }
  };

  addToArray('imports', ['AuthModule', 'UserModule', 'LoggerModule']);
  addToArray('providers', [
    `LoggerService`,
    `{\n      provide: APP_GUARD,\n      useClass: JwtAuthGuard,\n    }`,
    `{\n      provide: APP_GUARD,\n      useClass: RolesGuard,\n    }`,
  ]);

  // Replace class declaration to implement NestModule if not already
  const implementsNestModule = appClass
    .getImplements()
    .some((i) => i.getExpression().getText() === 'NestModule');

  if (!implementsNestModule) {
    appClass.addImplements('NestModule');

    // Add configure method
    const existingConfigure = appClass.getMethod('configure');
    if (!existingConfigure) {
      appClass.addMethod({
        name: 'configure',
        parameters: [{ name: 'consumer', type: 'MiddlewareConsumer' }],
        statements: [`consumer.apply(LoggingMiddleware).forRoutes('*');`],
      });
    }
  }

  sourceFile.saveSync();
}
