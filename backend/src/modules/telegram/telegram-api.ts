import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service.js';

/** The parts of a Telegram update the bot uses. */
export interface TgUser {
  id: number;
  first_name?: string;
  language_code?: string;
}

export interface TgMessage {
  message_id: number;
  chat: { id: number; type: string };
  from?: TgUser;
  text?: string;
  contact?: { phone_number: string; user_id?: number; first_name?: string };
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: { id: string; from: TgUser; message?: TgMessage; data?: string };
}

export type ReplyMarkup =
  | {
      keyboard: { text: string; request_contact?: boolean }[][];
      resize_keyboard?: boolean;
      is_persistent?: boolean;
      one_time_keyboard?: boolean;
    }
  | { inline_keyboard: { text: string; callback_data: string }[][] }
  | { remove_keyboard: true };

/**
 * A minimal Telegram Bot API client (plain fetch, no library). Every call
 * fails soft: errors are logged, never thrown into the request that caused them.
 */
@Injectable()
export class TelegramApi {
  private readonly logger = new Logger('TelegramApi');

  constructor(private readonly config: AppConfigService) {}

  get enabled(): boolean {
    return Boolean(this.config.telegram.token);
  }

  async call<T = unknown>(
    method: string,
    body?: Record<string, unknown> | FormData,
  ): Promise<T | null> {
    const token = this.config.telegram.token;
    if (!token) return null;
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        ...(body instanceof FormData
          ? { body }
          : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) }),
        signal: AbortSignal.timeout(method === 'getUpdates' ? 40_000 : 15_000),
      });
      const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
      if (!json.ok) {
        this.logger.warn(`${method} failed: ${json.description ?? res.status}`);
        return null;
      }
      return json.result ?? null;
    } catch (error) {
      this.logger.warn(`${method} failed: ${(error as Error).message}`);
      return null;
    }
  }

  sendMessage(chatId: number | bigint, text: string, replyMarkup?: ReplyMarkup) {
    return this.call('sendMessage', {
      chat_id: String(chatId),
      text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...(replyMarkup && { reply_markup: replyMarkup }),
    });
  }

  sendPhoto(
    chatId: number | bigint,
    photo: Buffer,
    filename: string,
    caption: string,
    replyMarkup?: ReplyMarkup,
  ) {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('photo', new Blob([new Uint8Array(photo)], { type: 'image/png' }), filename);
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');
    if (replyMarkup) form.append('reply_markup', JSON.stringify(replyMarkup));
    return this.call('sendPhoto', form);
  }

  answerCallback(id: string) {
    return this.call('answerCallbackQuery', { callback_query_id: id });
  }
}
