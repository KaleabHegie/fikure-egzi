import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { ValidationFailedException } from '../../common/filters/all-exceptions.filter.js';
import { parseEcDate } from '../../common/utils/ethiopian-calendar.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { MembersService } from '../members/members.service.js';
import type { SettingsService } from '../settings/settings.service.js';
import type { TelegramApi, TgMessage } from './telegram-api.js';
import { splitRules, TelegramRegistrationService } from './telegram-registration.service.js';
import { REG_TEXT } from './telegram-registration.texts.js';

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

  classes = [
    {
      id: 1,
      nameAm: 'የመዝሙር ክፍል',
      nameEn: 'Mezmur class',
      grades: [
        { id: 11, nameAm: 'ግዕዝ', nameEn: 'Geez' },
        { id: 12, nameAm: 'ዕዝል', nameEn: 'Ezel' },
      ],
      agreement: {
        id: 5,
        titleAm: 'የዲሲፕሊን እና የሥነ-ምግባር ስምምነት',
        titleEn: 'Discipline and Code of Conduct Agreement',
        rulesAm: 'የክፍሉን ሥርዓትና ደንብ ማክበር።\nበአገልግሎት ወቅት ተገቢ አለባበስ።',
        rulesEn: 'Respect the order of the class.\nDress appropriately during service.',
        pledgeAm: 'ተስማምቻለሁ።',
        pledgeEn: 'I agree to follow them.',
      } as Record<string, unknown> | null,
    },
    {
      id: 2,
      nameAm: 'የኮርስ ክፍል',
      nameEn: 'Course class',
      grades: [
        { id: 21, nameAm: '1ኛ ክፍል', nameEn: 'Grade 1' },
        { id: 22, nameAm: '2ኛ ክፍል', nameEn: 'Grade 2' },
      ],
      agreement: null as Record<string, unknown> | null,
    },
  ];

  classType = { findMany: async () => this.classes };

  departments = [
    { id: 1, parentId: null, nameAm: 'ፅህፈት ቤት', nameEn: 'Office' },
    { id: 2, parentId: 1, nameAm: 'ትምህርት ክፍል', nameEn: 'Teaching' },
    { id: 3, parentId: 1, nameAm: 'መዝሙር ክፍል', nameEn: 'Choir' },
    { id: 4, parentId: 2, nameAm: 'የሕፃናት ትምህርት', nameEn: 'Children teaching' },
  ];
  department = { findMany: async () => this.departments };

  memberships: Record<string, unknown>[] = [];
  departmentMembership = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      this.memberships.push(data);
      return data;
    },
  };
  periods: Record<string, unknown>[] = [];
  departmentServiceHistory = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      this.periods.push(data);
      return data;
    },
  };

  telegramLink = {
    upsert: async ({ create }: { create: Record<string, unknown> }) => {
      this.links.push(create);
      return create;
    },
  };

  /** Callback form runs against this same store (no rollback is needed by these tests). */
  $transaction = async (arg: Promise<unknown>[] | ((tx: FakeDb) => Promise<unknown>)) =>
    typeof arg === 'function' ? arg(this) : Promise.all(arg);
}

const CHAT = 555n;
const PHONE = '0911223344';
const t = REG_TEXT.en;
const PHOTO: Partial<TgMessage> = {
  photo: [
    { file_id: 'small', file_size: 20_000, width: 320, height: 320 },
    { file_id: 'large', file_size: 180_000, width: 1280, height: 1280 },
  ],
};

/** Valid answers to every question, in order (a string is typed; an object is sent as-is). */
const FULL: (string | Partial<TgMessage>)[] = [
  t.start,
  'Abebe',
  'Kebede',
  'Tesfaye',
  t.skip, // Christian name
  t.male,
  '15/01/2000',
  'Debre Berhan',
  t.maritalStatus.SINGLE!,
  'Aba Gebre Mariam',
  'Geez', // Mezmur class
  t.skip, // Course class: not placed
  '▫️ Teaching', // departments: pick two, then done
  '▫️ Choir',
  t.departmentsDone,
  '+251 922 33 44 55',
  'Abebe@Example.com',
  t.addisAbaba,
  'Bole',
  '03',
  t.skip, // kebele
  '1234',
  t.education.BACHELORS!,
  'Teacher',
  'Almaz Bekele',
  'Mother',
  '0911556677',
  PHOTO,
  t.agree,
];
/** Index in FULL of the answer to each question used below. */
const AT = { occupation: 23, photo: 27, agreement: 28 };

describe('TelegramRegistrationService', () => {
  let db: FakeDb;
  let sent: string[];
  let open: boolean;
  const create = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const setPhoto = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const downloadFile = jest.fn<(fileId: string) => Promise<Buffer | null>>();
  let service: TelegramRegistrationService;

  beforeAll(() => {
    // The failure cases log on purpose; keep the test output clean.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  beforeEach(() => {
    db = new FakeDb();
    sent = [];
    open = true;
    create.mockReset().mockResolvedValue({ id: 7, memberCode: 'FE-00007' });
    setPhoto.mockReset().mockResolvedValue({});
    downloadFile.mockReset().mockResolvedValue(Buffer.from('jpeg-bytes'));
    const record = (text: string) => {
      sent.push(text);
      return Promise.resolve(null);
    };
    const api = {
      sendMessage: (_chat: bigint, text: string) => record(text),
      sendFixedPhoto: (_key: string, _chat: bigint, _load: unknown, caption: string) =>
        record(caption),
      downloadFile,
    };
    const settings = { get: () => Promise.resolve(open) };
    service = new TelegramRegistrationService(
      api as unknown as TelegramApi,
      db as unknown as PrismaService,
      { create, setPhoto } as unknown as MembersService,
      settings as unknown as SettingsService,
    );
  });

  const say = async (answer: string | Partial<TgMessage>) => {
    const row = await db.telegramRegistration.findUnique({ where: { chatId: CHAT } });
    if (!row) throw new Error('no registration in progress');
    const message = typeof answer === 'string' ? { text: answer } : answer;
    await service.onMessage(row as never, {
      message_id: 1,
      chat: { id: 555, type: 'private' },
      ...message,
    });
  };
  const sayAll = async (answers: (string | Partial<TgMessage>)[]) => {
    for (const answer of answers) await say(answer);
  };
  const step = () => db.rows.find((r) => r.chatId === CHAT)?.step;
  const last = () => sent.at(-1) ?? '';
  const start = () => service.offer(CHAT, 42, PHONE, 'en');

  it('asks every member-form question, classes included, and registers the member', async () => {
    await start();
    expect(last()).toContain('<b>25</b> short questions');
    await sayAll(FULL);
    expect(step()).toBe('confirm');
    expect(sent.some((m) => m.includes('26 / 26'))).toBe(true);
    expect(last()).toContain('Abebe Kebede Tesfaye');
    expect(last()).toContain('Mezmur class: <b>Geez</b>');
    expect(last()).toContain('Course class: <b>Not placed</b>');
    expect(last()).toContain(`${t.agreementFor('Mezmur class')}: <b>✅ Accepted</b>`);
    expect(last()).toContain('▸ <b>Teaching</b>\n▸ <b>Choir</b>');

    await say(t.confirm);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0]).toEqual({
      firstName: 'Abebe',
      fatherName: 'Kebede',
      grandfatherName: 'Tesfaye',
      christianName: null,
      gender: 'MALE',
      dateOfBirth: parseEcDate('15/01/2000'),
      placeOfBirth: 'Debre Berhan',
      maritalStatus: 'SINGLE',
      spiritualFatherName: 'Aba Gebre Mariam',
      phone: PHONE,
      alternatePhone: '0922334455',
      email: 'abebe@example.com',
      city: 'Addis Ababa',
      subCity: 'Bole',
      woreda: '03',
      kebele: null,
      houseNumber: '1234',
      educationLevel: 'BACHELORS',
      occupation: 'Teacher',
      emergencyContactName: 'Almaz Bekele',
      emergencyContactRelation: 'Mother',
      emergencyContactPhone: '0911556677',
      agreementIds: [5],
      classGradeIds: [11],
    });
    expect(create.mock.calls[0]?.[4]).toEqual({ selfRegistered: true });
    // Created inside the same transaction as the roster places and the chat link.
    expect(create.mock.calls[0]?.[3]).toBe(db);
    expect(db.memberships).toEqual([
      expect.objectContaining({ departmentId: 2, memberId: 7, role: 'MEMBER' }),
      expect.objectContaining({ departmentId: 3, memberId: 7, role: 'MEMBER' }),
    ]);
    expect(db.periods).toHaveLength(2);
    // The largest size that fits the photo limit is the one downloaded and stored.
    expect(downloadFile).toHaveBeenCalledWith('large');
    expect(setPhoto.mock.calls[0]?.[0]).toBe(7);
    expect(db.rows).toHaveLength(0);
    expect(db.links).toEqual([
      expect.objectContaining({ chatId: CHAT, memberId: 7, phone: PHONE }),
    ]);
    expect(last()).toContain('FE-00007');
  });

  it('shows each question under its section with a progress bar', async () => {
    await start();
    await say(t.start);
    expect(last()).toContain(t.sections.personal);
    expect(last()).toContain('▰▱▱▱▱▱▱▱▱▱');
    expect(last()).toContain('1 / 25');
    expect(last()).toContain(`<b>${t.ask.firstName.q}</b>`);

    await sayAll(FULL.slice(1, 10));
    expect(step()).toBe('class:1');
    expect(last()).toContain(t.sections.classes);
    expect(last()).toContain('Mezmur class');
  });

  it('lets the person pick several main departments and change their mind', async () => {
    await start();
    await sayAll(FULL.slice(0, 12));
    expect(step()).toBe('departments');
    expect(last()).toContain(t.sections.service);
    // Only main departments: not the office above them, not sub-departments below.
    expect(last()).not.toContain('Office');
    expect(last()).not.toContain('Children teaching');
    expect(last()).toContain(t.departmentsNone);

    await say('▫️ Teaching');
    await say('▫️ Choir');
    expect(step()).toBe('departments');
    expect(last()).toContain(t.departmentsChosen('Teaching፣ Choir'));
    await say('✅ Teaching'); // tapping a chosen one removes it
    expect(last()).toContain(t.departmentsChosen('Choir'));
    await say('▫️ Children teaching'); // a sub-department is not offered
    expect(sent.at(-2)).toContain(t.invalid.choose);
    await say(t.departmentsDone);
    expect(step()).toBe('alternatePhone');
    expect(db.rows[0]?.answers).toMatchObject({ departmentIds: [3] });
  });

  it('only accepts a grade of the class being asked about', async () => {
    await start();
    await sayAll(FULL.slice(0, 10));
    await say('Grade 1'); // a Course grade, not a Mezmur one
    expect(step()).toBe('class:1');
    expect(sent.at(-2)).toContain(t.invalid.choose);
  });

  it('re-asks the same question when an answer is invalid', async () => {
    await start();
    await sayAll([t.start, 'Ab3be']);
    expect(step()).toBe('firstName');
    expect(sent.at(-2)).toContain(t.invalid.name);

    await sayAll(['Abebe', 'Kebede', 'Tesfaye', t.skip, t.female, '31/13/2000']);
    expect(step()).toBe('dateOfBirth');
    expect(sent.at(-2)).toContain('could not be read');

    await sayAll(['15/01/2000', t.skip, t.skip, t.skip, t.skip, t.skip, t.skip, '12345']);
    expect(step()).toBe('alternatePhone');
    expect(sent.at(-2)).toContain(t.invalid.phone);

    await sayAll([t.skip, 'not-an-email']);
    expect(step()).toBe('email');
    expect(sent.at(-2)).toContain(t.invalid.email);
  });

  it('skips follow-up questions whose lead answer was "none"', async () => {
    await start();
    await sayAll([...FULL.slice(0, AT.occupation + 1), t.skip]);
    expect(step()).toBe('photo');
  });

  it('asks nothing about health', async () => {
    await start();
    await sayAll(FULL.slice(0, AT.photo));
    expect(step()).toBe('photo');
    expect(sent.join('\n')).not.toContain(t.ask.health.q);
  });

  it('goes back to the previous question that was asked, showing the earlier answer', async () => {
    await start();
    await sayAll([...FULL.slice(0, AT.occupation + 1), t.skip]);
    expect(step()).toBe('photo');
    await say(t.back);
    expect(step()).toBe('emergencyContactName');
    await say(t.back);
    expect(step()).toBe('occupation');
    expect(last()).toContain(t.current('Teacher'));
  });

  it('turns away a photo that is too large and lets the person skip the photo', async () => {
    await start();
    await sayAll(FULL.slice(0, AT.photo));
    expect(step()).toBe('photo');
    await say({ photo: [{ file_id: 'huge', file_size: 5_000_000, width: 4000, height: 4000 }] });
    expect(step()).toBe('photo');
    expect(sent.at(-2)).toContain(t.invalid.photoTooLarge);
    await say(t.skip);
    expect(step()).toBe('agreement:1');
  });

  it('still registers the member when the photo cannot be downloaded', async () => {
    downloadFile.mockResolvedValueOnce(null);
    await start();
    await sayAll(FULL);
    await say(t.confirm);
    expect(create).toHaveBeenCalledTimes(1);
    expect(setPhoto).not.toHaveBeenCalled();
    expect(last()).toContain('FE-00007');
    expect(last()).toContain(t.photoFailed);
  });

  it('registers only once when Register is tapped twice', async () => {
    await start();
    await sayAll(FULL);
    const row = db.rows[0]!;
    const message = { message_id: 1, chat: { id: 555, type: 'private' }, text: t.confirm };
    await Promise.all([
      service.onMessage({ ...row } as never, message),
      service.onMessage({ ...row } as never, message),
    ]);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('stops when the office closes self-registration part-way', async () => {
    await start();
    await say(t.start);
    open = false;
    await say('Abebe');
    expect(db.rows).toHaveLength(0);
    expect(last()).toBe(t.closed);
    expect(create).not.toHaveBeenCalled();
  });

  it("asks the Mezmur class's agreement, naming the class, with its own rules", async () => {
    await start();
    await sayAll(FULL.slice(0, AT.agreement));
    expect(step()).toBe('agreement:1');
    expect(last()).toContain(t.agreementFor('Mezmur class'));
    expect(last()).toContain('1. Respect the order of the class.\n2. Dress appropriately');
    expect(last()).toContain('26 / 26');
  });

  it('carries on without the class when its agreement is not accepted', async () => {
    await start();
    await sayAll(FULL.slice(0, AT.agreement));
    await say(t.skipClass('Mezmur class'));
    expect(step()).toBe('confirm');
    expect(last()).toContain('Mezmur class: <b>Not placed</b>');
    expect(last()).not.toContain(t.agreementFor('Mezmur class'));
    await say(t.confirm);
    expect(create.mock.calls[0]?.[0]).toMatchObject({ classGradeIds: [], agreementIds: [] });
  });

  it('does not ask an agreement of someone not placed in that class', async () => {
    await start();
    await sayAll([...FULL.slice(0, 10), t.skip, ...FULL.slice(11, AT.agreement)]);
    expect(step()).toBe('confirm');
    await say(t.confirm);
    expect(create.mock.calls[0]?.[0]).toMatchObject({ classGradeIds: [], agreementIds: [] });
  });

  it('points to the office when the name is already registered', async () => {
    create.mockRejectedValueOnce(
      new ValidationFailedException([
        { field: 'firstName', messages: ['validation.duplicateName|{"code":"FE-00042"}'] },
      ]),
    );
    await start();
    await sayAll(FULL);
    await say(t.confirm);
    expect(db.rows).toHaveLength(0);
    expect(last()).toContain('FE-00042');
    expect(db.links).toHaveLength(0);
  });

  it('lets the person try again when saving fails for another reason', async () => {
    create.mockRejectedValueOnce(new Error('database unavailable'));
    await start();
    await sayAll(FULL);
    await say(t.confirm);
    expect(step()).toBe('confirm');
    expect(last()).toContain(t.failed);

    await say(t.confirm);
    expect(create).toHaveBeenCalledTimes(2);
    expect(db.rows).toHaveLength(0);
  });
});

describe('splitRules', () => {
  it('keeps rules written one per line', () => {
    expect(splitRules('ሀ።\nለ።\n\n')).toEqual(['ሀ።', 'ለ።']);
  });

  it('splits a single paragraph at each sentence end', () => {
    expect(splitRules('የክፍሉን ደንብ ማክበር። ተገቢ ባህሪ መከተል።')).toEqual([
      'የክፍሉን ደንብ ማክበር።',
      'ተገቢ ባህሪ መከተል።',
    ]);
    expect(splitRules("Respect the rules. Keep the class's secrets.")).toEqual([
      'Respect the rules.',
      "Keep the class's secrets.",
    ]);
  });
});
