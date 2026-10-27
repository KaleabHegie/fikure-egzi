-- DEV ONLY: `prisma migrate dev` creates a temporary shadow database to diff
-- migrations, so the app user needs CREATE/DROP outside its own schema.
-- Never apply this to production; there, run `prisma migrate deploy` (no shadow DB).
GRANT ALL PRIVILEGES ON *.* TO 'fikure'@'%';
FLUSH PRIVILEGES;
