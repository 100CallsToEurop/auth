import { Injectable } from '@nestjs/common';
import { ExternalAuthGuard } from '../../../common/guards/external-auth.guard.js';

/**
 * Guard входа через Яндекс: закрепляет slug 'yandex' за маршрутом
 * /auth/yandex. Passport-стратегию создаёт YandexProvider.createStrategy().
 */
@Injectable()
export class YandexAuthGuard extends ExternalAuthGuard {
  protected override readonly fixedSlug = 'yandex';
}
