import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * Проверка Origin для маршрутов, которые авторизуются по refresh-cookie
 * (синхронизация и привязка внешнего провайдера).
 *
 * Cookie с SameSite=Lax не отправляется на кросс-сайтовом POST, поэтому
 * такой запрос и так не пройдёт. Но если фронтенд и API на одном сайте
 * (разные поддомены), Lax-cookie уйдёт — и злоумышленник сможет отправить
 * форму от имени жертвы. Проверка Origin закрывает этот случай: браузер
 * всегда присылает Origin в POST-запросах.
 *
 * Запросы без Origin (не браузерный клиент, curl) пропускаем: там защиту
 * обеспечивает проверка сессии.
 */
@Injectable()
export class FrontendOriginGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const origin = request.headers.origin;

    if (!origin) {
      return true;
    }

    if (this.allowedOrigins(request).has(origin)) {
      return true;
    }

    throw new ForbiddenException('Источник запроса не разрешён');
  }

  /** Разрешённые origin: CORS_ORIGIN, FRONTEND_URL и собственный origin запроса. */
  private allowedOrigins(request: Request): Set<string> {
    const configured = [
      this.configService.get<string>('CORS_ORIGIN') ?? '',
      this.configService.get<string>('FRONTEND_URL') ?? '',
    ]
      .flatMap((value) => value.split(','))
      .map((value) => value.trim())
      .filter(Boolean);

    const host = request.get('host');
    const self = host ? `${request.protocol}://${host}` : '';

    return new Set(self ? [...configured, self] : configured);
  }
}
