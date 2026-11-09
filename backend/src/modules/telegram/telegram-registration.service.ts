import { Injectable, Logger } from '@nestjs/common';
import { ValidationFailedException } from '../../common/filters/all-exceptions.filter.js';
import { parseEcDate } from '../../common/utils/ethiopian-calendar.js';
import { todayIso } from '../../common/utils/dates.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MembersService } from '../members/members.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { TelegramApi } from './telegram-api.js';
import { buttons, menu, shareKeyboard } from './telegram.keyboards.js';
import { AGREEMENT, type BotLang, ecDate, esc, TEXT } from './telegram.texts.js';

type Step =
  | 'offer'
  | 'firstName'
  | 'fatherName'
  | 'grandfatherName'
  | 'christianName'
  | 'gender'
  | 'dateOfBirth'
  | 'subCity'
  | 'woreda'
  | 'health'
  | 'healthNote'
  | 'agreement'
  | 'confirm'
  | 'submitting';

interface Answers {
  firstName?: string;
  fatherName?: string;
  grandfatherName?: string;
  christianName?: string | null;
  gender?: 'MALE' | 'FEMALE';
  dateOfBirth?: string;
  subCity?: string | null;
  woreda?: string | null;
  hasHealthCondition?: boolean;
  healthConditionNote?: string | null;
  agreed?: boolean;
}

type Registration = {
  id: number;
  chatId: bigint;
  telegramUserId: bigint;
  phone: string;
  language: string;
  step: string;
  answers: Prisma.JsonValue;
};

/** The number shown as "Question n/10"; the health note shares the health question's. */
const QUESTION_NUMBER: Partial<Record<Step, number>> = {
  firstName: 1,
  fatherName: 2,
  grandfatherName: 3,
  christianName: 4,
  gender: 5,
  dateOfBirth: 6,
  subCity: 7,
  woreda: 8,
  health: 9,
  healthNote: 9,
  agreement: 10,
};

const SKIPPABLE = new Set<Step>(['christianName', 'subCity', 'woreda']);

/** Abandoned conversations are cleared after this long. */
const STALE_AFTER_MS = 30 * 86_400_000;

const toLang = (value: string): BotLang => (value === 'en' ? 'en' : 'am');
const fullName = (a: Answers) =>
  [a.firstName, a.fatherName, a.grandfatherName].filter(Boolean).join(' ');

/** Letters (any script), spaces, apostrophes, dots and hyphens; no digits or markup. */
const validName = (text: string) =>
  text.length >= 1 &&
  text.length <= 100 &&
  /\p{L}/u.test(text) &&
  !/[\d<>@#/\\_=+*{}[\]|~`"$%^&]/.test(text);

type Outcome =
  { next: Step; answers: Answers } | { error: string } | { action: 'restart' | 'submit' };

/**
 * Self-registration through the bot, one question at a time. Only offered to
 * a chat whose shared (Telegram-verified) number is on no member record, and
 * only while the office has it switched on in Settings. The conversation lives
 * in the database so any process can pick up the next answer.
 */
@Injectable()
export class TelegramRegistrationService {
  private readonly logger = new Logger('TelegramRegistration');

  constructor(
    private readonly api: TelegramApi,
    private readonly prisma: PrismaService,
    private readonly members: MembersService,
    private readonly settings: SettingsService,
  ) {}

  isOpen(): Promise<boolean> {
    return this.settings.get('selfRegistration');
  }

  find(chatId: bigint) {
    return this.prisma.telegramRegistration.findUnique({ where: { chatId } });
  }

  /** Drops any unfinished registration for the chat (e.g. its number turned out to be on a record). */
  async discard(chatId: bigint) {
    await this.prisma.telegramRegistration.deleteMany({ where: { chatId } });
  }

  /** The shared number is on no record: offer to register. Restarts any earlier attempt. */
  async offer(chatId: bigint, telegramUserId: number, phone: string, lang: BotLang) {
    await this.prisma.telegramRegistration.deleteMany({
      where: { updatedAt: { lt: new Date(Date.now() - STALE_AFTER_MS) } },
    });
    const data = {
      telegramUserId: BigInt(telegramUserId),
      phone,
      language: lang,
      step: 'offer',
      answers: {},
    };
    await this.prisma.telegramRegistration.upsert({
      where: { chatId },
      create: { chatId, ...data },
      update: data,
    });
    const t = TEXT[lang].register;
    return this.api.sendMessage(chatId, t.offer(esc(phone)), buttons([[t.start], [t.cancel]]));
  }

  /** The next message from a chat that is registering. */
  async onMessage(reg: Registration, text: string) {
    const lang = toLang(reg.language);
    const t = TEXT[lang].register;
    const step = reg.step as Step;
    const answers = (reg.answers ?? {}) as Answers;
    const input = text.trim();

    if (step === 'submitting') return this.api.sendMessage(reg.chatId, t.wait);
    if (input === t.cancel || input === '/cancel') {
      return this.end(reg, lang, step === 'agreement' ? t.declined : t.cancelled);
    }
    if (!(await this.isOpen())) return this.end(reg, lang, t.closed);
    // /start (or anything sent before a question was shown) repeats the current question.
    if (input === '/start' || input === '')
      return this.ask(reg.chatId, step, answers, lang, reg.phone);

    const outcome = this.accept(step, input, answers, lang);
    if ('error' in outcome) {
      await this.api.sendMessage(reg.chatId, `⚠️ ${outcome.error}`);
      return this.ask(reg.chatId, step, answers, lang, reg.phone);
    }
    if ('action' in outcome) {
      if (outcome.action === 'restart') {
        await this.save(reg.id, 'firstName', {});
        return this.ask(reg.chatId, 'firstName', {}, lang, reg.phone);
      }
      return this.submit(reg, answers, lang);
    }
    await this.save(reg.id, outcome.next, outcome.answers);
    return this.ask(reg.chatId, outcome.next, outcome.answers, lang, reg.phone);
  }

  /** Validates one answer and decides the next question. */
  private accept(step: Step, input: string, a: Answers, lang: BotLang): Outcome {
    const t = TEXT[lang].register;
    const skip = SKIPPABLE.has(step) && input === t.skip;
    const name = (
      key: 'firstName' | 'fatherName' | 'grandfatherName' | 'christianName',
      next: Step,
    ) =>
      skip
        ? { next, answers: { ...a, [key]: null } }
        : validName(input)
          ? { next, answers: { ...a, [key]: input } }
          : { error: t.invalid.name };
    const text = (key: 'subCity' | 'woreda', max: number, next: Step) =>
      skip
        ? { next, answers: { ...a, [key]: null } }
        : input.length > max
          ? { error: t.invalid.tooLong(max) }
          : { next, answers: { ...a, [key]: input } };

    switch (step) {
      case 'offer':
        return input === t.start ? { next: 'firstName', answers: {} } : { error: t.invalid.choose };
      case 'firstName':
        return name('firstName', 'fatherName');
      case 'fatherName':
        return name('fatherName', 'grandfatherName');
      case 'grandfatherName':
        return name('grandfatherName', 'christianName');
      case 'christianName':
        return name('christianName', 'gender');
      case 'gender':
        if (input === t.male) return { next: 'dateOfBirth', answers: { ...a, gender: 'MALE' } };
        if (input === t.female) return { next: 'dateOfBirth', answers: { ...a, gender: 'FEMALE' } };
        return { error: t.invalid.choose };
      case 'dateOfBirth': {
        const iso = parseEcDate(input);
        if (!iso) return { error: t.invalid.date };
        const today = todayIso();
        const oldest = `${Number(today.slice(0, 4)) - 100}${today.slice(4)}`;
        if (iso >= today || iso < oldest) return { error: t.invalid.dateRange };
        return { next: 'subCity', answers: { ...a, dateOfBirth: iso } };
      }
      case 'subCity':
        return text('subCity', 100, 'woreda');
      case 'woreda':
        return text('woreda', 50, 'health');
      case 'health':
        if (input === t.yes)
          return { next: 'healthNote', answers: { ...a, hasHealthCondition: true } };
        if (input === t.no) {
          return {
            next: 'agreement',
            answers: { ...a, hasHealthCondition: false, healthConditionNote: null },
          };
        }
        return { error: t.invalid.choose };
      case 'healthNote':
        if (input.length < 2 || !/\p{L}/u.test(input)) return { error: t.invalid.note };
        if (input.length > 1000) return { error: t.invalid.tooLong(1000) };
        return { next: 'agreement', answers: { ...a, healthConditionNote: input } };
      case 'agreement':
        return input === t.agree
          ? { next: 'confirm', answers: { ...a, agreed: true } }
          : { error: t.invalid.choose };
      case 'confirm':
        if (input === t.confirm) return { action: 'submit' };
        if (input === t.restart) return { action: 'restart' };
        return { error: t.invalid.choose };
      default:
        return { error: t.invalid.choose };
    }
  }

  /** Sends the question for a step, with the buttons that answer it. */
  private ask(chatId: bigint, step: Step, a: Answers, lang: BotLang, phone: string) {
    const t = TEXT[lang].register;
    const numbered = (question: string) => `${t.step(QUESTION_NUMBER[step] ?? 0)}\n${question}`;
    switch (step) {
      case 'offer':
        return this.api.sendMessage(chatId, t.offer(esc(phone)), buttons([[t.start], [t.cancel]]));
      case 'gender':
        return this.api.sendMessage(
          chatId,
          numbered(t.ask.gender),
          buttons([[t.male, t.female], [t.cancel]]),
        );
      case 'health':
        return this.api.sendMessage(
          chatId,
          numbered(t.ask.health),
          buttons([[t.yes, t.no], [t.cancel]]),
        );
      case 'agreement': {
        const ag = AGREEMENT[lang];
        const body = [
          numbered(t.agreementIntro),
          '',
          `📜 <b>${ag.title}</b>`,
          '',
          ...ag.rules.map((rule) => `▫️ ${rule}`),
          '',
          `<i>${ag.pledge}</i>`,
        ].join('\n');
        return this.api.sendMessage(chatId, body, buttons([[t.agree], [t.cancel]]));
      }
      case 'confirm':
        return this.api.sendMessage(
          chatId,
          this.summary(a, lang, phone),
          buttons([[t.confirm], [t.restart], [t.cancel]]),
        );
      case 'submitting':
        return this.api.sendMessage(chatId, t.wait);
      default:
        return this.api.sendMessage(
          chatId,
          numbered(t.ask[step]),
          buttons(SKIPPABLE.has(step) ? [[t.skip], [t.cancel]] : [[t.cancel]]),
        );
    }
  }

  private summary(a: Answers, lang: BotLang, phone: string): string {
    const t = TEXT[lang].register;
    const f = t.fields;
    const sep = lang === 'am' ? '፦' : ':';
    const row = (icon: string, label: string, value: string | null | undefined) =>
      `${icon} ${label}${sep} <b>${esc(value || f.none)}</b>`;
    const address = [a.subCity, a.woreda && `${f.woreda} ${a.woreda}`]
      .filter(Boolean)
      .join(lang === 'am' ? '፣ ' : ', ');
    return [
      t.summaryTitle,
      '',
      row('👤', f.name, fullName(a)),
      ...(a.christianName ? [row('✝️', f.christianName, a.christianName)] : []),
      row('👥', f.gender, a.gender && TEXT[lang].gender[a.gender]),
      row('🎂', f.birth, a.dateOfBirth && ecDate(a.dateOfBirth, lang)),
      row('📞', f.phone, phone),
      row('🏠', f.address, address),
      row('🩺', f.health, a.hasHealthCondition ? a.healthConditionNote : f.none),
      row('📜', f.agreement, `✅ ${f.accepted}`),
      '',
      t.summaryHint,
    ].join('\n');
  }

  /** Creates the member and links the chat to them, so the bot's menu opens straight away. */
  private async submit(reg: Registration, a: Answers, lang: BotLang) {
    const t = TEXT[lang].register;
    // Claim the submission so a double tap cannot register the person twice.
    const claimed = await this.prisma.telegramRegistration.updateMany({
      where: { id: reg.id, step: 'confirm' },
      data: { step: 'submitting' },
    });
    if (claimed.count === 0) return;
    if (!a.firstName || !a.fatherName || !a.gender || !a.dateOfBirth || !a.agreed) {
      await this.save(reg.id, 'firstName', {});
      return this.ask(reg.chatId, 'firstName', {}, lang, reg.phone);
    }

    try {
      const member = await this.members.create(
        {
          firstName: a.firstName,
          fatherName: a.fatherName,
          grandfatherName: a.grandfatherName ?? null,
          christianName: a.christianName ?? null,
          gender: a.gender,
          dateOfBirth: a.dateOfBirth,
          phone: reg.phone,
          subCity: a.subCity ?? null,
          woreda: a.woreda ?? null,
          hasHealthCondition: a.hasHealthCondition ?? null,
          healthConditionNote: a.healthConditionNote ?? null,
          agreementAccepted: true,
        },
        null,
        null,
        undefined,
        { selfRegistered: true },
      );
      await this.prisma.$transaction([
        this.prisma.telegramRegistration.delete({ where: { id: reg.id } }),
        this.prisma.telegramLink.upsert({
          where: { chatId: reg.chatId },
          create: {
            chatId: reg.chatId,
            telegramUserId: reg.telegramUserId,
            phone: reg.phone,
            memberId: member.id,
            language: lang,
          },
          update: { phone: reg.phone, memberId: member.id },
        }),
      ]);
      return this.api.sendMessage(
        reg.chatId,
        t.done(esc(fullName(a)), esc(member.memberCode)),
        menu(lang, 1),
      );
    } catch (error) {
      const twin = duplicateCode(error);
      if (twin) return this.end(reg, lang, t.duplicate(esc(twin)));
      this.logger.error(
        `Self-registration for chat ${reg.chatId} failed: ${(error as Error).stack ?? error}`,
      );
      await this.save(reg.id, 'confirm', a);
      return this.api.sendMessage(
        reg.chatId,
        `⚠️ ${t.failed}`,
        buttons([[t.confirm], [t.restart], [t.cancel]]),
      );
    }
  }

  private async end(reg: Registration, lang: BotLang, message: string) {
    await this.prisma.telegramRegistration.deleteMany({ where: { id: reg.id } });
    return this.api.sendMessage(reg.chatId, message, shareKeyboard(lang));
  }

  private save(id: number, step: Step, answers: Answers) {
    return this.prisma.telegramRegistration.update({
      where: { id },
      data: { step, answers: answers as Prisma.InputJsonObject },
    });
  }
}

/** The existing member's code when the name is already registered, else null. */
function duplicateCode(error: unknown): string | null {
  if (!(error instanceof ValidationFailedException)) return null;
  for (const detail of error.details) {
    for (const message of detail.messages) {
      const [key, params] = message.split('|');
      if (key !== 'validation.duplicateName') continue;
      try {
        return (JSON.parse(params ?? '{}') as { code?: string }).code ?? '—';
      } catch {
        return '—';
      }
    }
  }
  return null;
}
