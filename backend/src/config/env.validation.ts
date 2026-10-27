import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

const toBoolean = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.toLowerCase() === 'true' : value;

/**
 * Every environment variable the API reads. The app refuses to boot if any
 * required value is missing or malformed, so misconfiguration fails fast
 * instead of surfacing as a runtime error in production.
 */
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 4100;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'API_PREFIX must be a bare path segment, e.g. "api"',
  })
  API_PREFIX = 'api';

  /** Comma-separated list of allowed browser origins. */
  @IsString()
  CORS_ORIGINS = 'http://localhost:5180';

  @Transform(toBoolean)
  @IsBoolean()
  SWAGGER_ENABLED = true;

  @IsString()
  @Matches(/^mysql:\/\//, {
    message: 'DATABASE_URL must be a mysql:// connection string',
  })
  DATABASE_URL: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  DATABASE_POOL_SIZE = 10;

  @IsString()
  @MinLength(32, {
    message: 'JWT_ACCESS_SECRET must be at least 32 characters',
  })
  JWT_ACCESS_SECRET: string;

  @IsString()
  @Matches(/^\d+[smhd]$/, {
    message: 'JWT_ACCESS_EXPIRES_IN must look like 900s, 15m, 1h or 1d',
  })
  JWT_ACCESS_EXPIRES_IN = '15m';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  REFRESH_TOKEN_TTL_DAYS = 7;

  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(15)
  BCRYPT_ROUNDS = 12;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  THROTTLE_TTL_SECONDS = 60;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  THROTTLE_LIMIT = 120;

  /** Where uploaded files (member photos, …) are stored. Relative paths resolve from the app root. */
  @IsString()
  @IsNotEmpty()
  UPLOAD_DIR = 'uploads';

  @IsOptional()
  @IsEmail()
  SEED_ADMIN_EMAIL?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  SEED_ADMIN_PASSWORD?: string;

  @IsOptional()
  @IsString()
  SEED_ADMIN_NAME?: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    exposeDefaultValues: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const details = errors
      .map((e) => `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return validated;
}
