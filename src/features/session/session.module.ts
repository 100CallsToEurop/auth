import { Module, forwardRef } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshToken } from './domain/refresh-token.entity.js';
import { RefreshTokensRepository } from './repository/refresh-tokens.repository.js';
import { SessionService } from './application/session.service.js';
import { TokensService } from './application/tokens.service.js';
import { LogoutHandler } from './application/commands/logout/logout.handler.js';
import { LogoutAllHandler } from './application/commands/logout-all/logout-all.handler.js';
import { RevokeSessionHandler } from './application/commands/revoke-session/revoke-session.handler.js';
import { RefreshHandler } from './application/commands/refresh/refresh.handler.js';
import { ListSessionsHandler } from './application/queries/list-sessions/list-sessions.handler.js';
import { SessionController } from './api/session.controller.js';
import { ProviderModule } from '../provider/provider.module.js';

const SESSION_HANDLERS = [
  RefreshHandler,
  LogoutHandler,
  LogoutAllHandler,
  RevokeSessionHandler,
  ListSessionsHandler,
];

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([RefreshToken]),
    forwardRef(() => ProviderModule),
  ],
  controllers: [SessionController],
  providers: [
    ...SESSION_HANDLERS,
    SessionService,
    TokensService,
    RefreshTokensRepository,
  ],
  exports: [SessionService, TokensService],
})
export class SessionModule {}
