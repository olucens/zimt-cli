import { Command } from 'commander';
import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import * as prompts from '@clack/prompts';
import { tableNameToEntityName, tableNameToResourceName } from '../utils/sql-parser';
import { addCacheCore } from '../core/cache-core';

export const cacheCommand = new Command('r')
  .alias('cache')
  .description('Add Redis cache-aside layer to an existing endpoint/service')
  .argument('<entity-or-sql>', 'Entity name (e.g. users) or SQL SELECT statement')
  .option('--ttl <seconds>', 'Cache TTL in seconds', '300')
  .action(async (entityOrSql: string, options: { ttl: string }) => {
    try {
      const targetDir = process.cwd();
      const appModulePath = path.join(targetDir, 'src', 'app.module.ts');

      if (!fs.existsSync(appModulePath)) {
        prompts.cancel('Not a NestJS project. Run from your project root.');
        process.exit(1);
      }

      let entityName: string;
      let entity: string;

      if (/^SELECT\s/i.test(entityOrSql.trim())) {
        const tableMatch = entityOrSql.match(/FROM\s+["']?(\w+)["']?/i);
        if (!tableMatch) {
          prompts.cancel('Could not extract table name from SQL query.');
          process.exit(1);
        }
        entity = tableNameToResourceName(tableMatch[1]);
        entityName = tableNameToEntityName(tableMatch[1]);
      } else {
        entity = entityOrSql.toLowerCase().replace(/s$/, '');
        entityName = entity.charAt(0).toUpperCase() + entity.slice(1);
      }

      const ttl = parseInt(options.ttl, 10);

      const s = prompts.spinner();
      s.start(`Adding Redis cache-aside to ${entityName}Service...`);
      await addCacheCore(targetDir, entity, { ttl, silent: true });
      s.stop(`✓ Cache module created and ${entityName}Service wrapped`);

      prompts.outro(
        chalk.green(`\n✓ Redis caching added to ${entityName}Service (TTL: ${ttl}s)\n`),
      );
      console.log(chalk.yellow('⚠️  Next steps:'));
      console.log(
        chalk.yellow('   1. Run: npm install  (installs @nestjs/cache-manager, ioredis)'),
      );
      console.log(chalk.yellow('   2. Add REDIS_URL to your .env file'));
      console.log(chalk.yellow('   3. Ensure Redis is running (see docker-compose.yml)\n'));
    } catch (error: any) {
      prompts.cancel('Cache setup failed.');
      console.error(chalk.red(`\nError: ${error.message}\n`));
      if (error.stack) console.error(error.stack);
      process.exit(1);
    }
  });
