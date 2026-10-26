import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalProvidersModule } from '../../libs/providers/common/registry/external-providers.module.js';
import { ListSessionsHandler } from './application/queries/list-sessions/list-sessions.handler.js';
import { InvalidateTokensHandler } from './application/commands/invalidate-tokens/invalidate-tokens.handler.js';
import { LogoutAllHandler } from './application/commands/logout-all/logout-all.handler.js';
import { RevokeSessionHandler } from './application/commands/revoke-session/revoke-session.handler.js';
import { SessionLogoutService } from './application/session-logout.service.js';
import { SessionService } from './application/session.service.js';
import { TokensService } from './application/tokens.service.js';
import { SessionController } from './api/session.controller.js';
import { BadRefreshToken } from './domain/bad-refresh-token.entity.js';
import { RefreshToken } from './domain/refresh-token.entity.js';
import { UserTokenVersion } from './domain/user-token-version.entity.js';
import { BadRefreshTokensRepository } from './infrastructure/repository/bad-refresh-tokens.repository.js';
import { RefreshTokensRepository } from './infrastructure/repository/refresh-tokens.repository.js';
import { TokenVersionsRepository } from './infrastructure/repository/token-versions.repository.js';

const SESSION_HANDLERS = [
  LogoutAllHandler,
  RevokeSessionHandler,
  ListSessionsHandler,
  InvalidateTokensHandler,
];

/**
 * Сессии и токены: хранение refresh-токенов, JWT, версии токенов и blacklist,
 * управление сессиями (список, отзыв, logout/all). Вход, refresh и logout
 * текущей сессии — в auth.
 * Зависимость от external ограничена листовым реестром провайдеров — он нужен
 * только для SSO-выхода.
 */
@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([RefreshToken, BadRefreshToken, UserTokenVersion]),
    ExternalProvidersModule,
  ],
  controllers: [SessionController],
  providers: [
    ...SESSION_HANDLERS,
    SessionService,
    SessionLogoutService,
    TokensService,
    RefreshTokensRepository,
    BadRefreshTokensRepository,
    TokenVersionsRepository,
  ],
  exports: [
    SessionService,
    SessionLogoutService,
    TokensService,
    RefreshTokensRepository,
    BadRefreshTokensRepository,
    TokenVersionsRepository,
  ],
})
export class SessionModule {}
