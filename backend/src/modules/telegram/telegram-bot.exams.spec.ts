import { jest } from '@jest/globals';
import type { ExamsService } from '../exams/exams.service.js';
import type { TelegramApi } from './telegram-api.js';
import { TelegramBotService } from './telegram-bot.service.js';

type Fn = (...args: unknown[]) => Promise<unknown>;

describe('TelegramBotService exams', () => {
  const sendMessage = jest.fn<Fn>().mockResolvedValue({});
  const memberExams = jest.fn<Fn>();
  const none = {} as never;
  const service = new TelegramBotService(
    { sendMessage } as unknown as TelegramApi,
    none, // config
    none, // prisma
    none, // members
    none, // attendance
    none, // courses
    { memberExams } as unknown as ExamsService,
    none, // audit
    none, // registration
  );
  const link = { id: 1, chatId: 42n, phone: '0911', memberId: 7, language: 'am' };
  const who = {
    id: 7,
    memberCode: 'FE-00007',
    firstName: 'ዮሴፍ',
    fatherName: 'አበራ',
    grandfatherName: null,
  };
  const report = (lang: 'am' | 'en') =>
    (
      service as unknown as {
        examReport: (
          l: typeof link,
          w: typeof who,
          n: number,
          lang: 'am' | 'en',
        ) => Promise<unknown>;
      }
    ).examReport(link, who, 1, lang);

  beforeEach(() => jest.clearAllMocks());

  it('lists each exam with its parts, total and result', async () => {
    memberExams.mockResolvedValue([
      {
        nameAm: 'የመጀመሪያ ወሰነ ትምህርት ፈተና',
        nameEn: 'First term exam',
        heldOn: new Date('2026-10-20T00:00:00Z'),
        passMark: 50,
        classType: { nameAm: 'የመዝሙር ክፍል', nameEn: 'Mezmur Class' },
        classGrade: { nameAm: 'ግዕዝ', nameEn: "Ge'ez" },
        parts: [
          { name: 'ጽሑፍ', weight: 60, score: 48 },
          { name: 'ቃል', weight: 40, score: 30 },
        ],
        total: 78,
        result: 'PASS',
      },
    ]);
    await report('en');
    const text = sendMessage.mock.calls[0]![1] as string;
    expect(memberExams).toHaveBeenCalledWith(7, null);
    expect(text).toContain('First term exam');
    expect(text).toContain('ጽሑፍ 48/60 · ቃል 30/40');
    expect(text).toContain('Total: <b>78/100</b> ✅ Passed');
  });

  it('says so when the member sits no exam', async () => {
    memberExams.mockResolvedValue([]);
    await report('am');
    expect(sendMessage.mock.calls[0]![1]).toContain('ለየትኛውም ፈተና አልተመዘገቡም።');
  });
});
