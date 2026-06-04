import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaUserRepository } from '../db/user/prisma.user.repository';

@Module({
  imports: [PrismaModule],
  controllers: [UserController],
  providers: [
    {
      provide: 'USER_REPOSITORY',
      useClass: PrismaUserRepository,
    },
    UserService,
  ],
  exports: [UserService],
})
export class UserModule {}
