import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../consts/auth.constants.js';
import { TokensService } from '../../../features/session/application/tokens.service.js';
import { TokenVersionsRepository } from '../../../features/session/infrastructure/repository/token-versions.repository.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokensService: TokensService,
    private readonly reflector: Reflector,
    private readonly tokenVersionsRepository: TokenVersionsRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: { id: string; email: string } }>();
    const token = this.extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException();
    }

    const payload = await this.tokensService.verifyAccess(token);
    if (!payload) {
      throw new UnauthorizedException();
    }

    // Версия токенов: после «выйти со всех устройств» прежние access-токены
    // перестают приниматься, даже если не истекли.
    const current = await this.tokenVersionsRepository.findVersion(payload.sub);
    if ((payload.ver ?? 0) !== current) {
      throw new UnauthorizedException();
    }

    request.user = { id: payload.sub, email: payload.email };
    return true;
  }

  private extractBearerToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return undefined;
    }
    return header.slice('Bearer '.length);
  }
}
