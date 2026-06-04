import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { comparePassword, hashPassword } from '../crypto/hashPassword';
import { IUserRepository } from '../db/user/user.repository.interface';
import {
  CreateUserDto,
  UserResponse,
  UpdatePasswordDto,
  User,
} from './dto/user.dto';

@Injectable()
export class UserService {
  constructor(
    @Inject('USER_REPOSITORY') private repository: IUserRepository,
  ) {}

  async getAll() {
    const users: User[] = await this.repository.getAll();
    return plainToInstance(UserResponse, users);
  }

  async getById(id: string) {
    const user: User | undefined = await this.repository.getById(id);
    if (user === undefined) {
      throw new NotFoundException('User not found');
    }
    return plainToInstance(UserResponse, user);
  }

  async getByLogin(login: string): Promise<User | undefined> {
    return this.repository.getByLogin(login);
  }

  async create(data: CreateUserDto) {
    const passwordHash = await hashPassword(data.password);
    const user: User = await this.repository.create({
      ...data,
      password: passwordHash,
    });
    return plainToInstance(UserResponse, user);
  }

  async update(id: string, data: UpdatePasswordDto) {
    const user: User | undefined = await this.repository.getById(id);
    if (user === undefined) {
      throw new NotFoundException('User not found');
    }
    if (!(await comparePassword(data.oldPassword, user.password))) {
      throw new ForbiddenException('Old password is wrong');
    }
    const newPassword: string = await hashPassword(data.newPassword);
    const uUser: User | undefined = await this.repository.update(id, {
      ...data,
      newPassword,
    });
    if (uUser === undefined) {
      throw new NotFoundException('User not found during update');
    }
    return plainToInstance(UserResponse, uUser);
  }

  async delete(id: string) {
    const user: User | undefined = await this.repository.getById(id);
    if (user === undefined) {
      throw new NotFoundException('User not found');
    }
    const deleted = await this.repository.delete(id);
    if (!deleted) {
      throw new NotFoundException('User not found');
    }
  }
}
