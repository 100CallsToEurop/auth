import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { PassportModule } from '@nestjs/passport';
import { UserModule } from '../user/user.module.js';
import { SessionModule } from '../session/session.module.js';
import { ExternalModule } from '../external/external.module.js';
import { AuthController } from './api/auth.controller.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { LoginHandler } from './application/commands/login/login.handler.js';
import { RegisterHandler } from './application/commands/register/register.handler.js';
import { PasswordService } from './application/password.service.js';

const COMMAND_HANDLERS = [RegisterHandler, LoginHandler];

@Module({
  imports: [
    CqrsModule,
    UserModule,
    SessionModule,
    ExternalModule,
    PassportModule.register({ session: true }),
  ],
  controllers: [AuthController],
  providers: [
    ...COMMAND_HANDLERS,
    PasswordService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AuthModule {}
