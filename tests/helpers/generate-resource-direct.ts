import { generateResourceByName } from '../../src/commands/resource-generator';

export default async function generateResource(
  targetDir: string,
  name: string,
  parent?: string,
): Promise<void> {
  await generateResourceByName(targetDir, name, { parent });
}
