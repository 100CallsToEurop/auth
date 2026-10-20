import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { PassportModule } from '@nestjs/passport';
import { UserModule } from '../user/user.module.js';
import { AuthController } from './api/auth.controller.js';
import { JwtAuthGuard } from './api/guards/jwt-auth.guard.js';
import { LoginHandler } from './application/commands/login/login.handler.js';
import { LogoutHandler } from './application/commands/logout/logout.handler.js';
import { RefreshHandler } from './application/commands/refresh/refresh.handler.js';
import { RegisterHandler } from './application/commands/register/register.handler.js';
import { PasswordService } from './application/password.service.js';
import { SessionService } from './application/session.service.js';
import { TokensService } from './application/tokens.service.js';
import { RefreshTokensRepository } from './repository/refresh-tokens.repository.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshToken } from './domain/refresh-token.entity.js';
import { AuthentikStrategy } from './oidc/authentik.strategy.js';

const COMMAND_HANDLERS = [
  RegisterHandler,
  LoginHandler,
  RefreshHandler,
  LogoutHandler,
];

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([RefreshToken]),
    UserModule,
    PassportModule.register({ session: true }),
  ],
  controllers: [AuthController],
  providers: [
    ...COMMAND_HANDLERS,
    PasswordService,
    SessionService,
    TokensService,
    RefreshTokensRepository,
    AuthentikStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AuthModule {}
