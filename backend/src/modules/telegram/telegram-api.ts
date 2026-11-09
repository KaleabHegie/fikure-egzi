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
  caption?: string;
  contact?: { phone_number: string; user_id?: number; first_name?: string };
  /** One picture in several sizes, smallest first. */
  photo?: { file_id: string; file_size?: number; width: number; height: number }[];
  /** A file sent "as a document" (e.g. an uncompressed image). */
  document?: { file_id: string; file_size?: number; mime_type?: string };
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

/** Methods that send a message to a chat; Telegram caps these at about 30 a second per bot. */
const SENDING = new Set(['sendMessage', 'sendPhoto']);
/** Spacing between sends: 25 a second, safely under Telegram's limit. */
const SEND_SPACING_MS = 40;
/** Waits Telegram asks for ("retry after") that are worth sitting out; longer ones give up. */
const MAX_RETRY_WAIT_S = 10;
const MAX_RETRIES = 2;

type TgResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number };
};

/** What sendPhoto returns: the photo in its stored sizes (largest last). */
export type TgSentPhoto = { photo?: { file_id: string }[] };

/**
 * A minimal Telegram Bot API client (plain fetch, no library). Every call
 * fails soft: errors are logged, never thrown into the request that caused
 * them. Sends are paced to stay under Telegram's per-bot rate, and a
 * "too many requests" answer is waited out and retried rather than dropped.
 */
@Injectable()
export class TelegramApi {
  private readonly logger = new Logger('TelegramApi');
  /** When the next send may go out (shared by every chat this process serves). */
  private nextSendAt = 0;
  /** Telegram file ids of fixed pictures already uploaded once (e.g. the seal). */
  private readonly photoIds = new Map<string, string>();

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
    for (let attempt = 0; ; attempt++) {
      if (SENDING.has(method)) await this.paceSend();
      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
          method: 'POST',
          ...(body instanceof FormData
            ? { body }
            : {
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body ?? {}),
              }),
          signal: AbortSignal.timeout(method === 'getUpdates' ? 40_000 : 15_000),
        });
        const json = (await res.json()) as TgResponse<T>;
        if (json.ok) return json.result ?? null;
        const wait = json.parameters?.retry_after;
        if (
          (json.error_code === 429 || res.status === 429) &&
          wait !== undefined &&
          wait <= MAX_RETRY_WAIT_S &&
          attempt < MAX_RETRIES
        ) {
          this.logger.warn(`${method} throttled by Telegram; retrying in ${wait}s`);
          await this.sleep(wait * 1000);
          continue;
        }
        this.logger.warn(`${method} failed: ${json.description ?? res.status}`);
        return null;
      } catch (error) {
        this.logger.warn(`${method} failed: ${(error as Error).message}`);
        return null;
      }
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
    mime = 'image/png',
  ) {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('photo', new Blob([new Uint8Array(photo)], { type: mime }), filename);
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');
    if (replyMarkup) form.append('reply_markup', JSON.stringify(replyMarkup));
    return this.call<TgSentPhoto>('sendPhoto', form);
  }

  /**
   * Sends a fixed picture (e.g. the school seal) by uploading it the first
   * time and reusing Telegram's copy afterwards. Null when it could not be
   * sent (or `load` has no picture), so the caller can fall back to text.
   */
  async sendFixedPhoto(
    key: string,
    chatId: number | bigint,
    load: () => Promise<{ data: Buffer; name: string; mime: string } | null>,
    caption: string,
    replyMarkup?: ReplyMarkup,
  ): Promise<TgSentPhoto | null> {
    const fileId = this.photoIds.get(key);
    if (fileId) {
      const sent = await this.call<TgSentPhoto>('sendPhoto', {
        chat_id: String(chatId),
        photo: fileId,
        caption,
        parse_mode: 'HTML',
        ...(replyMarkup && { reply_markup: replyMarkup }),
      });
      if (sent) return sent;
      // Telegram no longer knows that copy: upload it again below.
      this.photoIds.delete(key);
    }
    const file = await load();
    if (!file) return null;
    const sent = await this.sendPhoto(
      chatId,
      file.data,
      file.name,
      caption,
      replyMarkup,
      file.mime,
    );
    const uploaded = sent?.photo?.at(-1)?.file_id;
    if (uploaded) this.photoIds.set(key, uploaded);
    return sent;
  }

  /** Waits for this send's turn, so the bot never bursts past Telegram's rate. */
  private async paceSend() {
    const now = Date.now();
    const at = Math.max(now, this.nextSendAt);
    this.nextSendAt = at + SEND_SPACING_MS;
    if (at > now) await this.sleep(at - now);
  }

  protected sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  /** Downloads a file a user sent (photos, documents). Null when it cannot be fetched. */
  async downloadFile(fileId: string): Promise<Buffer | null> {
    const token = this.config.telegram.token;
    const file = await this.call<{ file_path?: string }>('getFile', { file_id: fileId });
    if (!token || !file?.file_path) return null;
    try {
      const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        this.logger.warn(`file download failed: ${res.status}`);
        return null;
      }
      return Buffer.from(await res.arrayBuffer());
    } catch (error) {
      this.logger.warn(`file download failed: ${(error as Error).message}`);
      return null;
    }
  }

  answerCallback(id: string) {
    return this.call('answerCallbackQuery', { callback_query_id: id });
  }
}
