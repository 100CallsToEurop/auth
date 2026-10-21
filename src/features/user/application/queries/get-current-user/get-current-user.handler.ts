import { Injectable, UnauthorizedException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ExternalIdentitysRepository } from '../../../../external/repository/external-identities.repository.js';
import { UsersRepository } from '../../../repository/users.repository.js';
import { GetCurrentUserQuery } from './get-current-user.query.js';

@Injectable()
@QueryHandler(GetCurrentUserQuery)
export class GetCurrentUserHandler
  implements IQueryHandler<GetCurrentUserQuery>
{
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly identitiesRepository: ExternalIdentitysRepository,
  ) {}

  async execute(query: GetCurrentUserQuery) {
    const user = await this.usersRepository.findById(query.userId);
    if (!user) {
      throw new UnauthorizedException();
    }

    const identities = await this.identitiesRepository.findByUserId(user.id);
    const providers = new Set<string>(identities.map((i) => i.provider));
    if (user.passwordHash) {
      providers.add('password');
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.displayName,
      providers: [...providers],
    };
  }
}
