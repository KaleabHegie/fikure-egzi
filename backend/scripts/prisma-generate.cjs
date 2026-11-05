/**
 * Runs `prisma generate` from the package root, wherever npm invoked it from.
 * cPanel's nodevenv runs npm lifecycle scripts from the venv's lib directory,
 * where prisma.config.ts is not found; resolving from this file's location
 * makes the postinstall work there, locally and in CI alike.
 */
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

const root = resolve(__dirname, '..');
const result = spawnSync('npx', ['prisma', 'generate'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
