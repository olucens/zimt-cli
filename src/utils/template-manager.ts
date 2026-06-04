import * as fs from 'fs-extra';
import * as path from 'path';
import * as ejs from 'ejs';
import { PackageManager } from '../types';

export interface TemplateContext {
  projectName: string;
  description?: string;
  author?: string;
  license?: string;
  packageManager: PackageManager;
  database?: string;
  authStrategy?: string;
}

export async function copyTemplateFiles(
  sourceDir: string,
  targetDir: string,
  context: TemplateContext,
): Promise<void> {
  const files = await fs.readdir(sourceDir);

  for (const file of files) {
    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);

    const skipPatterns = ['node_modules', '.git', 'dist', '.DS_Store'];
    if (skipPatterns.includes(file)) {
      continue;
    }

    if (file === 'package-lock.json') {
      continue;
    }

    const stat = await fs.stat(sourcePath);

    if (stat.isDirectory()) {
      await fs.ensureDir(targetPath);
      await copyTemplateFiles(sourcePath, targetPath, context);
    } else {
      if (file.endsWith('.ejs')) {
        await processEjsTemplate(sourcePath, targetPath, context);
      } else {
        await fs.copy(sourcePath, targetPath);
      }
    }
  }
}

async function processEjsTemplate(
  sourcePath: string,
  targetPath: string,
  context: TemplateContext,
): Promise<void> {
  const content = await fs.readFile(sourcePath, 'utf-8');

  const rendered = ejs.render(content, {
    projectName: context.projectName,
    name: context.projectName,
    description: context.description || '',
    author: context.author || '',
    license: context.license || 'UNLICENSED',
    packageManager: context.packageManager,
    database: context.database || 'prisma-postgresql',
    authStrategy: context.authStrategy || 'jwt',
  });

  const finalPath = targetPath.replace(/\.ejs$/, '');
  await fs.writeFile(finalPath, rendered, 'utf-8');
}

export function renderTemplate(
  content: string,
  context: TemplateContext,
): string {
  return ejs.render(content, {
    projectName: context.projectName,
    name: context.projectName,
    description: context.description || '',
    author: context.author || '',
    license: context.license || 'UNLICENSED',
    packageManager: context.packageManager,
    database: context.database || 'prisma-postgresql',
    authStrategy: context.authStrategy || 'jwt',
  });
}
