import type { PoolConfig } from 'mariadb';

/**
 * Converts the Prisma-style `mysql://user:pass@host:port/db` URL (which the
 * Prisma CLI needs for migrations) into a pool config for the runtime driver,
 * so one DATABASE_URL drives both.
 */
export function buildMariaDbPoolConfig(databaseUrl: string, connectionLimit: number): PoolConfig {
  const url = new URL(databaseUrl);
  const database = url.pathname.replace(/^\//, '');
  if (!database) {
    throw new Error('DATABASE_URL must include a database name');
  }
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    connectionLimit,
    // Store and read DATETIME values as UTC regardless of server timezone.
    timezone: 'Z',
  };
}
