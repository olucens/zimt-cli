import { ParsedSqlTable, SqlColumn } from '../types';

const SQL_TO_PRISMA: Record<string, string> = {
  serial: 'Int',
  bigserial: 'BigInt',
  smallserial: 'Int',
  int: 'Int',
  integer: 'Int',
  bigint: 'BigInt',
  smallint: 'Int',
  numeric: 'Decimal',
  decimal: 'Decimal',
  float: 'Float',
  'double precision': 'Float',
  real: 'Float',
  boolean: 'Boolean',
  bool: 'Boolean',
  text: 'String',
  varchar: 'String',
  'character varying': 'String',
  char: 'String',
  character: 'String',
  uuid: 'String',
  timestamp: 'DateTime',
  timestamptz: 'DateTime',
  'timestamp with time zone': 'DateTime',
  'timestamp without time zone': 'DateTime',
  date: 'DateTime',
  time: 'String',
  json: 'Json',
  jsonb: 'Json',
  bytea: 'Bytes',
};

const SQL_TO_TS: Record<string, string> = {
  serial: 'number',
  bigserial: 'bigint',
  smallserial: 'number',
  int: 'number',
  integer: 'number',
  bigint: 'bigint',
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

export function parseSqlCreateTable(sql: string): ParsedSqlTable {
  const normalized = sql.replace(/\s+/g, ' ').trim();

  const tableMatch = normalized.match(
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?(\w+)"?\.)?"?(\w+)"?\s*\(/i,
  );
  if (!tableMatch) {
    throw new Error('Could not parse table name from SQL CREATE TABLE statement');
  }
  const tableName = tableMatch[2];

  const bodyMatch = normalized.match(/\((.+)\)\s*;?\s*$/is);
  if (!bodyMatch) {
    throw new Error('Could not parse column definitions from SQL');
  }
  const body = bodyMatch[1];

  const columnDefs = splitColumnDefs(body);
  const columns: SqlColumn[] = [];

  const tableLevelPrimaries = new Set<string>();
  const tableLevelUniques = new Set<string>();

  for (const def of columnDefs) {
    const trimmed = def.trim();
    if (!trimmed) continue;

    const upperTrimmed = trimmed.toUpperCase();

    if (upperTrimmed.startsWith('PRIMARY KEY')) {
      const pkCols = trimmed.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
      if (pkCols) {
        pkCols[1].split(',').forEach((c) => tableLevelPrimaries.add(c.trim().replace(/"/g, '')));
      }
      continue;
    }
    if (upperTrimmed.startsWith('UNIQUE')) {
      const uqCols = trimmed.match(/UNIQUE\s*\(([^)]+)\)/i);
      if (uqCols) {
        uqCols[1].split(',').forEach((c) => tableLevelUniques.add(c.trim().replace(/"/g, '')));
      }
      continue;
    }
    if (
      upperTrimmed.startsWith('FOREIGN KEY') ||
      upperTrimmed.startsWith('CONSTRAINT') ||
      upperTrimmed.startsWith('CHECK') ||
      upperTrimmed.startsWith('INDEX')
    ) {
      continue;
    }

    const col = parseColumnDef(trimmed);
    if (col) {
      columns.push(col);
    }
  }

  for (const col of columns) {
    if (tableLevelPrimaries.has(col.name)) col.isPrimary = true;
    if (tableLevelUniques.has(col.name)) col.unique = true;
  }

  return { tableName, columns };
}

function splitColumnDefs(body: string): string[] {
  const defs: string[] = [];
  let depth = 0;
  let current = '';

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      defs.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) defs.push(current.trim());
  return defs;
}

function parseColumnDef(def: string): SqlColumn | null {
  const match = def.match(/^"?(\w+)"?\s+(.+)/i);
  if (!match) return null;

  const name = match[1];
  const rest = match[2].toUpperCase();

  const upperDef = def.toUpperCase();

  const isPrimary = upperDef.includes('PRIMARY KEY');
  const isNotNull = upperDef.includes('NOT NULL') || isPrimary;
  const unique = upperDef.includes('UNIQUE');
  const isAutoIncrement =
    rest.startsWith('SERIAL') ||
    rest.startsWith('BIGSERIAL') ||
    rest.startsWith('SMALLSERIAL') ||
    upperDef.includes('AUTO_INCREMENT');

  const rawType = extractSqlType(match[2]);

  const defaultMatch = def.match(/DEFAULT\s+(\S+)/i);
  const defaultVal = defaultMatch ? defaultMatch[1] : undefined;

  return {
    name,
    sqlType: rawType.toLowerCase(),
    nullable: !isNotNull,
    unique,
    isPrimary,
    isAutoIncrement,
    default: defaultVal,
  };
}

function extractSqlType(typeStr: string): string {
  const normalized = typeStr.trim();

  const multiWordTypes = [
    'TIMESTAMP WITH TIME ZONE',
    'TIMESTAMP WITHOUT TIME ZONE',
    'DOUBLE PRECISION',
    'CHARACTER VARYING',
  ];
  for (const mwt of multiWordTypes) {
    if (normalized.toUpperCase().startsWith(mwt)) {
      return mwt.toLowerCase();
    }
  }

  const simpleMatch = normalized.match(/^(\w+)/);
  return simpleMatch ? simpleMatch[1].toLowerCase() : 'text';
}

export function sqlTypeToPrisma(column: SqlColumn): string {
  const base = SQL_TO_PRISMA[column.sqlType] ?? 'String';
  const modifiers: string[] = [];

  if (column.isPrimary) {
    modifiers.push('@id');
    if (column.isAutoIncrement) {
      modifiers.push('@default(autoincrement())');
    } else if (column.sqlType === 'uuid') {
      modifiers.push('@default(uuid())');
    }
  } else {
    if (column.isAutoIncrement) {
      modifiers.push('@default(autoincrement())');
    } else if (column.default) {
      const d = column.default.toUpperCase();
      if (d.startsWith('NOW()') || d.startsWith('CURRENT_TIMESTAMP')) {
        modifiers.push('@default(now())');
      } else if (d === 'TRUE') {
        modifiers.push('@default(true)');
      } else if (d === 'FALSE') {
        modifiers.push('@default(false)');
      }
    }
    if (column.unique) modifiers.push('@unique');
  }

  const snakeName = column.name;
  const camelName = snakeToCamel(snakeName);
  if (camelName !== snakeName) {
    modifiers.push(`@map("${snakeName}")`);
  }

  const nullMark = column.nullable && !column.isPrimary ? '?' : '';
  const mods = modifiers.length > 0 ? '  ' + modifiers.join(' ') : '';
  return `  ${camelName}  ${base}${nullMark}${mods}`;
}

export function sqlTypeToTs(sqlType: string, nullable: boolean): string {
  const base = SQL_TO_TS[sqlType] ?? 'string';
  return nullable ? `${base} | null` : base;
}

export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

export function snakeToPascal(str: string): string {
  const camel = snakeToCamel(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

export function tableNameToEntityName(tableName: string): string {
  let singular: string;
  if (tableName.endsWith('ies')) {
    singular = tableName.slice(0, -3) + 'y';
  } else if (tableName.endsWith('s')) {
    singular = tableName.slice(0, -1);
  } else {
    singular = tableName;
  }
  return snakeToPascal(singular);
}

export function tableNameToResourceName(tableName: string): string {
  return snakeToCamel(tableName);
}

export function tableNameToRoute(tableName: string): string {
  return tableName.toLowerCase().replace(/_/g, '-');
}
