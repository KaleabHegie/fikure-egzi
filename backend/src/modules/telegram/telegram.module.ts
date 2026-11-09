import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module.js';
import { CoursesModule } from '../courses/courses.module.js';
import { MembersModule } from '../members/members.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { TelegramApi } from './telegram-api.js';
import { TelegramBotService } from './telegram-bot.service.js';
import { TelegramRegistrationService } from './telegram-registration.service.js';
import { TelegramController } from './telegram.controller.js';

/**
 * Members' self-service Telegram bot: read-only for members, plus
 * self-registration for newcomers while Settings has it switched on.
 * Off unless TELEGRAM_BOT_TOKEN is set.
 */
@Module({
  imports: [MembersModule, AttendanceModule, CoursesModule, SettingsModule],
  controllers: [TelegramController],
  providers: [TelegramApi, TelegramBotService, TelegramRegistrationService],
})
export class TelegramModule {}
