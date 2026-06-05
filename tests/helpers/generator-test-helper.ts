import { generateResourceByName, generateResourceFromSql } from '../../src/commands/resource-generator';

export async function runGenerateFromNameDirect(
  targetDir: string,
  name: string,
  parent?: string,
): Promise<void> {
  await generateResourceByName(targetDir, name, { parent });
}

export async function runGenerateFromSqlDirect(
  targetDir: string,
  sql: string,
  parent?: string,
): Promise<{ prismaModel: string; resourceName: string; entityName: string }> {
  return generateResourceFromSql(targetDir, sql, { parent });
}
