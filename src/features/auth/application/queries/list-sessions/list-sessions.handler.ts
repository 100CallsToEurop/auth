import { Injectable, UnauthorizedException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { RefreshTokensRepository } from '../../../repository/refresh-tokens.repository.js';
import { ListSessionsQuery } from './list-sessions.query.js';

export interface SessionInfo {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date;
  current: boolean;
}

@Injectable()
@QueryHandler(ListSessionsQuery)
export class ListSessionsHandler
  implements IQueryHandler<ListSessionsQuery>
{
  constructor(
    private readonly refreshTokensRepository: RefreshTokensRepository,
  ) {}

  async execute(query: ListSessionsQuery): Promise<SessionInfo[]> {
    if (!query.userId) {
      throw new UnauthorizedException();
    }

    const sessions =
      await this.refreshTokensRepository.findByUserId(query.userId);
    const now = Date.now();

    return sessions
      .filter((session) => session.expiresAt.getTime() > now)
      .map((session) => ({
        id: session.id,
        userAgent: session.userAgent,
        ip: session.ip,
        createdAt: session.createdAt,
        lastUsedAt: session.lastUsedAt,
        expiresAt: session.expiresAt,
        current: session.id === query.currentSessionId,
      }));
  }
}
