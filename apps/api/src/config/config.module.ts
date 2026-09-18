import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule, ConfigService } from '@nestjs/config';
import { validateEnv, type Env } from './env.schema';

/**
 * Typed access to configuration. Inject `AppConfigService` instead of reading
 * `process.env` anywhere else in the codebase.
 */
export class AppConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }

  get isProduction(): boolean {
    return this.get('NODE_ENV') === 'production';
  }

  get isDevelopment(): boolean {
    return this.get('NODE_ENV') === 'development';
  }
}

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
  ],
  providers: [
    {
      provide: AppConfigService,
      useFactory: (config: ConfigService<Env, true>) => new AppConfigService(config),
      inject: [ConfigService],
    },
  ],
  exports: [AppConfigService],
})
export class AppConfigModule {}
