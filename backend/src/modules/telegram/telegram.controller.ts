import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { timingSafeEqual } from 'node:crypto';
import { Public } from '../../common/decorators/public.decorator.js';
import { SkipRateLimit } from '../../common/rate-limit/rate-limit.decorator.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { TgUpdate } from './telegram-api.js';
import { TelegramBotService } from './telegram-bot.service.js';

const same = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Telegram delivers bot updates here (set by `npm run telegram:setup`). Only
 * requests carrying the webhook secret are accepted; the rest look like 404.
 */
@ApiExcludeController()
@Controller({ path: 'telegram', version: '1' })
export class TelegramController {
  constructor(
    private readonly bot: TelegramBotService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  // Telegram's servers send every chat's updates from few IPs.
  @SkipRateLimit()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Body() update: TgUpdate,
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
  ) {
    const { token, webhookSecret } = this.config.telegram;
    if (!token || !webhookSecret || !secret || !same(secret, webhookSecret)) {
      throw new NotFoundException();
    }
    await this.bot.handle(update);
    return { ok: true };
  }
}
