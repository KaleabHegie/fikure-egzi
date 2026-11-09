import { Injectable, Logger } from '@nestjs/common';
import { isEmail } from 'class-validator';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
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
import { type Ask, REG_TEXT } from './telegram-registration.texts.js';
import { AGREEMENT, type BotLang, ecDate, esc, TEXT } from './telegram.texts.js';

/** The member form's personal section, asked first. */
const PERSONAL = [
  'firstName',
  'fatherName',
  'grandfatherName',
  'christianName',
  'gender',
  'dateOfBirth',
  'placeOfBirth',
  'maritalStatus',
  'spiritualFatherName',
] as const;

/** Everything after the class placements: the rest of the form, then health, photo and agreement. */
const REST = [
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

type Question = (typeof PERSONAL)[number] | (typeof REST)[number];
/** One question per class type: which grade the person is in. */
type ClassStep = `class:${number}`;
type Step = 'offer' | Question | ClassStep | 'confirm' | 'submitting';
type Section = keyof (typeof REG_TEXT)['am']['sections'];

const SECTION: Record<Question, Section> = {
  firstName: 'personal',
  fatherName: 'personal',
  grandfatherName: 'personal',
  christianName: 'personal',
  gender: 'personal',
  dateOfBirth: 'personal',
  placeOfBirth: 'personal',
  maritalStatus: 'personal',
  spiritualFatherName: 'personal',
  alternatePhone: 'contact',
  email: 'contact',
  city: 'address',
  subCity: 'address',
  woreda: 'address',
  kebele: 'address',
  houseNumber: 'address',
  educationLevel: 'work',
  occupation: 'work',
  emergencyContactName: 'emergency',
  emergencyContactRelation: 'emergency',
  emergencyContactPhone: 'emergency',
  health: 'health',
  healthNote: 'health',
  photo: 'photo',
  agreement: 'agreement',
};

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
const isClassStep = (step: Step): step is ClassStep => step.startsWith('class:');
const classIdOf = (step: ClassStep) => Number(step.slice('class:'.length));
const OPTIONAL_CHOICES = new Set<Step>(['maritalStatus', 'educationLevel', 'photo']);
const isOptional = (step: Step) =>
  (isTextKey(step) && TEXT_RULES[step].optional) || OPTIONAL_CHOICES.has(step) || isClassStep(step);

type Answers = { [K in TextKey]?: string | null } & {
  gender?: 'MALE' | 'FEMALE';
  dateOfBirth?: string;
  maritalStatus?: MaritalStatus | null;
  educationLevel?: EducationLevel | null;
  /** classTypeId → classGradeId (null = not placed). */
  classGrades?: Record<string, number | null>;
  hasHealthCondition?: boolean;
  healthConditionNote?: string | null;
  photoFileId?: string | null;
  agreed?: boolean;
};

/** A class type offered on the member form, with its grades. */
type ClassOption = {
  id: number;
  nameAm: string;
  nameEn: string;
  grades: { id: number; nameAm: string; nameEn: string }[];
};

/** The questions for this conversation: class questions depend on what the office offers. */
const flowFor = (classes: ClassOption[]): Step[] => [
  ...PERSONAL,
  ...classes.map((c): ClassStep => `class:${c.id}`),
  ...REST,
  'confirm',
];

/** Follow-up questions are asked only when their lead question was answered. */
const applies = (step: Step, a: Answers) => {
  if (step === 'healthNote') return a.hasHealthCondition === true;
  if (step === 'emergencyContactRelation' || step === 'emergencyContactPhone') {
    return Boolean(a.emergencyContactName);
  }
  return true;
};
const nextStep = (flow: Step[], step: Step, a: Answers): Step =>
  flow.slice(flow.indexOf(step) + 1).find((s) => applies(s, a)) ?? 'confirm';
const previousStep = (flow: Step[], step: Step, a: Answers): Step | null =>
  flow.slice(0, Math.max(flow.indexOf(step), 0)).findLast((s) => applies(s, a)) ?? null;
/** Numbered questions; the health note shares the health question's number. */
const numbered = (flow: Step[]) => flow.filter((s) => s !== 'healthNote' && s !== 'confirm');

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
/** Class types change rarely; re-read them at most this often. */
const CLASS_CACHE_MS = 60_000;
const ADDIS_ABABA = 'Addis Ababa';
const BAR_CELLS = 10;

const toLang = (value: string): BotLang => (value === 'en' ? 'en' : 'am');
const fullName = (a: Answers) =>
  [a.firstName, a.fatherName, a.grandfatherName].filter(Boolean).join(' ');
const localName = (x: { nameAm: string; nameEn: string }, lang: BotLang) =>
  lang === 'am' ? x.nameAm : x.nameEn;

/** Letters (any script), spaces, apostrophes, dots and hyphens; no digits or markup. */
const validName = (text: string) =>
  text.length >= 1 &&
  text.length <= 100 &&
  /\p{L}/u.test(text) &&
  !/[\d<>@#/\\_=+*{}[\]|~`"$%^&]/.test(text);

const keyFor = (labels: Record<string, string>, label: string) =>
  Object.entries(labels).find(([, text]) => text === label)?.[0];

/** Splits button labels into rows of `size`. */
const rows = (labels: string[], size: number) =>
  labels.reduce<string[][]>((out, label, i) => {
    if (i % size === 0) out.push([label]);
    else out.at(-1)!.push(label);
    return out;
  }, []);

/** ▰▰▰▱▱▱▱▱▱▱ */
const progressBar = (n: number, total: number) => {
  const filled = Math.max(1, Math.round((n / total) * BAR_CELLS));
  return '▰'.repeat(filled) + '▱'.repeat(BAR_CELLS - filled);
};

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
 * field of the member form (class placements included). Only offered to a
 * chat whose shared (Telegram-verified) number is on no member record, and
 * only while the office has it switched on in Settings. The conversation
 * lives in the database so any process can pick up the next answer.
 */
@Injectable()
export class TelegramRegistrationService {
  private readonly logger = new Logger('TelegramRegistration');
  private classCache: { at: number; classes: ClassOption[] } | null = null;
  private seal: Buffer | null = null;

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
    return this.ask(chatId, 'offer', {}, lang, phone, await this.classes());
  }

  /** The next message from a chat that is registering. */
  async onMessage(reg: Registration, message: TgMessage) {
    const lang = toLang(reg.language);
    const t = REG_TEXT[lang];
    const classes = await this.classes();
    const flow = flowFor(classes);
    const answers = (reg.answers ?? {}) as Answers;
    let step = reg.step as Step;
    // A class the office stopped offering mid-conversation: carry on after the classes.
    if (isClassStep(step) && !flow.includes(step)) step = REST[0];
    const input = (message.text ?? message.caption ?? '').trim();
    const photo = photoFrom(message);
    const ask = (s: Step, a: Answers) => this.ask(reg.chatId, s, a, lang, reg.phone, classes);

    if (step === 'submitting') return this.api.sendMessage(reg.chatId, t.wait);
    if (input === t.cancel || input === '/cancel') {
      return this.end(reg, lang, step === 'agreement' ? t.declined : t.cancelled);
    }
    if (!(await this.isOpen())) return this.end(reg, lang, t.closed);
    // /start, or a message with nothing to read, repeats the current question.
    if (input === '/start' || (input === '' && !photo)) return ask(step, answers);
    if (input === t.back && step !== 'offer') {
      const previous = previousStep(flow, step, answers) ?? step;
      await this.save(reg.id, previous, answers);
      return ask(previous, answers);
    }

    const outcome = this.accept(step, input, photo, answers, lang, classes);
    if ('error' in outcome) {
      await this.api.sendMessage(reg.chatId, `⚠️ ${outcome.error}`);
      return ask(step, answers);
    }
    if ('action' in outcome) {
      if (outcome.action === 'restart') {
        await this.save(reg.id, 'firstName', {});
        return ask('firstName', {});
      }
      return this.submit(reg, answers, lang, classes);
    }
    const next = step === 'offer' ? 'firstName' : nextStep(flow, step, outcome.answers);
    await this.save(reg.id, next, outcome.answers);
    return ask(next, outcome.answers);
  }

  /** Active class types that have at least one active grade, in form order. */
  private async classes(): Promise<ClassOption[]> {
    if (this.classCache && Date.now() - this.classCache.at < CLASS_CACHE_MS) {
      return this.classCache.classes;
    }
    const types = await this.prisma.classType.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        nameAm: true,
        nameEn: true,
        grades: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          select: { id: true, nameAm: true, nameEn: true },
        },
      },
    });
    const classes = types.filter((type) => type.grades.length > 0);
    this.classCache = { at: Date.now(), classes };
    return classes;
  }

  /** Validates one answer. */
  private accept(
    step: Step,
    input: string,
    photo: PhotoInput | undefined,
    a: Answers,
    lang: BotLang,
    classes: ClassOption[],
  ): Outcome {
    const t = REG_TEXT[lang];
    const skipped = isOptional(step) && input === t.skip;

    if (isClassStep(step)) {
      const typeId = classIdOf(step);
      const type = classes.find((c) => c.id === typeId);
      const grade = type?.grades.find((g) => localName(g, lang) === input);
      if (!skipped && !grade) return { error: t.invalid.choose };
      return {
        answers: { ...a, classGrades: { ...a.classGrades, [typeId]: grade ? grade.id : null } },
      };
    }

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

  /**
   * Sends the question for a step: a section header with a progress bar, the
   * question in bold with an example under it, the current answer when the
   * person came back to it, and the buttons that answer it.
   */
  private async ask(
    chatId: bigint,
    step: Step,
    a: Answers,
    lang: BotLang,
    phone: string,
    classes: ClassOption[],
  ) {
    const t = REG_TEXT[lang];
    const flow = flowFor(classes);
    const total = numbered(flow).length;

    if (step === 'offer') return this.sendOffer(chatId, phone, lang, total, classes.length > 0);
    if (step === 'submitting') return this.api.sendMessage(chatId, t.wait);
    if (step === 'confirm') {
      return this.api.sendMessage(
        chatId,
        this.summary(a, lang, phone, classes),
        buttons([[t.confirm], [t.back, t.restart], [t.cancel]]),
      );
    }

    const n = numbered(flow).indexOf(step === 'healthNote' ? 'health' : step) + 1;
    const section = isClassStep(step) ? 'classes' : SECTION[step];
    const header = `${t.sections[section]}\n<code>${progressBar(n, total)}</code>  <i>${n} / ${total}</i>`;
    const footer = step === 'firstName' ? [t.cancel] : [t.back, t.cancel];
    const skipRow = isOptional(step) ? [[t.skip]] : [];

    if (step === 'agreement') {
      const ag = AGREEMENT[lang];
      const body = [
        header,
        '',
        `<b>${ag.title}</b>`,
        `<blockquote>${ag.rules.map((rule, i) => `${i + 1}. ${rule}`).join('\n')}</blockquote>`,
        `<i>${ag.pledge}</i>`,
        '',
        `👉 ${t.agreementAsk}`,
      ].join('\n');
      return this.api.sendMessage(chatId, body, buttons([[t.agree], footer]));
    }

    let question: Ask;
    let options: string[][] = [];
    if (isClassStep(step)) {
      const type = classes.find((c) => c.id === classIdOf(step))!;
      question = t.classQuestion(esc(localName(type, lang)));
      const labels = type.grades.map((g) => localName(g, lang));
      options = rows(labels, labels.length > 6 ? 3 : 2);
    } else {
      question = (t.ask as Record<string, Ask>)[step]!;
      if (step === 'gender') options = [[t.male, t.female]];
      if (step === 'health') options = [[t.yes, t.no]];
      if (step === 'maritalStatus') options = rows(Object.values(t.maritalStatus), 2);
      if (step === 'educationLevel') options = rows(Object.values(t.education), 2);
      if (step === 'city') options = [[t.addisAbaba]];
    }

    const current = this.display(step, a, lang, classes);
    const body = [
      header,
      '',
      `<b>${question.q}</b>`,
      ...(question.hint ? [`<i>${question.hint}</i>`] : []),
      ...(isOptional(step) && !isClassStep(step) ? [`<i>${t.skipHint}</i>`] : []),
      ...(current ? ['', `↩️ ${t.current(esc(current))}`] : []),
    ].join('\n');
    return this.api.sendMessage(chatId, body, buttons([...options, ...skipRow, footer]));
  }

  /** The welcome card: the school seal, what will be asked, and how to start. */
  private async sendOffer(
    chatId: bigint,
    phone: string,
    lang: BotLang,
    total: number,
    hasClasses: boolean,
  ) {
    const t = REG_TEXT[lang];
    const s = t.sections;
    const caption = [
      t.offerTitle,
      '━━━━━━━━━━━━━━━',
      t.offer(esc(phone), total),
      '',
      t.offerSections,
      `<blockquote>${[
        s.personal,
        ...(hasClasses ? [s.classes] : []),
        s.contact,
        s.address,
        s.work,
        s.emergency,
        s.health,
        s.photo,
        s.agreement,
      ].join('\n')}</blockquote>`,
      t.offerFoot,
    ].join('\n');
    const keyboard = buttons([[t.start], [t.cancel]]);
    const seal = await this.sealImage();
    if (seal) return this.api.sendPhoto(chatId, seal, 'fikure-egzi.png', caption, keyboard);
    return this.api.sendMessage(chatId, caption, keyboard);
  }

  /** How an answer reads back to the person ("" when not answered yet). */
  private display(step: Step, a: Answers, lang: BotLang, classes: ClassOption[]): string {
    const t = REG_TEXT[lang];
    if (isClassStep(step)) {
      const typeId = classIdOf(step);
      if (!a.classGrades || !(typeId in a.classGrades)) return '';
      const gradeId = a.classGrades[typeId];
      const grade = classes.find((c) => c.id === typeId)?.grades.find((g) => g.id === gradeId);
      return grade ? localName(grade, lang) : t.fields.notAssigned;
    }
    if (isTextKey(step)) {
      if (!(step in a)) return '';
      const value = a[step];
      if (step === 'city' && value === ADDIS_ABABA) return t.addisAbaba;
      return value ?? t.fields.skipped;
    }
    switch (step) {
      case 'gender':
        return a.gender ? TEXT[lang].gender[a.gender]! : '';
      case 'dateOfBirth':
        return a.dateOfBirth ? ecDate(a.dateOfBirth, lang) : '';
      case 'maritalStatus':
        if (!('maritalStatus' in a)) return '';
        return a.maritalStatus ? t.maritalStatus[a.maritalStatus]! : t.fields.skipped;
      case 'educationLevel':
        if (!('educationLevel' in a)) return '';
        return a.educationLevel ? t.education[a.educationLevel]! : t.fields.skipped;
      case 'health':
        if (a.hasHealthCondition === undefined) return '';
        return a.hasHealthCondition ? t.yes : t.no;
      case 'healthNote':
        return a.healthConditionNote ?? '';
      case 'photo':
        if (!('photoFileId' in a)) return '';
        return a.photoFileId ? t.fields.photoSent : t.fields.skipped;
      default:
        return '';
    }
  }

  private summary(a: Answers, lang: BotLang, phone: string, classes: ClassOption[]): string {
    const t = REG_TEXT[lang];
    const f = t.fields;
    const s = t.sections;
    const sep = lang === 'am' ? '፦' : ':';
    const row = (label: string, value: string | null | undefined) =>
      `${label}${sep} <b>${value ? esc(value) : f.none}</b>`;
    const block = (title: string, lines: string[]) =>
      `${title}\n<blockquote>${lines.join('\n')}</blockquote>`;
    const city = a.city === ADDIS_ABABA ? t.addisAbaba : a.city;
    const classLines = classes.map((c) => {
      const gradeId = a.classGrades?.[c.id];
      const grade = c.grades.find((g) => g.id === gradeId);
      return row(localName(c, lang), grade ? localName(grade, lang) : f.notAssigned);
    });

    return [
      t.summaryTitle,
      '',
      block(s.personal, [
        row(f.name, fullName(a)),
        row(f.christianName, a.christianName),
        row(f.gender, a.gender && TEXT[lang].gender[a.gender]),
        row(f.birth, a.dateOfBirth && ecDate(a.dateOfBirth, lang)),
        row(f.placeOfBirth, a.placeOfBirth),
        row(f.maritalStatus, a.maritalStatus && t.maritalStatus[a.maritalStatus]),
        row(f.spiritualFather, a.spiritualFatherName),
      ]),
      ...(classLines.length > 0 ? [block(s.classes, classLines)] : []),
      block(s.contact, [
        row(f.phone, phone),
        row(f.alternatePhone, a.alternatePhone),
        row(f.email, a.email),
      ]),
      block(s.address, [
        row(f.city, city),
        row(f.subCity, a.subCity),
        row(f.woreda, a.woreda),
        row(f.kebele, a.kebele),
        row(f.houseNumber, a.houseNumber),
      ]),
      block(s.work, [
        row(f.education, a.educationLevel && t.education[a.educationLevel]),
        row(f.occupation, a.occupation),
      ]),
      block(s.emergency, [
        row(f.emergencyName, a.emergencyContactName),
        ...(a.emergencyContactName
          ? [
              row(f.emergencyRelation, a.emergencyContactRelation),
              row(f.emergencyPhone, a.emergencyContactPhone),
            ]
          : []),
      ]),
      block(`${s.health} · ${s.photo} · ${s.agreement}`, [
        row(f.health, a.hasHealthCondition ? a.healthConditionNote : f.noCondition),
        row(f.photo, a.photoFileId ? f.photoSent : null),
        row(f.agreement, f.accepted),
      ]),
      '',
      t.summaryHint,
    ].join('\n');
  }

  /** Creates the member and links the chat to them, so the bot's menu opens straight away. */
  private async submit(reg: Registration, a: Answers, lang: BotLang, classes: ClassOption[]) {
    const t = REG_TEXT[lang];
    // Claim the submission so a double tap cannot register the person twice.
    const claimed = await this.prisma.telegramRegistration.updateMany({
      where: { id: reg.id, step: 'confirm' },
      data: { step: 'submitting' },
    });
    if (claimed.count === 0) return;
    if (!a.firstName || !a.fatherName || !a.gender || !a.dateOfBirth || !a.agreed) {
      await this.save(reg.id, 'firstName', {});
      return this.ask(reg.chatId, 'firstName', {}, lang, reg.phone, classes);
    }
    // Only grades still offered: one retired mid-conversation is dropped, not an error.
    const offered = new Set(classes.flatMap((c) => c.grades.map((g) => g.id)));
    const classGradeIds = Object.values(a.classGrades ?? {}).filter(
      (id): id is number => id !== null && offered.has(id),
    );

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
          classGradeIds,
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

  private async sealImage(): Promise<Buffer | null> {
    try {
      this.seal ??= await readFile(resolve(process.cwd(), 'assets', 'telegram-seal.png'));
      return this.seal;
    } catch {
      return null;
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
