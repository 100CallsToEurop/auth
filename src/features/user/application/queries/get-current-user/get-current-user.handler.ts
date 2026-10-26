import { Injectable, UnauthorizedException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { LinkedAccountsService } from '../../linked-accounts.service.js';
import { UsersService } from '../../users.service.js';
import { GetCurrentUserQuery } from './get-current-user.query.js';

@Injectable()
@QueryHandler(GetCurrentUserQuery)
export class GetCurrentUserHandler implements IQueryHandler<GetCurrentUserQuery> {
  constructor(
    private readonly usersService: UsersService,
    private readonly linkedAccounts: LinkedAccountsService,
  ) {}

  async execute(query: GetCurrentUserQuery) {
    const user = await this.usersService.findById(query.userId);
    if (!user) {
      throw new UnauthorizedException('Требуется вход в аккаунт');
    }

    const identities = await this.linkedAccounts.findByUserId(user.id);
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
