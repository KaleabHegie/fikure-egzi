/**
 * Points the Telegram bot at this API and applies its branding (name,
 * description, command menu in Amharic and English). Idempotent; the deploy
 * runs it after every release. Needs TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET
 * and API_PUBLIC_URL; does nothing without a token.
 *
 *   node dist/scripts/telegram-setup.js      (production build)
 *   npm run telegram:setup                    (dev, via tsx)
 */
import 'dotenv/config';
import { BOT_PROFILE, COMMANDS } from '../modules/telegram/telegram.texts.js';

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const publicUrl = process.env.API_PUBLIC_URL;
const prefix = process.env.API_PREFIX ?? 'api';

async function call(method: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; description?: string };
  // Name/description changes are rate-limited by Telegram; they are cosmetic, so warn and go on.
  if (!json.ok) console.warn(`  ! ${method}: ${json.description ?? res.status}`);
  else console.log(`  ✓ ${method}`);
  return json.ok;
}

async function main() {
  if (!token) {
    console.log('TELEGRAM_BOT_TOKEN not set — Telegram bot is off, nothing to set up.');
    return;
  }
  if (!secret || !publicUrl) {
    throw new Error(
      'Set TELEGRAM_WEBHOOK_SECRET and API_PUBLIC_URL to receive updates by webhook.',
    );
  }
  console.log('Setting up the Telegram bot');
  const ok = await call('setWebhook', {
    url: `${publicUrl}/${prefix}/v1/telegram/webhook`,
    secret_token: secret,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: false,
  });
  if (!ok) throw new Error('setWebhook failed');
  // Amharic is the default; English for Telegram apps set to English.
  for (const [lang, code] of [
    ['am', undefined],
    ['en', 'en'],
  ] as const) {
    const scope = code ? { language_code: code } : {};
    await call('setMyCommands', { commands: COMMANDS[lang], ...scope });
    await call('setMyName', { name: BOT_PROFILE[lang].name, ...scope });
    await call('setMyDescription', { description: BOT_PROFILE[lang].description, ...scope });
    await call('setMyShortDescription', { short_description: BOT_PROFILE[lang].short, ...scope });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
