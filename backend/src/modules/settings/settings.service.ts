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

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async all(): Promise<AppSettings> {
    const rows = await this.prisma.appSetting.findMany({ where: { key: { in: KEYS } } });
    const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return Object.fromEntries(
      KEYS.map((key) => [
        key,
        typeof stored[key] === typeof DEFAULTS[key] ? stored[key] : DEFAULTS[key],
      ]),
    ) as unknown as AppSettings;
  }

  async get<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
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
    return this.all();
  }
}
