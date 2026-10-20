import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import { AppModule } from './features/app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  // За reverse-proxy (nginx + TLS-терминация): express-session и cookie
  // должны видеть X-Forwarded-Proto, иначе Secure-cookie не ставится
  // и OIDC state-проверка на /callback падает с 401.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use(cookieParser());
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'dev-session-secret-change-me',
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
await bootstrap();
