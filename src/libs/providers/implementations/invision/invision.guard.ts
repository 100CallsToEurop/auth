import { Injectable } from '@nestjs/common';
import {
  ExternalAuthGuard,
  ExternalLinkGuard,
  ExternalSyncGuard,
} from '../../../common/guards/external-auth.guard.js';

/**
 * Guard'ы Invision Community: вход (/auth/invision), привязка
 * (/auth/invision/link) и синхронизация профиля (/auth/invision/sync).
 * Passport-стратегию создаёт InvisionProvider.createStrategy().
 */
@Injectable()
export class InvisionAuthGuard extends ExternalAuthGuard {
  protected override readonly fixedSlug = 'invision';
}

@Injectable()
export class InvisionLinkGuard extends ExternalLinkGuard {
  protected override readonly fixedSlug = 'invision';
}

@Injectable()
export class InvisionSyncGuard extends ExternalSyncGuard {
  protected override readonly fixedSlug = 'invision';
}
