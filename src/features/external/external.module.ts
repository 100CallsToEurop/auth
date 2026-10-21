import { Module, forwardRef } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from '../user/user.module.js';
import { SessionModule } from '../session/session.module.js';
import { ProviderModule } from '../provider/provider.module.js';
import { ExternalIdentity } from './domain/external-identity.entity.js';
import { ExternalIdentitysRepository } from './repository/external-identities.repository.js';
import { ExternalAccountLinker } from './application/external-account-linker.js';
import {
  ExternalAuthGuard,
  ExternalSyncGuard,
} from '../../common/guards/external-auth.guard.js';
import { ExternalController } from './api/external.controller.js';

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([ExternalIdentity]),
    forwardRef(() => UserModule),
    forwardRef(() => SessionModule),
    forwardRef(() => ProviderModule),
  ],
  controllers: [ExternalController],
  providers: [
    ExternalIdentitysRepository,
    ExternalAccountLinker,
    ExternalAuthGuard,
    ExternalSyncGuard,
  ],
  exports: [ExternalIdentitysRepository, ExternalAccountLinker],
})
export class ExternalModule {}
