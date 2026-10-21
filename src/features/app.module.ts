import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from './user/user.module.js';
import { SessionModule } from './session/session.module.js';
import { ExternalModule } from './external/external.module.js';
import { ProviderModule } from './provider/provider.module.js';
import { AuthModule } from './auth/auth.module.js';

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
        synchronize: true,
      }),
    }),
    JwtModule.register({ global: true }),
    AuthModule,
    SessionModule,
    ExternalModule,
    ProviderModule,
    UserModule,
  ],
})
export class AppModule {}
