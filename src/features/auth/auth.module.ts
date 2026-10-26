import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { SessionModule } from '../session/session.module.js';
import { UserModule } from '../user/user.module.js';
import { AuthController } from './api/auth.controller.js';
import { AttachPasswordHandler } from './application/commands/attach-password/attach-password.handler.js';
import { LoginHandler } from './application/commands/login/login.handler.js';
import { LogoutHandler } from './application/commands/logout/logout.handler.js';
import { RefreshHandler } from './application/commands/refresh/refresh.handler.js';
import { RegisterHandler } from './application/commands/register/register.handler.js';
import { SetPasswordHandler } from './application/commands/set-password/set-password.handler.js';
import { PasswordService } from './application/password.service.js';

const COMMAND_HANDLERS = [
  RegisterHandler,
  AttachPasswordHandler,
  LoginHandler,
  SetPasswordHandler,
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
  // Подтверждение привязки SSO к существующему аккаунту тоже проверяет
  // пароль — переиспользуем ту же реализацию bcrypt и dummy-хэш.
  exports: [PasswordService],
})
export class AuthModule {}
