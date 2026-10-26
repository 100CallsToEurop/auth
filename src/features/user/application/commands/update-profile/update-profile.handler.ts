import { Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UsersService } from '../../users.service.js';
import { UpdateProfileCommand } from './update-profile.command.js';

@Injectable()
@CommandHandler(UpdateProfileCommand)
export class UpdateProfileHandler
  implements ICommandHandler<UpdateProfileCommand>
{
  constructor(private readonly usersService: UsersService) {}

  execute(command: UpdateProfileCommand) {
    return this.usersService.updateProfile(command.userId, command.changes);
  }
}
