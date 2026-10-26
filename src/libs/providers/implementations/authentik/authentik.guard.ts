import { Injectable } from '@nestjs/common';
import { ExternalAuthGuard } from '../../../common/guards/external-auth.guard.js';

/**
 * Guard входа через Authentik: закрепляет slug 'authentik' за маршрутом
 * /auth/authentik. Passport-стратегию создаёт AuthentikProvider.createStrategy().
 */
@Injectable()
export class AuthentikAuthGuard extends ExternalAuthGuard {
  protected override readonly fixedSlug = 'authentik';
}
