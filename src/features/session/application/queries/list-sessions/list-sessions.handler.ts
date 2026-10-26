import { Injectable, UnauthorizedException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { RefreshTokensRepository } from '../../../infrastructure/repository/refresh-tokens.repository.js';
import { describeDevice } from '../../user-agent.js';
import { ListSessionsQuery } from './list-sessions.query.js';

export interface SessionInfo {
  id: string;
  userAgent: string | null;
  /** Человекочитаемое устройство, напр. «Chrome · macOS». */
  device: string;
  ip: string | null;
  createdAt: Date;
  expiresAt: Date;
  current: boolean;
}

@Injectable()
@QueryHandler(ListSessionsQuery)
export class ListSessionsHandler implements IQueryHandler<ListSessionsQuery> {
  constructor(
    private readonly refreshTokensRepository: RefreshTokensRepository,
  ) {}

  async execute(query: ListSessionsQuery): Promise<SessionInfo[]> {
    if (!query.userId) {
      throw new UnauthorizedException();
    }

    const sessions = await this.refreshTokensRepository.findByUserId(
      query.userId,
    );
    const now = Date.now();

    return sessions
      .filter((session) => session.expiresAt.getTime() > now)
      .map((session) => ({
        id: session.id,
        userAgent: session.userAgent,
        device: describeDevice(session.userAgent),
        ip: session.ip,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        current: session.id === query.currentSessionId,
      }));
  }
}
