import * as fs from 'fs-extra';
import * as path from 'path';

const CLOUD_CMD = 'CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/main"]';

export interface CloudifyCoreOptions {
  /**
   * Patch the Dockerfile CMD to run `prisma db push` before starting the app,
   * so a fresh managed deploy (App Runner) creates its tables on first boot.
   * Default true.
   */
  dbPushOnStart?: boolean;
  silent?: boolean;
}

/**
 * Prepare a generated project for managed deploy. Idempotent. Throws on failure.
 */
export async function cloudifyCore(
  targetDir: string,
  opts: CloudifyCoreOptions = {},
): Promise<void> {
  const log = (msg: string) => {
    if (!opts.silent) console.log(msg);
  };

  const dockerfilePath = path.join(targetDir, 'Dockerfile');
  if (!fs.existsSync(dockerfilePath)) {
    throw new Error(`Dockerfile not found in ${targetDir}`);
  }

  if (opts.dbPushOnStart === false) return;

  const content = await fs.readFile(dockerfilePath, 'utf-8');
  if (content.includes(CLOUD_CMD)) return;

  const cmdPattern = /^CMD\s+.*$/m;
  if (!cmdPattern.test(content)) {
    throw new Error('Dockerfile has no CMD instruction to patch');
  }

  const updated = content.replace(cmdPattern, CLOUD_CMD);
  await fs.writeFile(dockerfilePath, updated, 'utf-8');
  log('✓ Dockerfile CMD patched: prisma db push runs on container start');
}
