import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { QueryFailedFilter } from './libs/common/filters/query-failed.filter.js';
import { AuthModule } from './features/auth/auth.module.js';
import { ExternalModule } from './features/external/external.module.js';
import { SessionModule } from './features/session/session.module.js';
import { JwtAuthGuard } from './libs/common/guards/jwt-auth.guard.js';
import { UserModule } from './features/user/user.module.js';

/**
 * Синхронизация схемы БД: по умолчанию включена в dev и выключена в проде
 * (там схему меняют миграциями). Флаг DB_SYNCHRONIZE переопределяет умолчание
 * в обе стороны.
 */
function resolveSynchronize(config: ConfigService): boolean {
  const explicit = config.get<string>('DB_SYNCHRONIZE');
  if (explicit !== undefined && explicit !== '') {
    return explicit === 'true';
  }
  return config.get<string>('NODE_ENV') !== 'production';
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        host: config.get<string>('PGHOST', 'localhost'),
        port: config.get<number>('PGPORT', 5432),
        username: config.get<string>('PGUSER', 'postgres'),
        password: config.get<string>('PGPASSWORD', 'postgres'),
        database: config.get<string>('PGDATABASE', 'auth'),
        autoLoadEntities: true,
        synchronize: resolveSynchronize(config),
      }),
    }),
    JwtModule.register({ global: true }),
    // Общий лимит на весь API. Точечные лимиты (вход, регистрация,
    // обновление токена) задаются декоратором @Throttle на маршрутах.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    // Пользователи не зависят от других feature-модулей.
    UserModule,
    SessionModule,
    AuthModule,
    ExternalModule,
  ],
  providers: [
    // ThrottlerGuard идёт первым: лимит проверяется до разбора JWT.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Глобальная авторизация — ответственность composition root, а не AuthModule.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: QueryFailedFilter },
  ],
})
export class AppModule {}
