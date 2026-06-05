import { Command } from 'commander';
import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import { Project, SyntaxKind } from 'ts-morph';
import * as prompts from '@clack/prompts';
import {
  parseSqlCreateTable,
  sqlTypeToPrisma,
  snakeToCamel,
  tableNameToEntityName,
  tableNameToResourceName,
  tableNameToRoute,
} from '../utils/sql-parser';
import { ParsedSqlTable, SqlColumn } from '../types';

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function toPluralRoute(name: string): string {
  return name.endsWith('s') ? name : `${name}s`;
}

const generateCommand = new Command('generate')
  .alias('g')
  .alias('p')
  .description('Generate a new resource or endpoint from a name or SQL')
  .argument('<name>', 'Resource name or SQL CREATE TABLE statement')
  .option('--parent <parent>', 'Parent resource for nested routing (e.g. users)')
  .action(async (name: string, options: { parent?: string }) => {
    await runGenerate(name, options.parent);
  });

const createSubCommand = new Command('create')
  .description('Generate a resource from a SQL CREATE TABLE statement')
  .argument('<sql>', 'SQL CREATE TABLE statement')
  .option('--parent <parent>', 'Parent resource for nested routing (e.g. users)')
  .action(async (sql: string, options: { parent?: string }, command: Command) => {
    // Commander.js v11 hoists --parent to the parent command's opts when both define it
    const parent = options.parent ?? (command.parent as any)?.opts()?.parent;
    await runGenerateFromSql(sql, parent);
  });

generateCommand.addCommand(createSubCommand);

export const resourceGeneratorCommand = generateCommand;

async function runGenerate(nameOrSql: string, parent?: string): Promise<void> {
  const isSql = /^CREATE\s+TABLE/i.test(nameOrSql.trim());
  if (isSql) {
    await runGenerateFromSql(nameOrSql, parent);
  } else {
    await runGenerateFromName(nameOrSql, parent);
  }
}

async function runGenerateFromName(name: string, parent?: string): Promise<void> {
  try {
    const resourceName = name.toLowerCase();
    const ResourceName = capitalize(resourceName);
    const targetDir = process.cwd();

    const appModulePath = path.join(targetDir, 'src', 'app.module.ts');
    if (!fs.existsSync(appModulePath)) {
      prompts.cancel('Not a NestJS project. Run this command from your project root.');
      process.exit(1);
    }

    const s = prompts.spinner();

    const resourceDir = path.join(targetDir, 'src', resourceName);
    const dtoDir = path.join(resourceDir, 'dto');
    const entitiesDir = path.join(resourceDir, 'entities');

    s.start(`Creating resource structure for ${ResourceName}...`);
    await fs.ensureDir(dtoDir);
    await fs.ensureDir(entitiesDir);
    s.stop('✓ Created directories');

    s.start('Generating files...');
    await generateModule(resourceDir, resourceName, ResourceName);
    await generateController(resourceDir, resourceName, ResourceName, parent);
    await generateService(resourceDir, resourceName, ResourceName);
    await generateDTO(dtoDir, resourceName, ResourceName);
    await generateEntity(entitiesDir, resourceName, ResourceName);
    await generateRepository(resourceDir, resourceName, ResourceName);
    await generateUnitTests(resourceDir, resourceName, ResourceName);
    await generateE2ETests(targetDir, resourceName, ResourceName);
    s.stop('✓ Files generated');

    s.start('Updating app.module.ts...');
    await updateAppModule(appModulePath, resourceName, ResourceName);
    s.stop('✓ app.module.ts updated');

    prompts.outro(chalk.green(`\n✓ Resource "${ResourceName}" created successfully!\n`));
    console.log(chalk.yellow("⚠️  Don't forget to:"));
    console.log(chalk.yellow(`   1. Add the ${ResourceName} model to prisma/schema.prisma`));
    console.log(chalk.yellow('   2. Run: npx prisma generate\n'));
  } catch (error: any) {
    prompts.cancel('Resource generation failed.');
    console.error(chalk.red(`\nError: ${error.message}\n`));
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

async function runGenerateFromSql(sql: string, parent?: string): Promise<void> {
  try {
    const targetDir = process.cwd();

    const appModulePath = path.join(targetDir, 'src', 'app.module.ts');
    if (!fs.existsSync(appModulePath)) {
      prompts.cancel('Not a NestJS project. Run this command from your project root.');
      process.exit(1);
    }

    const s = prompts.spinner();

    s.start('Parsing SQL...');
    let parsed: ParsedSqlTable;
    try {
      parsed = parseSqlCreateTable(sql);
    } catch (e: any) {
      s.stop('✗ SQL parse failed');
      console.error(chalk.red(`\nSQL parse error: ${e.message}\n`));
      process.exit(1);
    }
    s.stop(`✓ Parsed table "${parsed.tableName}"`);

    const resourceName = tableNameToResourceName(parsed.tableName);
    const ResourceName = tableNameToEntityName(parsed.tableName);
    const routeName = tableNameToRoute(parsed.tableName);

    const resourceDir = path.join(targetDir, 'src', resourceName);
    const dtoDir = path.join(resourceDir, 'dto');
    const entitiesDir = path.join(resourceDir, 'entities');

    s.start(`Creating resource structure for ${ResourceName}...`);
    await fs.ensureDir(dtoDir);
    await fs.ensureDir(entitiesDir);
    s.stop('✓ Created directories');

    s.start('Generating files...');
    await generateModuleFromSql(resourceDir, resourceName, ResourceName);
    await generateControllerFromSql(
      resourceDir,
      resourceName,
      ResourceName,
      routeName,
      parsed,
      parent,
    );
    await generateServiceFromSql(resourceDir, resourceName, ResourceName, parsed);
    await generateDTOFromSql(dtoDir, resourceName, ResourceName, parsed);
    await generateEntityFromSql(entitiesDir, resourceName, ResourceName, parsed);
    await generateRepositoryFromSql(resourceDir, resourceName, ResourceName, parsed, parent);
    await generateUnitTests(resourceDir, resourceName, ResourceName);
    await generateE2ETests(targetDir, resourceName, ResourceName);
    s.stop('✓ Files generated');

    s.start('Updating app.module.ts...');
    await updateAppModule(appModulePath, resourceName, ResourceName);
    s.stop('✓ app.module.ts updated');

    const prismaModel = buildPrismaModel(ResourceName, parsed);

    prompts.outro(chalk.green(`\n✓ Resource "${ResourceName}" created from SQL!\n`));
    console.log(chalk.yellow('⚠️  Next steps:'));
    console.log(chalk.yellow('   1. Add the following to prisma/schema.prisma:\n'));
    console.log(chalk.cyan(prismaModel));
    console.log(chalk.yellow('\n   2. Run: npx prisma migrate dev --name add-' + resourceName));
    console.log(chalk.yellow('   3. Run: npx prisma generate\n'));
  } catch (error: any) {
    prompts.cancel('Resource generation failed.');
    console.error(chalk.red(`\nError: ${error.message}\n`));
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

function buildPrismaModel(ModelName: string, parsed: ParsedSqlTable): string {
  const fields = parsed.columns.map((col) => sqlTypeToPrisma(col)).join('\n');
  return `model ${ModelName} {\n${fields}\n}`;
}

// ─── NAME-BASED GENERATORS ──────────────────────────────────────────────────

async function generateModule(dir: string, name: string, Name: string): Promise<void> {
  const content = `import { Module } from '@nestjs/common';
import { ${Name}Controller } from './${name}.controller';
import { ${Name}Service } from './${name}.service';
import { PrismaModule } from '../prisma/prisma.module';
import { Prisma${Name}Repository } from './${name}.repository';

@Module({
  imports: [PrismaModule],
  controllers: [${Name}Controller],
  providers: [
    {
      provide: '${Name.toUpperCase()}_REPOSITORY',
      useClass: Prisma${Name}Repository,
    },
    ${Name}Service,
  ],
  exports: [${Name}Service],
})
export class ${Name}Module {}
`;
  await fs.writeFile(path.join(dir, `${name}.module.ts`), content);
}

async function generateController(
  dir: string,
  name: string,
  Name: string,
  parent?: string,
): Promise<void> {
  const routePath = parent
    ? `${toPluralRoute(parent.toLowerCase())}/:${parent.toLowerCase()}Id/${toPluralRoute(name)}`
    : toPluralRoute(name);

  const content = `import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ${Name}Service } from './${name}.service';
import { Create${Name}Dto } from './dto/create-${name}.dto';
import { Update${Name}Dto } from './dto/update-${name}.dto';

@Controller('${routePath}')
export class ${Name}Controller {
  constructor(private readonly ${name}Service: ${Name}Service) {}

  @Get()
  async findAll(${parent ? `@Param('${parent.toLowerCase()}Id', ParseUUIDPipe) ${parent.toLowerCase()}Id: string` : ''}) {
    return this.${name}Service.findAll(${parent ? `${parent.toLowerCase()}Id` : ''});
  }

  @Get(':id')
  async findOne(
    ${parent ? `@Param('${parent.toLowerCase()}Id', ParseUUIDPipe) ${parent.toLowerCase()}Id: string,\n    ` : ''}@Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.${name}Service.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    ${parent ? `@Param('${parent.toLowerCase()}Id', ParseUUIDPipe) ${parent.toLowerCase()}Id: string,\n    ` : ''}@Body() create${Name}Dto: Create${Name}Dto,
  ) {
    return this.${name}Service.create(create${Name}Dto${parent ? `, ${parent.toLowerCase()}Id` : ''});
  }

  @Put(':id')
  async update(
    ${parent ? `@Param('${parent.toLowerCase()}Id', ParseUUIDPipe) _${parent.toLowerCase()}Id: string,\n    ` : ''}@Param('id', ParseUUIDPipe) id: string,
    @Body() update${Name}Dto: Update${Name}Dto,
  ) {
    return this.${name}Service.update(id, update${Name}Dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    ${parent ? `@Param('${parent.toLowerCase()}Id', ParseUUIDPipe) _${parent.toLowerCase()}Id: string,\n    ` : ''}@Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.${name}Service.remove(id);
  }
}
`;
  await fs.writeFile(path.join(dir, `${name}.controller.ts`), content);
}

async function generateService(dir: string, name: string, Name: string): Promise<void> {
  const content = `import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { I${Name}Repository } from './${name}.repository.interface';
import { Create${Name}Dto } from './dto/create-${name}.dto';
import { Update${Name}Dto } from './dto/update-${name}.dto';

@Injectable()
export class ${Name}Service {
  constructor(
    @Inject('${Name.toUpperCase()}_REPOSITORY')
    private repository: I${Name}Repository,
  ) {}

  async findAll(parentId?: string) {
    return this.repository.findAll(parentId);
  }

  async findOne(id: string) {
    const item = await this.repository.findById(id);
    if (!item) {
      throw new NotFoundException(\`${Name} with ID \${id} not found\`);
    }
    return item;
  }

  async create(create${Name}Dto: Create${Name}Dto, parentId?: string) {
    return this.repository.create(create${Name}Dto, parentId);
  }

  async update(id: string, update${Name}Dto: Update${Name}Dto) {
    const item = await this.repository.update(id, update${Name}Dto);
    if (!item) {
      throw new NotFoundException(\`${Name} with ID \${id} not found\`);
    }
    return item;
  }

  async remove(id: string) {
    const deleted = await this.repository.delete(id);
    if (!deleted) {
      throw new NotFoundException(\`${Name} with ID \${id} not found\`);
    }
  }
}
`;
  await fs.writeFile(path.join(dir, `${name}.service.ts`), content);
}

async function generateDTO(dtoDir: string, name: string, Name: string): Promise<void> {
  const createDto = `import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class Create${Name}Dto {
  @IsNotEmpty()
  @IsString()
  name: string;
}
`;

  const updateDto = `import { PartialType } from '@nestjs/mapped-types';
import { Create${Name}Dto } from './create-${name}.dto';

export class Update${Name}Dto extends PartialType(Create${Name}Dto) {}
`;

  await fs.writeFile(path.join(dtoDir, `create-${name}.dto.ts`), createDto);
  await fs.writeFile(path.join(dtoDir, `update-${name}.dto.ts`), updateDto);
}

async function generateEntity(entitiesDir: string, name: string, Name: string): Promise<void> {
  const content = `export interface ${Name} {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}
`;
  await fs.writeFile(path.join(entitiesDir, `${name}.entity.ts`), content);
}

async function generateRepository(dir: string, name: string, Name: string): Promise<void> {
  const prismaAccessor = Name.charAt(0).toLowerCase() + Name.slice(1);
  const interfaceContent = `import { Create${Name}Dto } from './dto/create-${name}.dto';
import { Update${Name}Dto } from './dto/update-${name}.dto';
import { ${Name} } from './entities/${name}.entity';

export interface I${Name}Repository {
  findAll(parentId?: string): Promise<${Name}[]>;
  findById(id: string): Promise<${Name} | undefined>;
  create(data: Create${Name}Dto, parentId?: string): Promise<${Name}>;
  update(id: string, data: Update${Name}Dto): Promise<${Name} | undefined>;
  delete(id: string): Promise<boolean>;
}
`;

  const prismaRepoContent = `import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { I${Name}Repository } from './${name}.repository.interface';
import { ${Name} as Prisma${Name} } from '@prisma/client';
import { Create${Name}Dto } from './dto/create-${name}.dto';
import { Update${Name}Dto } from './dto/update-${name}.dto';
import { ${Name} } from './entities/${name}.entity';

@Injectable()
export class Prisma${Name}Repository implements I${Name}Repository {
  constructor(private prisma: PrismaService) {}

  async findAll(parentId?: string): Promise<${Name}[]> {
    const items = await this.prisma.${prismaAccessor}.findMany(
      (parentId ? { where: { parentId } } : {}) as any,
    );
    return items.map((item) => this.mapToDomain(item));
  }

  async findById(id: string): Promise<${Name} | undefined> {
    const item = await this.prisma.${prismaAccessor}.findUnique({ where: { id } });
    return item ? this.mapToDomain(item) : undefined;
  }

  async create(data: Create${Name}Dto, parentId?: string): Promise<${Name}> {
    const item = await this.prisma.${prismaAccessor}.create({
      data: { ...data, ...(parentId ? { parentId } : {}) },
    });
    return this.mapToDomain(item);
  }

  async update(id: string, data: Update${Name}Dto): Promise<${Name} | undefined> {
    try {
      const item = await this.prisma.${prismaAccessor}.update({ where: { id }, data });
      return this.mapToDomain(item);
    } catch {
      return undefined;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.prisma.${prismaAccessor}.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  private mapToDomain(item: Prisma${Name}): ${Name} {
    return {
      id: (item as any).id,
      name: (item as any).name,
      createdAt: (item as any).createdAt,
      updatedAt: (item as any).updatedAt,
    };
  }
}
`;

  await fs.writeFile(path.join(dir, `${name}.repository.interface.ts`), interfaceContent);
  await fs.writeFile(path.join(dir, `${name}.repository.ts`), prismaRepoContent);
}

// ─── SQL-BASED GENERATORS ───────────────────────────────────────────────────

async function generateModuleFromSql(dir: string, name: string, Name: string): Promise<void> {
  return generateModule(dir, name, Name);
}

async function generateControllerFromSql(
  dir: string,
  name: string,
  Name: string,
  routeName: string,
  parsed: ParsedSqlTable,
  parent?: string,
): Promise<void> {
  const pluralRoute = toPluralRoute(routeName);
  const routePath = parent
    ? `${toPluralRoute(parent.toLowerCase())}/:${parent.toLowerCase()}Id/${pluralRoute}`
    : pluralRoute;

  const content = `import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ${Name}Service } from './${name}.service';
import { Create${Name}Dto } from './dto/create-${name}.dto';
import { Update${Name}Dto } from './dto/update-${name}.dto';

@Controller('${routePath}')
export class ${Name}Controller {
  constructor(private readonly ${name}Service: ${Name}Service) {}

  @Get()
  async findAll(${parent ? `@Param('${parent.toLowerCase()}Id', ParseUUIDPipe) ${parent.toLowerCase()}Id: string` : ''}) {
    return this.${name}Service.findAll(${parent ? `${parent.toLowerCase()}Id` : ''});
  }

  @Get(':id')
  async findOne(
    ${parent ? `@Param('${parent.toLowerCase()}Id', ParseUUIDPipe) _parentId: string,\n    ` : ''}@Param('id') id: string,
  ) {
    return this.${name}Service.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    ${parent ? `@Param('${parent.toLowerCase()}Id', ParseUUIDPipe) ${parent.toLowerCase()}Id: string,\n    ` : ''}@Body() dto: Create${Name}Dto,
  ) {
    return this.${name}Service.create(dto${parent ? `, ${parent.toLowerCase()}Id` : ''});
  }

  @Put(':id')
  async update(
    ${parent ? `@Param('${parent.toLowerCase()}Id', ParseUUIDPipe) _parentId: string,\n    ` : ''}@Param('id') id: string,
    @Body() dto: Update${Name}Dto,
  ) {
    return this.${name}Service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    ${parent ? `@Param('${parent.toLowerCase()}Id', ParseUUIDPipe) _parentId: string,\n    ` : ''}@Param('id') id: string,
  ) {
    return this.${name}Service.remove(id);
  }
}
`;
  await fs.writeFile(path.join(dir, `${name}.controller.ts`), content);
}

async function generateServiceFromSql(
  dir: string,
  name: string,
  Name: string,
  _parsed: ParsedSqlTable,
): Promise<void> {
  return generateService(dir, name, Name);
}

async function generateDTOFromSql(
  dtoDir: string,
  name: string,
  Name: string,
  parsed: ParsedSqlTable,
): Promise<void> {
  const nonPkCols = parsed.columns.filter((c) => !c.isPrimary && !c.isAutoIncrement);

  const validators = nonPkCols.map((col) => {
    const fieldName = snakeToCamel(col.name);
    const tsType = colToTsType(col);
    const decorators = buildValidatorDecorators(col);
    const optional = col.nullable ? '?' : '';
    return `${decorators}\n  ${fieldName}${optional}: ${tsType};`;
  });

  const imports = buildValidatorImports(nonPkCols);

  const createDto = `${imports}

export class Create${Name}Dto {
${validators.join('\n\n')}
}
`;

  const updateDto = `import { PartialType } from '@nestjs/mapped-types';
import { Create${Name}Dto } from './create-${name}.dto';

export class Update${Name}Dto extends PartialType(Create${Name}Dto) {}
`;

  await fs.writeFile(path.join(dtoDir, `create-${name}.dto.ts`), createDto);
  await fs.writeFile(path.join(dtoDir, `update-${name}.dto.ts`), updateDto);
}

async function generateEntityFromSql(
  entitiesDir: string,
  name: string,
  Name: string,
  parsed: ParsedSqlTable,
): Promise<void> {
  const fields = parsed.columns
    .map((col) => {
      const fieldName = snakeToCamel(col.name);
      const tsType = colToTsType(col);
      const optional = col.nullable ? '?' : '';
      return `  ${fieldName}${optional}: ${tsType};`;
    })
    .join('\n');

  const content = `export interface ${Name} {
${fields}
}
`;
  await fs.writeFile(path.join(entitiesDir, `${name}.entity.ts`), content);
}

async function generateRepositoryFromSql(
  dir: string,
  name: string,
  Name: string,
  parsed: ParsedSqlTable,
  parent?: string,
): Promise<void> {
  const prismaAccessor = Name.charAt(0).toLowerCase() + Name.slice(1);
  const pkCol = parsed.columns.find((c) => c.isPrimary);
  const pkField = pkCol ? snakeToCamel(pkCol.name) : 'id';
  const numericSqlTypes = new Set([
    'serial',
    'bigserial',
    'smallserial',
    'int',
    'integer',
    'bigint',
    'smallint',
  ]);
  const pkIsNumeric = pkCol ? numericSqlTypes.has(pkCol.sqlType) : false;
  const pkCast = pkIsNumeric ? 'Number(id)' : 'id as any';

  // Detect the actual FK column name for the parent relation (e.g. user_id -> userId)
  const parentFkField = parent
    ? (() => {
        const fkColName = `${parent.toLowerCase()}_id`;
        const fkCol = parsed.columns.find((c) => c.name.toLowerCase() === fkColName);
        return fkCol ? snakeToCamel(fkCol.name) : null;
      })()
    : null;

  const findAllFilter = parentFkField
    ? `(parentId ? { where: { ${parentFkField}: parentId } } : {})`
    : `(parentId ? { where: { parentId } } : {})`;

  const createParentSpread = parentFkField
    ? `...(parentId ? { ${parentFkField}: parentId } : {})`
    : `...(parentId ? { parentId } : {})`;

  const mapFields = parsed.columns
    .map((col) => {
      const fieldName = snakeToCamel(col.name);
      return `      ${fieldName}: (item as any).${fieldName},`;
    })
    .join('\n');

  const interfaceContent = `import { Create${Name}Dto } from './dto/create-${name}.dto';
import { Update${Name}Dto } from './dto/update-${name}.dto';
import { ${Name} } from './entities/${name}.entity';

export interface I${Name}Repository {
  findAll(parentId?: string): Promise<${Name}[]>;
  findById(id: string | number): Promise<${Name} | undefined>;
  create(data: Create${Name}Dto, parentId?: string): Promise<${Name}>;
  update(id: string | number, data: Update${Name}Dto): Promise<${Name} | undefined>;
  delete(id: string | number): Promise<boolean>;
}
`;

  const prismaRepoContent = `import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { I${Name}Repository } from './${name}.repository.interface';
import { Create${Name}Dto } from './dto/create-${name}.dto';
import { Update${Name}Dto } from './dto/update-${name}.dto';
import { ${Name} } from './entities/${name}.entity';

@Injectable()
export class Prisma${Name}Repository implements I${Name}Repository {
  constructor(private prisma: PrismaService) {}

  async findAll(parentId?: string): Promise<${Name}[]> {
    const items = await this.prisma.${prismaAccessor}.findMany(
      ${findAllFilter} as any,
    );
    return items.map((item) => this.mapToDomain(item));
  }

  async findById(id: string | number): Promise<${Name} | undefined> {
    const item = await this.prisma.${prismaAccessor}.findUnique({ where: { ${pkField}: ${pkCast} } });
    return item ? this.mapToDomain(item) : undefined;
  }

  async create(data: Create${Name}Dto, parentId?: string): Promise<${Name}> {
    const item = await this.prisma.${prismaAccessor}.create({
      data: { ...data, ${createParentSpread} } as any,
    });
    return this.mapToDomain(item);
  }

  async update(id: string | number, data: Update${Name}Dto): Promise<${Name} | undefined> {
    try {
      const item = await this.prisma.${prismaAccessor}.update({
        where: { ${pkField}: ${pkCast} },
        data: data as any,
      });
      return this.mapToDomain(item);
    } catch {
      return undefined;
    }
  }

  async delete(id: string | number): Promise<boolean> {
    try {
      await this.prisma.${prismaAccessor}.delete({ where: { ${pkField}: ${pkCast} } });
      return true;
    } catch {
      return false;
    }
  }

  private mapToDomain(item: any): ${Name} {
    return {
${mapFields}
    };
  }
}
`;

  await fs.writeFile(path.join(dir, `${name}.repository.interface.ts`), interfaceContent);
  await fs.writeFile(path.join(dir, `${name}.repository.ts`), prismaRepoContent);
}

// ─── UNIT + E2E TESTS ────────────────────────────────────────────────────────

async function generateUnitTests(dir: string, name: string, Name: string): Promise<void> {
  const serviceSpec = `import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ${Name}Service } from './${name}.service';
import { I${Name}Repository } from './${name}.repository.interface';
import { ${Name} } from './entities/${name}.entity';

describe('${Name}Service', () => {
  let service: ${Name}Service;
  let repository: jest.Mocked<I${Name}Repository>;

  const mock${Name} = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Test ${Name}',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as ${Name};

  const mockRepository = {
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ${Name}Service,
        { provide: '${Name.toUpperCase()}_REPOSITORY', useValue: mockRepository },
      ],
    }).compile();

    service = module.get<${Name}Service>(${Name}Service);
    repository = module.get('${Name.toUpperCase()}_REPOSITORY');
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all items', async () => {
      repository.findAll.mockResolvedValue([mock${Name}]);
      const result = await service.findAll();
      expect(repository.findAll).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should return item by id', async () => {
      repository.findById.mockResolvedValue(mock${Name});
      const result = await service.findOne((mock${Name} as any).id);
      expect(result).toEqual(mock${Name});
    });

    it('should throw NotFoundException if not found', async () => {
      repository.findById.mockResolvedValue(undefined);
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should throw NotFoundException if not found', async () => {
      repository.delete.mockResolvedValue(false);
      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
`;

  const controllerSpec = `import { Test, TestingModule } from '@nestjs/testing';
import { ${Name}Controller } from './${name}.controller';
import { ${Name}Service } from './${name}.service';

describe('${Name}Controller', () => {
  let controller: ${Name}Controller;
  let service: jest.Mocked<${Name}Service>;

  const mock${Name}Service = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [${Name}Controller],
      providers: [{ provide: ${Name}Service, useValue: mock${Name}Service }],
    }).compile();

    controller = module.get<${Name}Controller>(${Name}Controller);
    service = module.get(${Name}Service);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findAll should call service.findAll', async () => {
    service.findAll.mockResolvedValue([]);
    await controller.findAll();
    expect(service.findAll).toHaveBeenCalled();
  });
});
`;

  await fs.writeFile(path.join(dir, `${name}.service.spec.ts`), serviceSpec);
  await fs.writeFile(path.join(dir, `${name}.controller.spec.ts`), controllerSpec);
}

async function generateE2ETests(targetDir: string, name: string, Name: string): Promise<void> {
  const testDir = path.join(targetDir, 'test', name);
  await fs.ensureDir(testDir);

  const prismaAccessor = Name.charAt(0).toLowerCase() + Name.slice(1);
  const pluralRoute = toPluralRoute(name);

  const e2eSpec = `import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import * as request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('${Name} (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let created${Name}Id: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    prisma = app.get(PrismaService);
    await app.init();
  });

  afterAll(async () => {
    await prisma.${prismaAccessor}.deleteMany({});
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.${prismaAccessor}.deleteMany({});
  });

  it('POST /${pluralRoute} — creates item', async () => {
    const res = await request(app.getHttpServer())
      .post('/${pluralRoute}')
      .send({ name: 'Test ${Name}' })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    created${Name}Id = res.body.id;
  });

  it('GET /${pluralRoute} — returns array', async () => {
    const res = await request(app.getHttpServer()).get('/${pluralRoute}').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /${pluralRoute}/:id — returns 404 for unknown id', async () => {
    await request(app.getHttpServer())
      .get('/${pluralRoute}/123e4567-e89b-12d3-a456-426614174000')
      .expect(404);
  });

  it('POST /${pluralRoute} — returns 400 for invalid body', async () => {
    await request(app.getHttpServer())
      .post('/${pluralRoute}')
      .send({})
      .expect(400);
  });
});
`;

  await fs.writeFile(path.join(testDir, `${name}.e2e-spec.ts`), e2eSpec);
}

// ─── APP MODULE UPDATE ────────────────────────────────────────────────────────

async function updateAppModule(
  appModulePath: string,
  resourceName: string,
  ResourceName: string,
): Promise<void> {
  const project = new Project();
  const sourceFile = project.addSourceFileAtPath(appModulePath);

  const existingImports = sourceFile.getImportDeclarations();
  const moduleImportPath = `./${resourceName}/${resourceName}.module`;
  const moduleImportExists = existingImports.some(
    (imp) => imp.getModuleSpecifierValue() === moduleImportPath,
  );

  if (!moduleImportExists) {
    sourceFile.addImportDeclaration({
      moduleSpecifier: moduleImportPath,
      namedImports: [{ name: `${ResourceName}Module` }],
    });
  }

  const appModuleClass = sourceFile.getClass('AppModule');
  if (!appModuleClass) throw new Error('AppModule class not found');

  const moduleDecorator = appModuleClass.getDecorator('Module');
  if (!moduleDecorator) throw new Error('@Module decorator not found');

  const decoratorArgs = moduleDecorator.getArguments();
  if (!decoratorArgs || decoratorArgs.length === 0)
    throw new Error('@Module decorator has no arguments');

  const firstArg = decoratorArgs[0];
  if (firstArg.getKind() !== SyntaxKind.ObjectLiteralExpression)
    throw new Error('Invalid @Module decorator structure');

  const objExpr = firstArg.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
  const importsProp = objExpr.getProperty('imports');

  if (importsProp && importsProp.getKind() === SyntaxKind.PropertyAssignment) {
    const propertyAssignment = importsProp.asKindOrThrow(SyntaxKind.PropertyAssignment);
    const initializer = propertyAssignment.getInitializer();
    if (initializer && initializer.getKind() === SyntaxKind.ArrayLiteralExpression) {
      const arrayExpr = initializer.asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
      const elements = arrayExpr.getElements();
      const moduleExists = elements.some(
        (el: any) => el.getText().trim() === `${ResourceName}Module`,
      );
      if (!moduleExists) {
        arrayExpr.addElement(`${ResourceName}Module`);
      }
    }
  }

  sourceFile.saveSync();
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function colToTsType(col: SqlColumn): string {
  const typeMap: Record<string, string> = {
    serial: 'number',
    bigserial: 'number',
    smallserial: 'number',
    int: 'number',
    integer: 'number',
    bigint: 'number',
    smallint: 'number',
    numeric: 'number',
    decimal: 'number',
    float: 'number',
    'double precision': 'number',
    real: 'number',
    boolean: 'boolean',
    bool: 'boolean',
    text: 'string',
    varchar: 'string',
    'character varying': 'string',
    char: 'string',
    character: 'string',
    uuid: 'string',
    timestamp: 'Date',
    timestamptz: 'Date',
    'timestamp with time zone': 'Date',
    'timestamp without time zone': 'Date',
    date: 'Date',
    time: 'string',
    json: 'Record<string, unknown>',
    jsonb: 'Record<string, unknown>',
    bytea: 'Buffer',
  };
  return typeMap[col.sqlType] ?? 'string';
}

function buildValidatorDecorators(col: SqlColumn): string {
  const decorators: string[] = [];
  const tsType = colToTsType(col);

  if (!col.nullable) {
    decorators.push('  @IsNotEmpty()');
  } else {
    decorators.push('  @IsOptional()');
  }

  if (tsType === 'string') {
    decorators.push('  @IsString()');
  } else if (tsType === 'number') {
    decorators.push('  @IsNumber()');
  } else if (tsType === 'boolean') {
    decorators.push('  @IsBoolean()');
  } else if (tsType === 'Date') {
    decorators.push('  @IsDateString()');
  }

  return decorators.join('\n');
}

function buildValidatorImports(cols: SqlColumn[]): string {
  const needed = new Set<string>(['IsNotEmpty', 'IsOptional']);
  for (const col of cols) {
    const tsType = colToTsType(col);
    if (tsType === 'string') needed.add('IsString');
    if (tsType === 'number') needed.add('IsNumber');
    if (tsType === 'boolean') needed.add('IsBoolean');
    if (tsType === 'Date') needed.add('IsDateString');
  }
  return `import { ${[...needed].join(', ')} } from 'class-validator';`;
}

// ─── PUBLIC CORE API (for programmatic use and tests) ────────────────────────

export interface GenerateOptions {
  parent?: string;
}

/** Generate a resource by name directly (no CLI interaction). */
export async function generateResourceByName(
  targetDir: string,
  name: string,
  options: GenerateOptions = {},
): Promise<void> {
  const resourceName = name.toLowerCase();
  const ResourceName = capitalize(resourceName);
  const appModulePath = path.join(targetDir, 'src', 'app.module.ts');

  const resourceDir = path.join(targetDir, 'src', resourceName);
  const dtoDir = path.join(resourceDir, 'dto');
  const entitiesDir = path.join(resourceDir, 'entities');

  await fs.ensureDir(dtoDir);
  await fs.ensureDir(entitiesDir);
  await generateModule(resourceDir, resourceName, ResourceName);
  await generateController(resourceDir, resourceName, ResourceName, options.parent);
  await generateService(resourceDir, resourceName, ResourceName);
  await generateDTO(dtoDir, resourceName, ResourceName);
  await generateEntity(entitiesDir, resourceName, ResourceName);
  await generateRepository(resourceDir, resourceName, ResourceName);
  await generateUnitTests(resourceDir, resourceName, ResourceName);
  await generateE2ETests(targetDir, resourceName, ResourceName);

  if (fs.existsSync(appModulePath)) {
    await updateAppModule(appModulePath, resourceName, ResourceName);
  }
}

/** Generate a resource from a SQL CREATE TABLE statement directly. */
export async function generateResourceFromSql(
  targetDir: string,
  sql: string,
  options: GenerateOptions = {},
): Promise<{ prismaModel: string; resourceName: string; entityName: string }> {
  const parsed = parseSqlCreateTable(sql);
  const resourceName = tableNameToResourceName(parsed.tableName);
  const ResourceName = tableNameToEntityName(parsed.tableName);
  const routeName = tableNameToRoute(parsed.tableName);
  const appModulePath = path.join(targetDir, 'src', 'app.module.ts');

  const resourceDir = path.join(targetDir, 'src', resourceName);
  const dtoDir = path.join(resourceDir, 'dto');
  const entitiesDir = path.join(resourceDir, 'entities');

  await fs.ensureDir(dtoDir);
  await fs.ensureDir(entitiesDir);
  await generateModuleFromSql(resourceDir, resourceName, ResourceName);
  await generateControllerFromSql(
    resourceDir,
    resourceName,
    ResourceName,
    routeName,
    parsed,
    options.parent,
  );
  await generateServiceFromSql(resourceDir, resourceName, ResourceName, parsed);
  await generateDTOFromSql(dtoDir, resourceName, ResourceName, parsed);
  await generateEntityFromSql(entitiesDir, resourceName, ResourceName, parsed);
  await generateRepositoryFromSql(resourceDir, resourceName, ResourceName, parsed, options.parent);
  await generateUnitTests(resourceDir, resourceName, ResourceName);
  await generateE2ETests(targetDir, resourceName, ResourceName);

  if (fs.existsSync(appModulePath)) {
    await updateAppModule(appModulePath, resourceName, ResourceName);
  }

  return {
    prismaModel: buildPrismaModel(ResourceName, parsed),
    resourceName,
    entityName: ResourceName,
  };
}
