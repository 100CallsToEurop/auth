import { Controller, Get } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import type { AuthUser } from '../../../libs/common/decorators/current-user.decorator.js';
import { CurrentUser } from '../../../libs/common/decorators/current-user.decorator.js';
import { GetCurrentUserQuery } from '../application/queries/get-current-user/get-current-user.query.js';

/**
 * Профиль текущего пользователя. Read-model принадлежит модулю пользователей,
 * а не auth: auth отвечает только за вход.
 */
@Controller('auth')
export class UserController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.queryBus.execute(new GetCurrentUserQuery(user.id));
  }
}
