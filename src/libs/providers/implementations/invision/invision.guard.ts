import { Injectable } from '@nestjs/common';
import { ExternalAuthGuard } from '../../../common/guards/external-auth.guard.js';

/**
 * Guard входа через Invision Community: закрепляет slug 'invision' за
 * маршрутом /auth/invision. Passport-стратегию создаёт
 * InvisionProvider.createStrategy().
 */
@Injectable()
export class InvisionAuthGuard extends ExternalAuthGuard {
  protected override readonly fixedSlug = 'invision';
}
