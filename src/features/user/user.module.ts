import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GetCurrentUserHandler } from './application/queries/get-current-user/get-current-user.handler.js';
import { LinkedAccountsService } from './application/linked-accounts.service.js';
import { UsersService } from './application/users.service.js';
import { UserController } from './api/user.controller.js';
import { ExternalIdentity } from './domain/external-identity.entity.js';
import { User } from './domain/user.entity.js';
import { ExternalIdentitiesRepository } from './infrastructure/repository/external-identities.repository.js';
import { UsersRepository } from './infrastructure/repository/users.repository.js';

/**
 * Пользователи — листовой модуль. Он не зависит от auth, session или external:
 * остальные модули используют его прикладные сервисы. Внешние идентичности
 * лежат здесь же, потому что это часть агрегата аккаунта.
 */
@Module({
  imports: [CqrsModule, TypeOrmModule.forFeature([User, ExternalIdentity])],
  controllers: [UserController],
  providers: [
    GetCurrentUserHandler,
    UsersRepository,
    UsersService,
    ExternalIdentitiesRepository,
    LinkedAccountsService,
  ],
  exports: [UsersService, LinkedAccountsService],
})
export class UserModule {}
