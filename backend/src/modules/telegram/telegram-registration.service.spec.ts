import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { ValidationFailedException } from '../../common/filters/all-exceptions.filter.js';
import { parseEcDate } from '../../common/utils/ethiopian-calendar.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { MembersService } from '../members/members.service.js';
import type { SettingsService } from '../settings/settings.service.js';
import type { TelegramApi } from './telegram-api.js';
import { TelegramRegistrationService } from './telegram-registration.service.js';
import { TEXT } from './telegram.texts.js';

type Row = {
  id: number;
  chatId: bigint;
  telegramUserId: bigint;
  phone: string;
  language: string;
  step: string;
  answers: Record<string, unknown>;
  updatedAt: Date;
};

/** Just enough of Prisma for the registration conversation, kept in memory. */
class FakeDb {
  rows: Row[] = [];
  links: Record<string, unknown>[] = [];
  private nextId = 1;

  telegramRegistration = {
    findUnique: async ({ where }: { where: { chatId: bigint } }) =>
      this.rows.find((r) => r.chatId === where.chatId) ?? null,
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { chatId: bigint };
      create: Omit<Row, 'id' | 'updatedAt'>;
      update: Partial<Row>;
    }) => {
      const row = this.rows.find((r) => r.chatId === where.chatId);
      if (row) return Object.assign(row, update, { updatedAt: new Date() });
      const created = { ...create, id: this.nextId++, updatedAt: new Date() } as Row;
      this.rows.push(created);
      return created;
    },
    update: async ({ where, data }: { where: { id: number }; data: Partial<Row> }) =>
      Object.assign(
        this.rows.find((r) => r.id === where.id)!,
        data,
        { updatedAt: new Date() },
      ),
    // No awaits inside: the check-and-set is atomic, like the database's.
    updateMany: async ({
      where,
      data,
    }: {
      where: { id: number; step: string };
      data: Partial<Row>;
    }) => {
      const row = this.rows.find((r) => r.id === where.id && r.step === where.step);
      if (row) Object.assign(row, data);
      return { count: row ? 1 : 0 };
    },
    delete: async ({ where }: { where: { id: number } }) => {
      this.rows = this.rows.filter((r) => r.id !== where.id);
    },
    deleteMany: async ({
      where,
    }: {
      where: { id?: number; chatId?: bigint; updatedAt?: { lt: Date } };
    }) => {
      const before = this.rows.length;
      this.rows = this.rows.filter(
        (r) =>
          !(
            (where.id !== undefined && r.id === where.id) ||
            (where.chatId !== undefined && r.chatId === where.chatId) ||
            (where.updatedAt !== undefined && r.updatedAt < where.updatedAt.lt)
          ),
      );
      return { count: before - this.rows.length };
    },
  };

  telegramLink = {
    upsert: async ({ create }: { create: Record<string, unknown> }) => {
      this.links.push(create);
      return create;
    },
  };

  $transaction = async (ops: Promise<unknown>[]) => Promise.all(ops);
}

const CHAT = 555n;
const PHONE = '0911223344';
const t = TEXT.en.register;

describe('TelegramRegistrationService', () => {
  let db: FakeDb;
  let sent: string[];
  let open: boolean;
  const create = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  let service: TelegramRegistrationService;

  beforeAll(() => {
    // The failure cases log on purpose; keep the test output clean.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  beforeEach(() => {
    db = new FakeDb();
    sent = [];
    open = true;
    create.mockReset();
    create.mockResolvedValue({ id: 7, memberCode: 'FE-00007' });
    const api = {
      sendMessage: (_chat: bigint, text: string) => {
        sent.push(text);
        return Promise.resolve(null);
      },
    };
    const settings = { get: () => Promise.resolve(open) };
    service = new TelegramRegistrationService(
      api as unknown as TelegramApi,
      db as unknown as PrismaService,
      { create } as unknown as MembersService,
      settings as unknown as SettingsService,
    );
  });

  const say = async (text: string) => {
    const row = await db.telegramRegistration.findUnique({ where: { chatId: CHAT } });
    if (!row) throw new Error('no registration in progress');
    await service.onMessage(row as never, text);
  };
  const step = () => db.rows.find((r) => r.chatId === CHAT)?.step;
  const last = () => sent.at(-1) ?? '';

  /** Answers every question with valid input, ending at the confirmation summary. */
  const answerAll = async () => {
    await service.offer(CHAT, 42, PHONE, 'en');
    for (const answer of [
      t.start,
      'Abebe',
      'Kebede',
      'Tesfaye',
      t.skip,
      t.male,
      '15/01/2000',
      'Bole',
      t.skip,
      t.yes,
      'Asthma, carries an inhaler',
      t.agree,
    ]) {
      await say(answer);
    }
  };

  it('walks through every question and registers the member', async () => {
    await answerAll();
    expect(step()).toBe('confirm');
    expect(last()).toContain('Abebe Kebede Tesfaye');

    await say(t.confirm);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0]).toEqual({
      firstName: 'Abebe',
      fatherName: 'Kebede',
      grandfatherName: 'Tesfaye',
      christianName: null,
      gender: 'MALE',
      dateOfBirth: parseEcDate('15/01/2000'),
      phone: PHONE,
      subCity: 'Bole',
      woreda: null,
      hasHealthCondition: true,
      healthConditionNote: 'Asthma, carries an inhaler',
      agreementAccepted: true,
    });
    expect(create.mock.calls[0]?.[4]).toEqual({ selfRegistered: true });
    expect(db.rows).toHaveLength(0);
    expect(db.links).toEqual([
      expect.objectContaining({ chatId: CHAT, memberId: 7, phone: PHONE }),
    ]);
    expect(last()).toContain('FE-00007');
  });

  it('re-asks the same question when an answer is invalid', async () => {
    await service.offer(CHAT, 42, PHONE, 'en');
    await say(t.start);
    await say('Ab3be');
    expect(step()).toBe('firstName');
    expect(sent.at(-2)).toContain(t.invalid.name);

    for (const answer of ['Abebe', 'Kebede', 'Tesfaye', t.skip, t.female]) await say(answer);
    await say('31/13/2000');
    expect(step()).toBe('dateOfBirth');
    expect(sent.at(-2)).toContain('could not be read');
  });

  it('skips the health note when there is no condition', async () => {
    await service.offer(CHAT, 42, PHONE, 'en');
    for (const answer of [
      t.start,
      'Abebe',
      'Kebede',
      'Tesfaye',
      t.skip,
      t.male,
      '15/01/2000',
      t.skip,
      t.skip,
      t.no,
    ]) {
      await say(answer);
    }
    expect(step()).toBe('agreement');
    expect(last()).toContain('Discipline and Code of Conduct Agreement');
  });

  it('registers only once when Register is tapped twice', async () => {
    await answerAll();
    const row = db.rows[0]!;
    await Promise.all([
      service.onMessage({ ...row } as never, t.confirm),
      service.onMessage({ ...row } as never, t.confirm),
    ]);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('stops when the office closes self-registration part-way', async () => {
    await service.offer(CHAT, 42, PHONE, 'en');
    await say(t.start);
    open = false;
    await say('Abebe');
    expect(db.rows).toHaveLength(0);
    expect(last()).toBe(t.closed);
    expect(create).not.toHaveBeenCalled();
  });

  it('ends without registering when the agreement is not accepted', async () => {
    await service.offer(CHAT, 42, PHONE, 'en');
    for (const answer of [
      t.start,
      'Abebe',
      'Kebede',
      'Tesfaye',
      t.skip,
      t.male,
      '15/01/2000',
      t.skip,
      t.skip,
      t.no,
    ]) {
      await say(answer);
    }
    await say(t.cancel);
    expect(db.rows).toHaveLength(0);
    expect(last()).toBe(t.declined);
    expect(create).not.toHaveBeenCalled();
  });

  it('points to the office when the name is already registered', async () => {
    create.mockRejectedValueOnce(
      new ValidationFailedException([
        { field: 'firstName', messages: ['validation.duplicateName|{"code":"FE-00042"}'] },
      ]),
    );
    await answerAll();
    await say(t.confirm);
    expect(db.rows).toHaveLength(0);
    expect(last()).toContain('FE-00042');
    expect(db.links).toHaveLength(0);
  });

  it('lets the person try again when saving fails for another reason', async () => {
    create.mockRejectedValueOnce(new Error('database unavailable'));
    await answerAll();
    await say(t.confirm);
    expect(step()).toBe('confirm');
    expect(last()).toContain(t.failed);

    await say(t.confirm);
    expect(create).toHaveBeenCalledTimes(2);
    expect(db.rows).toHaveLength(0);
  });
});
