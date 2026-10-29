import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolve } from 'node:path';
import { parseDurationToSeconds } from '../common/utils/duration.js';
import { EnvironmentVariables, NodeEnv } from './env.validation.js';

/**
 * Typed, read-only access to configuration. Inject this instead of
 * ConfigService so call sites never deal with string keys or `undefined`.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {}

  private get<K extends keyof EnvironmentVariables>(key: K): EnvironmentVariables[K] {
    return this.config.get(key, { infer: true });
  }

  get isProduction(): boolean {
    return this.get('NODE_ENV') === NodeEnv.Production;
  }

  get port(): number {
    return this.get('PORT');
  }

  get apiPrefix(): string {
    return this.get('API_PREFIX');
  }

  get corsOrigins(): string[] {
    return this.get('CORS_ORIGINS')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  }

  get swaggerEnabled(): boolean {
    return this.get('SWAGGER_ENABLED');
  }

  get database() {
    return {
      url: this.get('DATABASE_URL'),
      poolSize: this.get('DATABASE_POOL_SIZE'),
    };
  }

  get auth() {
    return {
      accessSecret: this.get('JWT_ACCESS_SECRET'),
      accessTtlSeconds: parseDurationToSeconds(this.get('JWT_ACCESS_EXPIRES_IN')),
      refreshTtlDays: this.get('REFRESH_TOKEN_TTL_DAYS'),
      bcryptRounds: this.get('BCRYPT_ROUNDS'),
    };
  }

  /** Absolute path of the upload root. */
  get uploadDir(): string {
    return resolve(this.get('UPLOAD_DIR'));
  }

  get telegram() {
    return {
      token: this.get('TELEGRAM_BOT_TOKEN') ?? null,
      webhookSecret: this.get('TELEGRAM_WEBHOOK_SECRET') ?? null,
      polling: this.get('TELEGRAM_POLLING'),
      publicUrl: this.get('API_PUBLIC_URL') ?? null,
    };
  }

  get throttle() {
    return {
      ttlMs: this.get('THROTTLE_TTL_SECONDS') * 1000,
      limit: this.get('THROTTLE_LIMIT'),
    };
  }
}
