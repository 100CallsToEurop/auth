import { Injectable } from '@nestjs/common';
import { ExternalAuthGuard } from '../../../common/guards/external-auth.guard.js';

/**
 * Guard входа через GitHub: закрепляет slug 'github' за маршрутом /auth/github.
 * Саму Passport-стратегию создаёт GitHubProvider.createStrategy().
 */
@Injectable()
export class GithubAuthGuard extends ExternalAuthGuard {
  protected override readonly fixedSlug = 'github';
}
