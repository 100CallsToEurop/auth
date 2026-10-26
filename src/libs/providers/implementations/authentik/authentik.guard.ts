import { Injectable } from '@nestjs/common';
import {
  ExternalAuthGuard,
  ExternalLinkGuard,
  ExternalSyncGuard,
} from '../../../common/guards/external-auth.guard.js';

/**
 * Guard'ы Authentik: вход (/auth/authentik), привязка
 * (/auth/authentik/link) и синхронизация профиля (/auth/authentik/sync).
 * Passport-стратегию создаёт AuthentikProvider.createStrategy().
 */
@Injectable()
export class AuthentikAuthGuard extends ExternalAuthGuard {
  protected override readonly fixedSlug = 'authentik';
}

@Injectable()
export class AuthentikLinkGuard extends ExternalLinkGuard {
  protected override readonly fixedSlug = 'authentik';
}

@Injectable()
export class AuthentikSyncGuard extends ExternalSyncGuard {
  protected override readonly fixedSlug = 'authentik';
}
