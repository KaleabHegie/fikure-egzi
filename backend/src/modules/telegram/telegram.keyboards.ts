import type { ReplyMarkup } from './telegram-api.js';
import { type BotLang, TEXT } from './telegram.texts.js';

export function shareKeyboard(lang: BotLang): ReplyMarkup {
  return {
    keyboard: [[{ text: TEXT[lang].shareButton, request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

export function menu(lang: BotLang, memberCount: number): ReplyMarkup {
  const m = TEXT[lang].menu;
  return {
    keyboard: [
      [{ text: m.profile }, { text: m.attendance }],
      [{ text: m.courses }, { text: m.qr }],
      ...(memberCount > 1 ? [[{ text: m.switch }]] : []),
      [{ text: m.language }, { text: m.logout }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

/** A reply keyboard of plain buttons, one array per row. */
export function buttons(rows: string[][]): ReplyMarkup {
  return {
    keyboard: rows.map((row) => row.map((text) => ({ text }))),
    resize_keyboard: true,
    is_persistent: true,
  };
}
