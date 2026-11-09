import { jest } from '@jest/globals';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import { SettingsService } from './settings.service.js';

describe('SettingsService', () => {
  const findMany = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const upsert = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const prisma = {
    appSetting: { findMany, upsert },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn({ appSetting: { upsert } }),
  };
  const audit = { record: jest.fn<(...args: unknown[]) => Promise<unknown>>() };
  let service: SettingsService;

  beforeEach(() => {
    findMany.mockReset();
    service = new SettingsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });

  it('reuses a recent read instead of querying on every bot message', async () => {
    findMany.mockResolvedValue([{ key: 'selfRegistration', value: true }]);
    await expect(service.get('selfRegistration')).resolves.toBe(true);
    await expect(service.get('selfRegistration')).resolves.toBe(true);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('sees a change made here straight away', async () => {
    findMany.mockResolvedValueOnce([{ key: 'selfRegistration', value: true }]);
    await service.get('selfRegistration');
    findMany.mockResolvedValueOnce([{ key: 'selfRegistration', value: false }]);
    await service.update({ selfRegistration: false }, 1, null);
    await expect(service.get('selfRegistration')).resolves.toBe(false);
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('defaults to closed when nothing is stored', async () => {
    findMany.mockResolvedValue([]);
    await expect(service.get('selfRegistration')).resolves.toBe(false);
  });
});
