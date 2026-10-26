import { Injectable } from '@nestjs/common';
import {
  ExternalAuthGuard,
  ExternalLinkGuard,
  ExternalSyncGuard,
} from '../../../common/guards/external-auth.guard.js';

/**
 * Guard'ы Яндекс: вход (/auth/yandex), привязка (/auth/yandex/link) и
 * синхронизация профиля (/auth/yandex/sync). Passport-стратегию создаёт
 * YandexProvider.createStrategy().
 */
@Injectable()
export class YandexAuthGuard extends ExternalAuthGuard {
  protected override readonly fixedSlug = 'yandex';
}

@Injectable()
export class YandexLinkGuard extends ExternalLinkGuard {
  protected override readonly fixedSlug = 'yandex';
}

@Injectable()
export class YandexSyncGuard extends ExternalSyncGuard {
  protected override readonly fixedSlug = 'yandex';
}
