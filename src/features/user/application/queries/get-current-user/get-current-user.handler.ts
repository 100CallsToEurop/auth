import { Injectable, UnauthorizedException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { UsersRepository } from '../../../repository/users.repository.js';
import { GetCurrentUserQuery } from './get-current-user.query.js';

@Injectable()
@QueryHandler(GetCurrentUserQuery)
export class GetCurrentUserHandler
  implements IQueryHandler<GetCurrentUserQuery>
{
  constructor(private readonly usersRepository: UsersRepository) {}

  async execute(query: GetCurrentUserQuery) {
    const user = await this.usersRepository.findById(query.userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    return { id: user.id, email: user.email };
  }
}
