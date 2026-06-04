/**
 * Thin wrapper that runs the auth command's file-copy + schema logic
 * without the interactive spinner/prompts, for use in tests.
 */
import * as fs from 'fs-extra';
import * as path from 'path';
import { copyTemplateFiles } from '../../src/utils/template-manager';
import { PackageManager } from '../../src/types';

// @ts-ignore
const dirname: string =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname((require as any).main?.filename || '');

function findAuthTemplateDir(): string {
  const candidates = [
    path.resolve(dirname, '../../src/templates/template_v002'),
    path.resolve(process.cwd(), 'src/templates/template_v002'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('Auth template (template_v002) not found');
}

export async function wireAuthIntoProject(
  targetDir: string,
  projectName: string,
  pm: PackageManager = 'npm',
): Promise<void> {
  const authTemplateDir = findAuthTemplateDir();
  const context = { projectName, packageManager: pm };

  for (const folder of ['auth', 'user', 'crypto', 'db', 'logger']) {
    const src = path.join(authTemplateDir, 'src', folder);
    if (fs.existsSync(src)) {
      await fs.ensureDir(path.join(targetDir, 'src', folder));
      await copyTemplateFiles(src, path.join(targetDir, 'src', folder), context);
    }
  }

  // Also copy exceptions.filter.ts if it doesn't exist
  const filterSrc = path.join(authTemplateDir, 'src', 'exceptions.filter.ts.ejs');
  const filterDest = path.join(targetDir, 'src', 'exceptions.filter.ts');
  if (fs.existsSync(filterSrc) && !fs.existsSync(filterDest)) {
    const ejs = require('ejs');
    const content = await fs.readFile(filterSrc, 'utf-8');
    const rendered = ejs.render(content, { ...context });
    await fs.writeFile(filterDest, rendered, 'utf-8');
  }

  // Add User model to schema
  const schemaPath = path.join(targetDir, 'prisma', 'schema.prisma');
  if (fs.existsSync(schemaPath)) {
    const schema = await fs.readFile(schemaPath, 'utf-8');
    if (!schema.includes('model User')) {
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
  }

  // Add auth deps to package.json
  const pkgPath = path.join(targetDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
    pkg.dependencies = {
      ...pkg.dependencies,
      '@nestjs/jwt': '^11.0.0',
      bcrypt: '^5.1.0',
      jsonwebtoken: '^9.0.0',
    };
    pkg.devDependencies = {
      ...pkg.devDependencies,
      '@types/bcrypt': '^5.0.0',
    };
    await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
  }

  // Append JWT vars to .env.example
  const envPath = path.join(targetDir, '.env.example');
  if (fs.existsSync(envPath)) {
    const env = await fs.readFile(envPath, 'utf-8');
    if (!env.includes('JWT_SECRET_KEY')) {
      await fs.appendFile(envPath, `\nJWT_SECRET_KEY=change_me_in_production\nJWT_SECRET_REFRESH_KEY=change_me_refresh_in_production\nTOKEN_EXPIRE_TIME=1h\nTOKEN_REFRESH_EXPIRE_TIME=24h\nCRYPT_SALT=10\n`);
    }
  }

  // Patch app.module.ts: add imports for AuthModule, UserModule, JwtAuthGuard, RolesGuard
  const appModulePath = path.join(targetDir, 'src', 'app.module.ts');
  if (fs.existsSync(appModulePath)) {
    let content = await fs.readFile(appModulePath, 'utf-8');

    if (!content.includes('AuthModule')) {
      content = `import { AuthModule } from './auth/auth.module';\nimport { UserModule } from './user/user.module';\nimport { APP_GUARD } from '@nestjs/core';\nimport { JwtAuthGuard } from './auth/jwt-auth.guard';\nimport { RolesGuard } from './auth/roles.guard';\nimport { LoggerModule } from './logger/logger.module';\nimport { LoggerService } from './logger/logger.service';\n` + content;

      content = content.replace(
        /imports:\s*\[/,
        `imports: [\n    AuthModule, UserModule, LoggerModule,`,
      );

      content = content.replace(
        /providers:\s*\[/,
        `providers: [\n    LoggerService,\n    { provide: APP_GUARD, useClass: JwtAuthGuard },\n    { provide: APP_GUARD, useClass: RolesGuard },`,
      );

      await fs.writeFile(appModulePath, content, 'utf-8');
    }
  }
}
