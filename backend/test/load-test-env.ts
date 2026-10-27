import { config } from 'dotenv';

// e2e tests run against a dedicated database (see .env.test), never the dev one.
config({ path: '.env.test', override: true, quiet: true });

if (!process.env.DATABASE_URL?.includes('_test')) {
  throw new Error(
    'Refusing to run e2e tests: DATABASE_URL in .env.test must point at a *_test database',
  );
}
