import { Injectable } from '@nestjs/common';
import {
  ExternalAuthGuard,
  ExternalLinkGuard,
  ExternalSyncGuard,
} from '../../../common/guards/external-auth.guard.js';

/**
 * Guard'ы GitHub: вход (/auth/github), привязка (/auth/github/link) и
 * синхронизация профиля (/auth/github/sync). Passport-стратегию создаёт
 * GitHubProvider.createStrategy().
 */
@Injectable()
export class GithubAuthGuard extends ExternalAuthGuard {
  protected override readonly fixedSlug = 'github';
}

@Injectable()
export class GithubLinkGuard extends ExternalLinkGuard {
  protected override readonly fixedSlug = 'github';
}

@Injectable()
export class GithubSyncGuard extends ExternalSyncGuard {
  protected override readonly fixedSlug = 'github';
}
