import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IUserRepository } from './user.repository.interface';
import {
  CreateUserDto,
  User as DomainUser,
  UpdatePasswordDto,
} from '../../user/dto/user.dto';
import { User as PrismaUser } from '@prisma/client';

@Injectable()
export class PrismaUserRepository implements IUserRepository {
  constructor(private prisma: PrismaService) {}

  async getAll(): Promise<DomainUser[]> {
    const users = await this.prisma.user.findMany();
    return users.map((user) => this.mapToDomain(user));
  }

  async getById(id: string): Promise<DomainUser | undefined> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? this.mapToDomain(user) : undefined;
  }

  async getByLogin(login: string): Promise<DomainUser | undefined> {
    const user = await this.prisma.user.findFirst({ where: { login } });
    return user ? this.mapToDomain(user) : undefined;
  }

  async create(dto: CreateUserDto): Promise<DomainUser> {
    const user = await this.prisma.user.create({
      data: {
        login: dto.login,
        password: dto.password,
        roles: ['user'],
        version: 1,
      },
    });
    return this.mapToDomain(user);
  }

  async update(
    id: string,
    data: UpdatePasswordDto,
  ): Promise<DomainUser | undefined> {
    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: {
          password: data.newPassword,
          version: { increment: 1 },
        },
      });
      return this.mapToDomain(user);
    } catch {
      return undefined;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.prisma.user.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  private mapToDomain(user: PrismaUser): DomainUser {
    return {
      id: user.id,
      login: user.login,
      password: user.password,
      roles: user.roles || ['user'],
      version: user.version,
      createdAt: user.createdAt.getTime(),
      updatedAt: user.updatedAt.getTime(),
    };
  }
}
