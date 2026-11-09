import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { UpdateSettingsDto } from './settings.dto.js';

/** Office-wide switches. Every key has a default, so a missing row is never an error. */
export interface AppSettings {
  /** New people may register themselves through the Telegram bot. */
  selfRegistration: boolean;
}

const DEFAULTS: AppSettings = {
  selfRegistration: false,
};

const KEYS = Object.keys(DEFAULTS) as (keyof AppSettings)[];

/**
 * How long a read is reused. The bot checks the switch on every message, so
 * this saves a query per answer; a change made in another server process is
 * seen within this time (in this process, at once).
 */
const CACHE_MS = 5_000;

@Injectable()
export class SettingsService {
  private cache: { at: number; settings: AppSettings } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The settings as stored now (what the Settings page shows). */
  async all(): Promise<AppSettings> {
    const rows = await this.prisma.appSetting.findMany({ where: { key: { in: KEYS } } });
    const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const settings = Object.fromEntries(
      KEYS.map((key) => [
        key,
        typeof stored[key] === typeof DEFAULTS[key] ? stored[key] : DEFAULTS[key],
      ]),
    ) as unknown as AppSettings;
    this.cache = { at: Date.now(), settings };
    return settings;
  }

  /** One setting, reusing a read from the last few seconds (for hot paths like the bot). */
  async get<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.settings[key];
    return (await this.all())[key];
  }

  async update(
    dto: UpdateSettingsDto,
    userId: number,
    ipAddress: string | null,
  ): Promise<AppSettings> {
    const changes = KEYS.filter((key) => dto[key] !== undefined).map(
      (key) => [key, dto[key]!] as const,
    );
    if (changes.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        for (const [key, value] of changes) {
          await tx.appSetting.upsert({
            where: { key },
            create: { key, value, updatedById: userId },
            update: { value, updatedById: userId },
          });
        }
        await this.audit.record(
          {
            userId,
            action: 'UPDATE',
            entity: 'Settings',
            changes: Object.fromEntries(changes),
            ipAddress,
          },
          tx,
        );
      });
    }
    // Re-reads, which also refreshes this process's cache.
    return this.all();
  }
}
