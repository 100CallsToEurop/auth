import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { SessionModule } from '../session/session.module.js';
import { UserModule } from '../user/user.module.js';
import { AuthController } from './api/auth.controller.js';
import { LoginHandler } from './application/commands/login/login.handler.js';
import { LogoutHandler } from './application/commands/logout/logout.handler.js';
import { RefreshHandler } from './application/commands/refresh/refresh.handler.js';
import { RegisterHandler } from './application/commands/register/register.handler.js';
import { PasswordService } from './application/password.service.js';

const COMMAND_HANDLERS = [
  RegisterHandler,
  LoginHandler,
  RefreshHandler,
  LogoutHandler,
];

/**
 * Вход и выход: локальная регистрация/вход, обновление refresh-токена и
 * logout текущей сессии. Пользователи и управление сессиями — отдельные
 * модули; auth только связывает проверку пароля с выдачей сессии.
 */
@Module({
  imports: [CqrsModule, UserModule, SessionModule],
  controllers: [AuthController],
  providers: [...COMMAND_HANDLERS, PasswordService],
})
export class AuthModule {}
