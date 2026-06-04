import { generateResourceFromSql } from '../../src/commands/resource-generator';

export default async function generateFromSql(
  targetDir: string,
  sql: string,
  parent?: string,
): Promise<{ prismaModel: string; resourceName: string; entityName: string }> {
  return generateResourceFromSql(targetDir, sql, { parent });
}
