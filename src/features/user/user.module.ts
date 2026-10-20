import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './domain/user.entity.js';
import { UsersRepository } from './repository/users.repository.js';
import { CqrsModule } from '@nestjs/cqrs';
import { GetCurrentUserHandler } from './application/queries/get-current-user/get-current-user.handler.js';

@Module({
  imports: [CqrsModule, TypeOrmModule.forFeature([User])],
  providers: [GetCurrentUserHandler, UsersRepository],
  exports: [UsersRepository],
})
export class UserModule {}
