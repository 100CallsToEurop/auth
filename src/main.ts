import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import helmet from 'helmet';
import { randomBytes } from 'node:crypto';
import { AppModule } from './app.module.js';

const logger = new Logger('Bootstrap');

/**
 * Секрет подписи express-сессии (в ней живёт OAuth-state и флаг синхронизации).
 * В проде обязан быть задан: иначе cookie подписывается публичной константой.
 * В dev генерируем временный — сессии сбросятся при перезапуске, но подделывать
 * их нельзя.
 */
function resolveSessionSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (secret) {
    return secret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET is required when NODE_ENV=production');
  }
  logger.warn(
    'SESSION_SECRET не задан — используется временный секрет, ' +
      'сессии будут сброшены при перезапуске процесса',
  );
  return randomBytes(32).toString('hex');
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  // За reverse-proxy (nginx + TLS-терминация): express-session и cookie
  // должны видеть X-Forwarded-Proto, иначе Secure-cookie не ставится
  // и OIDC state-проверка на /callback падает с 401.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Базовые защитные заголовки (HSTS, nosniff, frame-ancestors и т.д.).
  app.use(
    helmet({
      // API отдаёт только JSON: CSP для него не нужен, а его
      // upgrade-insecure-requests мешал бы локальной работе по http.
      contentSecurityPolicy: false,
      // Фронтенд в разработке обращается к API с другого origin
      // (localhost:8080 → localhost:3000), поэтому ответы API не должны
      // блокироваться политикой cross-origin resource.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // Валидация входных данных: без неё декораторы class-validator на DTO
  // не выполняются, и кривые значения (число вместо email и т.п.) падают
  // с 500 внутри бизнес-логики.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.use(cookieParser());
  app.use(
    session({
      secret: resolveSessionSecret(),
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === 'production' ? 'auto' : false,
        httpOnly: true,
        sameSite: 'lax',
      },
    }),
  );
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim()),
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3000);
}

await bootstrap().catch((err: unknown) => {
  logger.error(
    `Не удалось запустить приложение: ${
      err instanceof Error ? err.message : String(err)
    }`,
  );
  process.exit(1);
});
