import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module.js';
import { CoursesModule } from '../courses/courses.module.js';
import { MembersModule } from '../members/members.module.js';
import { TelegramApi } from './telegram-api.js';
import { TelegramBotService } from './telegram-bot.service.js';
import { TelegramController } from './telegram.controller.js';

/** Members' self-service Telegram bot (read-only). Off unless TELEGRAM_BOT_TOKEN is set. */
@Module({
  imports: [MembersModule, AttendanceModule, CoursesModule],
  controllers: [TelegramController],
  providers: [TelegramApi, TelegramBotService],
})
export class TelegramModule {}
