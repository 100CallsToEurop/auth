import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './domain/user.entity.js';
import { UsersRepository } from './repository/users.repository.js';
import { CqrsModule } from '@nestjs/cqrs';
import { ExternalModule } from '../external/external.module.js';
import { GetCurrentUserHandler } from './application/queries/get-current-user/get-current-user.handler.js';

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([User]),
    forwardRef(() => ExternalModule),
  ],
  providers: [GetCurrentUserHandler, UsersRepository],
  exports: [UsersRepository],
})
export class UserModule {}
