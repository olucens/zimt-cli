import * as fs from 'fs-extra';
import * as path from 'path';

/**
 * Append a Prisma model (as returned by generateFromSql) to prisma/schema.prisma.
 * Idempotent by model name: appending the same model twice results in exactly
 * one occurrence. Throws on failure.
 */
export async function appendModelToSchemaCore(
  targetDir: string,
  prismaModel: string,
): Promise<void> {
  const schemaPath = path.join(targetDir, 'prisma', 'schema.prisma');
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`prisma/schema.prisma not found in ${targetDir}`);
  }

  const nameMatch = prismaModel.match(/model\s+([A-Za-z_][A-Za-z0-9_]*)/);
  if (!nameMatch) {
    throw new Error('Invalid prisma model: no "model <Name>" declaration found');
  }
  const modelName = nameMatch[1];

  const schema = await fs.readFile(schemaPath, 'utf-8');
  const alreadyPresent = new RegExp(`\\bmodel\\s+${modelName}\\b`).test(schema);
  if (alreadyPresent) return;

  const separator = schema.endsWith('\n') ? '\n' : '\n\n';
  await fs.appendFile(schemaPath, `${separator}${prismaModel.trimEnd()}\n`);
}
