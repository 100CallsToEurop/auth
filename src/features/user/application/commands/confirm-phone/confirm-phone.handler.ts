import { Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UsersService } from '../../users.service.js';
import { ConfirmPhoneCommand } from './confirm-phone.command.js';

@Injectable()
@CommandHandler(ConfirmPhoneCommand)
export class ConfirmPhoneHandler
  implements ICommandHandler<ConfirmPhoneCommand>
{
  constructor(private readonly usersService: UsersService) {}

  execute(command: ConfirmPhoneCommand) {
    return this.usersService.confirmPhone(command.userId, command.phone);
  }
}
