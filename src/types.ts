export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun';

export interface ProjectConfig {
  name: string;
  packageManager: PackageManager;
  database: 'prisma-postgresql';
  authStrategy: 'jwt';
  description?: string;
  author?: string;
  initializeGit?: boolean;
}

export interface SqlColumn {
  name: string;
  sqlType: string;
  nullable: boolean;
  unique: boolean;
  isPrimary: boolean;
  isAutoIncrement: boolean;
  default?: string;
}

export interface ParsedSqlTable {
  tableName: string;
  columns: SqlColumn[];
}
