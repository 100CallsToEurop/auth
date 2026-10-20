import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './domain/user.entity.js';
import { ExternalIdentity } from './domain/external-identity.entity.js';
import { UsersRepository } from './repository/users.repository.js';
import { ExternalIdentitysRepository } from './repository/external-identities.repository.js';
import { CqrsModule } from '@nestjs/cqrs';
import { GetCurrentUserHandler } from './application/queries/get-current-user/get-current-user.handler.js';

@Module({
  imports: [CqrsModule, TypeOrmModule.forFeature([User, ExternalIdentity])],
  providers: [
    GetCurrentUserHandler,
    UsersRepository,
    ExternalIdentitysRepository,
  ],
  exports: [UsersRepository, ExternalIdentitysRepository],
})
export class UserModule {}
