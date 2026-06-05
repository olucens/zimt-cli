export const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

export const getInterfaceTemplate = (name: string) => {
  const PascalName = capitalize(name);
  return `import { ${PascalName}, Create${PascalName}Dto, Update${PascalName}Dto } from 'src/interfaces/${name}.interface';

export interface I${PascalName}Repository {
  getAll(): Promise<${PascalName}[]>;
  getById(id: string): Promise<${PascalName} | undefined>;
  create(data: Create${PascalName}Dto): Promise<${PascalName}>;
  update(id: string, data: Update${PascalName}Dto): Promise<${PascalName} | undefined>;
  delete(id: string): Promise<boolean>;
}`;
};

export const getPrismaRepoTemplate = (name: string) => {
  const PascalName = capitalize(name);
  return `import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { I${PascalName}Repository } from './${name}.repository.interface';
import { ${PascalName} } from '@prisma/client';
import { Create${PascalName}Dto, Update${PascalName}Dto } from 'src/interfaces/${name}.interface';

@Injectable()
export class Prisma${PascalName}Repository implements I${PascalName}Repository {
  constructor(private prisma: PrismaService) {}

  async getAll(): Promise<${PascalName}[]> {
    return this.prisma.${name}.findMany();
  }

  async getById(id: string): Promise<${PascalName} | undefined> {
    const found = await this.prisma.${name}.findUnique({ where: { id } });
    return found || undefined;
  }

  async create(dto: Create${PascalName}Dto): Promise<${PascalName}> {
    return this.prisma.${name}.create({ data: dto });
  }

  async update(id: string, dto: Update${PascalName}Dto): Promise<${PascalName} | undefined> {
    try {
      return await this.prisma.${name}.update({ where: { id }, data: dto });
    } catch {
      return undefined;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.prisma.${name}.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }
}`;
};
