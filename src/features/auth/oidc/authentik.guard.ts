import { Injectable, Logger, type ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class AuthentikGuard extends AuthGuard('authentik') {
  private readonly logger = new Logger(AuthentikGuard.name);

  override handleRequest<TUser = any>(
    err: any,
    user: any,
    info: any,
    context: ExecutionContext,
    status?: any,
  ): TUser {
    if (err || !user) {
      const reason =
        err instanceof Error
          ? err.message
          : err ??
            (typeof info === 'string'
              ? info
              : info
                ? JSON.stringify(info)
                : 'unknown');
      this.logger.warn(`Authentik OIDC authentication failed: ${reason}`);
    }
    return super.handleRequest<TUser>(err, user, info, context, status);
  }
}
