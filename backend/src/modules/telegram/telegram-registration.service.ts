import { Injectable, Logger } from '@nestjs/common';
import { isEmail } from 'class-validator';
import { ValidationFailedException } from '../../common/filters/all-exceptions.filter.js';
import {
  ETHIOPIAN_PHONE_REGEX,
  normalizeEthiopianPhone,
} from '../../common/transforms/string.transforms.js';
import { todayIso } from '../../common/utils/dates.js';
import { parseEcDate } from '../../common/utils/ethiopian-calendar.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { EducationLevel, MaritalStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MAX_PHOTO_BYTES, MembersService } from '../members/members.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { TelegramApi, type TgMessage } from './telegram-api.js';
import { buttons, menu, shareKeyboard } from './telegram.keyboards.js';
import { REG_TEXT } from './telegram-registration.texts.js';
import { AGREEMENT, type BotLang, ecDate, esc, TEXT } from './telegram.texts.js';

/** Every question, in the order asked: the whole member form, then health, photo and agreement. */
const QUESTIONS = [
  'firstName',
  'fatherName',
  'grandfatherName',
  'christianName',
  'gender',
  'dateOfBirth',
  'placeOfBirth',
  'maritalStatus',
  'spiritualFatherName',
  'alternatePhone',
  'email',
  'city',
  'subCity',
  'woreda',
  'kebele',
  'houseNumber',
  'educationLevel',
  'occupation',
  'emergencyContactName',
  'emergencyContactRelation',
  'emergencyContactPhone',
  'health',
  'healthNote',
  'photo',
  'agreement',
] as const;

type Question = (typeof QUESTIONS)[number];
type Step = 'offer' | Question | 'confirm' | 'submitting';

const FLOW: readonly Step[] = [...QUESTIONS, 'confirm'];

/** The health note shares the health question's number. */
const NUMBERED = QUESTIONS.filter((q) => q !== 'healthNote');
export const QUESTION_COUNT = NUMBERED.length;
const questionNumber = (step: Step) =>
  NUMBERED.indexOf((step === 'healthNote' ? 'health' : step) as (typeof NUMBERED)[number]) + 1;

type TextKey =
  | 'firstName'
  | 'fatherName'
  | 'grandfatherName'
  | 'christianName'
  | 'placeOfBirth'
  | 'spiritualFatherName'
  | 'alternatePhone'
  | 'email'
  | 'city'
  | 'subCity'
  | 'woreda'
  | 'kebele'
  | 'houseNumber'
  | 'occupation'
  | 'emergencyContactName'
  | 'emergencyContactRelation'
  | 'emergencyContactPhone';

/** Typed answers: how each is checked, how long it may be, and whether it can be skipped. */
const TEXT_RULES: Record<
  TextKey,
  { kind: 'name' | 'text' | 'phone' | 'email'; max: number; optional: boolean }
> = {
  firstName: { kind: 'name', max: 100, optional: false },
  fatherName: { kind: 'name', max: 100, optional: false },
  grandfatherName: { kind: 'name', max: 100, optional: false },
  christianName: { kind: 'name', max: 100, optional: true },
  placeOfBirth: { kind: 'text', max: 100, optional: true },
  spiritualFatherName: { kind: 'text', max: 150, optional: true },
  alternatePhone: { kind: 'phone', max: 20, optional: true },
  email: { kind: 'email', max: 191, optional: true },
  city: { kind: 'text', max: 100, optional: true },
  subCity: { kind: 'text', max: 100, optional: true },
  woreda: { kind: 'text', max: 50, optional: true },
  kebele: { kind: 'text', max: 50, optional: true },
  houseNumber: { kind: 'text', max: 30, optional: true },
  occupation: { kind: 'text', max: 100, optional: true },
  emergencyContactName: { kind: 'text', max: 150, optional: true },
  // Asked only once an emergency contact is named, and then needed.
  emergencyContactRelation: { kind: 'text', max: 50, optional: false },
  emergencyContactPhone: { kind: 'phone', max: 20, optional: false },
};
const isTextKey = (step: Step): step is TextKey => step in TEXT_RULES;
const OPTIONAL_CHOICES = new Set<Step>(['maritalStatus', 'educationLevel', 'photo']);
const isOptional = (step: Step) =>
  (isTextKey(step) && TEXT_RULES[step].optional) || OPTIONAL_CHOICES.has(step);

type Answers = { [K in TextKey]?: string | null } & {
  gender?: 'MALE' | 'FEMALE';
  dateOfBirth?: string;
  maritalStatus?: MaritalStatus | null;
  educationLevel?: EducationLevel | null;
  hasHealthCondition?: boolean;
  healthConditionNote?: string | null;
  photoFileId?: string | null;
  agreed?: boolean;
};

/** Follow-up questions are asked only when their lead question was answered. */
const applies = (step: Step, a: Answers) => {
  if (step === 'healthNote') return a.hasHealthCondition === true;
  if (step === 'emergencyContactRelation' || step === 'emergencyContactPhone') {
    return Boolean(a.emergencyContactName);
  }
  return true;
};
const nextStep = (step: Step, a: Answers): Step =>
  FLOW.slice(FLOW.indexOf(step) + 1).find((s) => applies(s, a)) ?? 'confirm';
const previousStep = (step: Step, a: Answers): Step | null =>
  FLOW.slice(0, Math.max(FLOW.indexOf(step), 0)).findLast((s) => applies(s, a)) ?? null;

type Registration = {
  id: number;
  chatId: bigint;
  telegramUserId: bigint;
  phone: string;
  language: string;
  step: string;
  answers: Prisma.JsonValue;
};

/** A picture sent with the message: usable, too big, or not an image we store. */
type PhotoInput = { fileId: string } | 'tooLarge' | 'badType';

/** Abandoned conversations are cleared after this long. */
const STALE_AFTER_MS = 30 * 86_400_000;
const ADDIS_ABABA = 'Addis Ababa';

const toLang = (value: string): BotLang => (value === 'en' ? 'en' : 'am');
const fullName = (a: Answers) =>
  [a.firstName, a.fatherName, a.grandfatherName].filter(Boolean).join(' ');

/** Letters (any script), spaces, apostrophes, dots and hyphens; no digits or markup. */
const validName = (text: string) =>
  text.length >= 1 &&
  text.length <= 100 &&
  /\p{L}/u.test(text) &&
  !/[\d<>@#/\\_=+*{}[\]|~`"$%^&]/.test(text);

const keyFor = (labels: Record<string, string>, label: string) =>
  Object.entries(labels).find(([, text]) => text === label)?.[0];

function photoFrom(message: TgMessage): PhotoInput | undefined {
  if (message.photo?.length) {
    // Sizes come smallest first: keep the largest that fits the member photo limit.
    const fits = message.photo.filter((p) => (p.file_size ?? 0) <= MAX_PHOTO_BYTES);
    const best = fits.at(-1);
    return best ? { fileId: best.file_id } : 'tooLarge';
  }
  if (message.document) {
    const d = message.document;
    if (!/^image\/(jpeg|png|webp)$/.test(d.mime_type ?? '')) return 'badType';
    if ((d.file_size ?? 0) > MAX_PHOTO_BYTES) return 'tooLarge';
    return { fileId: d.file_id };
  }
  return undefined;
}

type Outcome = { answers: Answers } | { error: string } | { action: 'restart' | 'submit' };

/**
 * Self-registration through the bot, one question at a time, covering every
 * field of the member form. Only offered to a chat whose shared
 * (Telegram-verified) number is on no member record, and only while the
 * office has it switched on in Settings. The conversation lives in the
 * database so any process can pick up the next answer.
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
    return this.ask(chatId, 'offer', {}, lang, phone);
  }

  /** The next message from a chat that is registering. */
  async onMessage(reg: Registration, message: TgMessage) {
    const lang = toLang(reg.language);
    const t = REG_TEXT[lang];
    const step = reg.step as Step;
    const answers = (reg.answers ?? {}) as Answers;
    const input = (message.text ?? message.caption ?? '').trim();
    const photo = photoFrom(message);

    if (step === 'submitting') return this.api.sendMessage(reg.chatId, t.wait);
    if (input === t.cancel || input === '/cancel') {
      return this.end(reg, lang, step === 'agreement' ? t.declined : t.cancelled);
    }
    if (!(await this.isOpen())) return this.end(reg, lang, t.closed);
    // /start, or a message with nothing to read, repeats the current question.
    if (input === '/start' || (input === '' && !photo)) {
      return this.ask(reg.chatId, step, answers, lang, reg.phone);
    }
    if (input === t.back && step !== 'offer') {
      const previous = previousStep(step, answers) ?? step;
      await this.save(reg.id, previous, answers);
      return this.ask(reg.chatId, previous, answers, lang, reg.phone);
    }

    const outcome = this.accept(step, input, photo, answers, lang);
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
    const next = step === 'offer' ? 'firstName' : nextStep(step, outcome.answers);
    await this.save(reg.id, next, outcome.answers);
    return this.ask(reg.chatId, next, outcome.answers, lang, reg.phone);
  }

  /** Validates one answer. */
  private accept(
    step: Step,
    input: string,
    photo: PhotoInput | undefined,
    a: Answers,
    lang: BotLang,
  ): Outcome {
    const t = REG_TEXT[lang];
    const skipped = isOptional(step) && input === t.skip;

    if (isTextKey(step)) {
      if (skipped) return { answers: { ...a, [step]: null } };
      if (step === 'city' && input === t.addisAbaba)
        return { answers: { ...a, city: ADDIS_ABABA } };
      const rule = TEXT_RULES[step];
      switch (rule.kind) {
        case 'name':
          return validName(input)
            ? { answers: { ...a, [step]: input } }
            : { error: t.invalid.name };
        case 'phone': {
          const phone = normalizeEthiopianPhone(input);
          return ETHIOPIAN_PHONE_REGEX.test(phone)
            ? { answers: { ...a, [step]: phone } }
            : { error: t.invalid.phone };
        }
        case 'email': {
          const email = input.toLowerCase();
          return isEmail(email) && email.length <= rule.max
            ? { answers: { ...a, email } }
            : { error: t.invalid.email };
        }
        default:
          return input.length > rule.max
            ? { error: t.invalid.tooLong(rule.max) }
            : { answers: { ...a, [step]: input } };
      }
    }

    switch (step) {
      case 'offer':
        return input === t.start ? { answers: {} } : { error: t.invalid.choose };
      case 'gender':
        if (input === t.male) return { answers: { ...a, gender: 'MALE' } };
        if (input === t.female) return { answers: { ...a, gender: 'FEMALE' } };
        return { error: t.invalid.choose };
      case 'dateOfBirth': {
        const iso = parseEcDate(input);
        if (!iso) return { error: t.invalid.date };
        const today = todayIso();
        const oldest = `${Number(today.slice(0, 4)) - 100}${today.slice(4)}`;
        if (iso >= today || iso < oldest) return { error: t.invalid.dateRange };
        return { answers: { ...a, dateOfBirth: iso } };
      }
      case 'maritalStatus': {
        if (skipped) return { answers: { ...a, maritalStatus: null } };
        const key = keyFor(t.maritalStatus, input);
        return key
          ? { answers: { ...a, maritalStatus: key as MaritalStatus } }
          : { error: t.invalid.choose };
      }
      case 'educationLevel': {
        if (skipped) return { answers: { ...a, educationLevel: null } };
        const key = keyFor(t.education, input);
        return key
          ? { answers: { ...a, educationLevel: key as EducationLevel } }
          : { error: t.invalid.choose };
      }
      case 'health':
        if (input === t.yes) return { answers: { ...a, hasHealthCondition: true } };
        if (input === t.no) {
          return { answers: { ...a, hasHealthCondition: false, healthConditionNote: null } };
        }
        return { error: t.invalid.choose };
      case 'healthNote':
        if (input.length < 2 || !/\p{L}/u.test(input)) return { error: t.invalid.note };
        if (input.length > 1000) return { error: t.invalid.tooLong(1000) };
        return { answers: { ...a, healthConditionNote: input } };
      case 'photo':
        if (skipped) return { answers: { ...a, photoFileId: null } };
        if (photo === 'tooLarge') return { error: t.invalid.photoTooLarge };
        if (photo && photo !== 'badType') return { answers: { ...a, photoFileId: photo.fileId } };
        return { error: t.invalid.photo };
      case 'agreement':
        return input === t.agree
          ? { answers: { ...a, agreed: true } }
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
    const t = REG_TEXT[lang];
    if (step === 'offer') {
      return this.api.sendMessage(
        chatId,
        t.offer(esc(phone), QUESTION_COUNT),
        buttons([[t.start], [t.cancel]]),
      );
    }
    if (step === 'submitting') return this.api.sendMessage(chatId, t.wait);
    if (step === 'confirm') {
      return this.api.sendMessage(
        chatId,
        this.summary(a, lang, phone),
        buttons([[t.confirm], [t.back, t.restart], [t.cancel]]),
      );
    }

    const footer = step === 'firstName' ? [t.cancel] : [t.back, t.cancel];
    const pairs = (labels: string[]) =>
      labels.reduce<string[][]>((rows, label, i) => {
        if (i % 2 === 0) rows.push([label]);
        else rows.at(-1)!.push(label);
        return rows;
      }, []);
    const skipRow = isOptional(step) ? [[t.skip]] : [];
    let question: string;
    let options: string[][] = [];

    if (step === 'agreement') {
      const ag = AGREEMENT[lang];
      question = [
        t.agreementIntro,
        '',
        `📜 <b>${ag.title}</b>`,
        '',
        ...ag.rules.map((rule) => `▫️ ${rule}`),
        '',
        `<i>${ag.pledge}</i>`,
      ].join('\n');
      options = [[t.agree]];
    } else {
      question = t.ask[step];
      if (step === 'gender') options = [[t.male, t.female]];
      if (step === 'health') options = [[t.yes, t.no]];
      if (step === 'maritalStatus') options = pairs(Object.values(t.maritalStatus));
      if (step === 'educationLevel') options = pairs(Object.values(t.education));
      if (step === 'city') options = [[t.addisAbaba]];
      if (isOptional(step)) question += `\n<i>${t.skipHint}</i>`;
    }

    return this.api.sendMessage(
      chatId,
      `${t.step(questionNumber(step), QUESTION_COUNT)}\n${question}`,
      buttons([...options, ...skipRow, footer]),
    );
  }

  private summary(a: Answers, lang: BotLang, phone: string): string {
    const t = REG_TEXT[lang];
    const f = t.fields;
    const s = t.sections;
    const sep = lang === 'am' ? '፦' : ':';
    const row = (label: string, value: string | null | undefined) =>
      `   ${label}${sep} <b>${value ? esc(value) : f.none}</b>`;
    const city = a.city === ADDIS_ABABA ? t.addisAbaba : a.city;
    return [
      t.summaryTitle,
      '',
      `👤 <b>${s.personal}</b>`,
      row(f.name, fullName(a)),
      row(f.christianName, a.christianName),
      row(f.gender, a.gender && TEXT[lang].gender[a.gender]),
      row(f.birth, a.dateOfBirth && ecDate(a.dateOfBirth, lang)),
      row(f.placeOfBirth, a.placeOfBirth),
      row(f.maritalStatus, a.maritalStatus && t.maritalStatus[a.maritalStatus]),
      row(f.spiritualFather, a.spiritualFatherName),
      '',
      `📞 <b>${s.contact}</b>`,
      row(f.phone, phone),
      row(f.alternatePhone, a.alternatePhone),
      row(f.email, a.email),
      '',
      `🏠 <b>${s.address}</b>`,
      row(f.city, city),
      row(f.subCity, a.subCity),
      row(f.woreda, a.woreda),
      row(f.kebele, a.kebele),
      row(f.houseNumber, a.houseNumber),
      '',
      `🎓 <b>${s.work}</b>`,
      row(f.education, a.educationLevel && t.education[a.educationLevel]),
      row(f.occupation, a.occupation),
      '',
      `🆘 <b>${s.emergency}</b>`,
      row(f.emergencyName, a.emergencyContactName),
      ...(a.emergencyContactName
        ? [
            row(f.emergencyRelation, a.emergencyContactRelation),
            row(f.emergencyPhone, a.emergencyContactPhone),
          ]
        : []),
      '',
      `🩺 <b>${s.health}</b>`,
      row(f.health, a.hasHealthCondition ? a.healthConditionNote : f.noCondition),
      row(f.photo, a.photoFileId ? f.photoSent : null),
      row(f.agreement, f.accepted),
      '',
      t.summaryHint,
    ].join('\n');
  }

  /** Creates the member and links the chat to them, so the bot's menu opens straight away. */
  private async submit(reg: Registration, a: Answers, lang: BotLang) {
    const t = REG_TEXT[lang];
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
          placeOfBirth: a.placeOfBirth ?? null,
          maritalStatus: a.maritalStatus ?? null,
          spiritualFatherName: a.spiritualFatherName ?? null,
          phone: reg.phone,
          alternatePhone: a.alternatePhone ?? null,
          email: a.email ?? null,
          city: a.city ?? null,
          subCity: a.subCity ?? null,
          woreda: a.woreda ?? null,
          kebele: a.kebele ?? null,
          houseNumber: a.houseNumber ?? null,
          educationLevel: a.educationLevel ?? null,
          occupation: a.occupation ?? null,
          emergencyContactName: a.emergencyContactName ?? null,
          emergencyContactRelation: a.emergencyContactName
            ? (a.emergencyContactRelation ?? null)
            : null,
          emergencyContactPhone: a.emergencyContactName ? (a.emergencyContactPhone ?? null) : null,
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
      // The record is saved; a photo that fails to arrive must not undo it.
      const photoSaved = a.photoFileId ? await this.savePhoto(member.id, a.photoFileId) : true;
      return this.api.sendMessage(
        reg.chatId,
        t.done(esc(fullName(a)), esc(member.memberCode)) +
          (photoSaved ? '' : `\n\n<i>${t.photoFailed}</i>`),
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
        buttons([[t.confirm], [t.back, t.restart], [t.cancel]]),
      );
    }
  }

  private async savePhoto(memberId: number, fileId: string): Promise<boolean> {
    try {
      const buffer = await this.api.downloadFile(fileId);
      if (!buffer) return false;
      await this.members.setPhoto(memberId, { buffer, size: buffer.length }, null, null);
      return true;
    } catch (error) {
      this.logger.warn(`Photo for member ${memberId} not saved: ${(error as Error).message}`);
      return false;
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
