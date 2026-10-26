import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../../../libs/common/decorators/current-user.decorator.js';
import { CurrentUser } from '../../../libs/common/decorators/current-user.decorator.js';
import { ConfirmPhoneCommand } from '../application/commands/confirm-phone/confirm-phone.command.js';
import { UpdateProfileCommand } from '../application/commands/update-profile/update-profile.command.js';
import { GetCurrentUserQuery } from '../application/queries/get-current-user/get-current-user.query.js';
import { ConfirmPhoneDto } from './dto/confirm-phone.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';

/**
 * Профиль текущего пользователя. Read-model принадлежит модулю пользователей,
 * а не auth: auth отвечает только за вход.
 */
@Controller('auth')
export class UserController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.queryBus.execute(new GetCurrentUserQuery(user.id));
  }

  /**
   * Редактирование личных данных. Сервер сам проверяет, подтверждён ли
   * телефон: скрытая в UI форма не является защитой.
   */
  @Patch('profile')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async updateProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfileDto,
  ) {
    await this.commandBus.execute(new UpdateProfileCommand(user.id, dto));
    return this.queryBus.execute(new GetCurrentUserQuery(user.id));
  }

  /**
   * Условное подтверждение телефона: SMS не отправляется, номер сразу
   * сохраняется как подтверждённый. В реальном сервисе здесь была бы
   * отправка и проверка кода.
   */
  @Post('profile/phone/confirm')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async confirmPhone(
    @CurrentUser() user: AuthUser,
    @Body() dto: ConfirmPhoneDto,
  ) {
    await this.commandBus.execute(new ConfirmPhoneCommand(user.id, dto.phone));
    return this.queryBus.execute(new GetCurrentUserQuery(user.id));
  }
}
