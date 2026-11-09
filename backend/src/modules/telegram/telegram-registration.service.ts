import { Injectable, Logger } from '@nestjs/common';
import { isEmail } from 'class-validator';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ValidationFailedException } from '../../common/filters/all-exceptions.filter.js';
import {
  ETHIOPIAN_PHONE_REGEX,
  normalizeEthiopianPhone,
} from '../../common/transforms/string.transforms.js';
import { dateOnly, todayIso } from '../../common/utils/dates.js';
import { parseEcDate } from '../../common/utils/ethiopian-calendar.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { EducationLevel, MaritalStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { openServicePeriod } from '../history/history.writer.js';
import { MAX_PHOTO_BYTES, MembersService } from '../members/members.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { TelegramApi, type TgMessage } from './telegram-api.js';
import { buttons, menu, shareKeyboard } from './telegram.keyboards.js';
import { type Ask, REG_TEXT } from './telegram-registration.texts.js';
import { type BotLang, ecDate, esc, TEXT } from './telegram.texts.js';

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

/** Everything after classes and departments: the rest of the form, then health and photo. */
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
] as const;

type Question = (typeof PERSONAL)[number] | (typeof REST)[number];
/** One question per class type: which grade the person is in. */
type ClassStep = `class:${number}`;
/** One per chosen class that has an agreement (e.g. the Mezmur class's code of conduct). */
type AgreementStep = `agreement:${number}`;
type Step =
  'offer' | Question | ClassStep | 'departments' | AgreementStep | 'confirm' | 'submitting';
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
const isAgreementStep = (step: Step): step is AgreementStep => step.startsWith('agreement:');
const agreementClassOf = (step: AgreementStep) => Number(step.slice('agreement:'.length));
const OPTIONAL_CHOICES = new Set<Step>(['maritalStatus', 'educationLevel', 'photo']);
const isOptional = (step: Step) =>
  (isTextKey(step) && TEXT_RULES[step].optional) ||
  OPTIONAL_CHOICES.has(step) ||
  isClassStep(step) ||
  step === 'departments';

type Answers = { [K in TextKey]?: string | null } & {
  gender?: 'MALE' | 'FEMALE';
  dateOfBirth?: string;
  maritalStatus?: MaritalStatus | null;
  educationLevel?: EducationLevel | null;
  /** classTypeId → classGradeId (null = not placed). */
  classGrades?: Record<string, number | null>;
  /** Service departments the person says they serve in. */
  departmentIds?: number[];
  hasHealthCondition?: boolean;
  healthConditionNote?: string | null;
  photoFileId?: string | null;
  /** Class agreements accepted (agreement ids). */
  agreementIds?: number[];
};

/** A class type offered on the member form, with its grades. */
type ClassOption = {
  id: number;
  nameAm: string;
  nameEn: string;
  grades: { id: number; nameAm: string; nameEn: string }[];
  agreement: {
    id: number;
    titleAm: string;
    titleEn: string;
    rulesAm: string;
    rulesEn: string;
    pledgeAm: string | null;
    pledgeEn: string | null;
  } | null;
};

/** A service department a member can be on the roster of. */
type DepartmentOption = { id: number; nameAm: string; nameEn: string };

/** What the office currently offers; the class and department questions follow it. */
type Catalog = { classes: ClassOption[]; departments: DepartmentOption[] };

/** The questions for this conversation. */
const flowFor = (catalog: Catalog): Step[] => [
  ...PERSONAL,
  ...catalog.classes.map((c): ClassStep => `class:${c.id}`),
  ...(catalog.departments.length > 0 ? (['departments'] as const) : []),
  ...REST,
  ...catalog.classes.filter((c) => c.agreement).map((c): AgreementStep => `agreement:${c.id}`),
  'confirm',
];

/** Follow-up questions are asked only when their lead question was answered. */
const applies = (step: Step, a: Answers) => {
  if (step === 'healthNote') return a.hasHealthCondition === true;
  if (step === 'emergencyContactRelation' || step === 'emergencyContactPhone') {
    return Boolean(a.emergencyContactName);
  }
  // A class's agreement is asked only of those placed in that class.
  if (isAgreementStep(step)) return typeof a.classGrades?.[agreementClassOf(step)] === 'number';
  return true;
};
const nextStep = (flow: Step[], step: Step, a: Answers): Step =>
  flow.slice(flow.indexOf(step) + 1).find((s) => applies(s, a)) ?? 'confirm';
const previousStep = (flow: Step[], step: Step, a: Answers): Step | null =>
  flow.slice(0, Math.max(flow.indexOf(step), 0)).findLast((s) => applies(s, a)) ?? null;
/**
 * Numbered questions; the health note shares the health question's number, and
 * an agreement counts once the person is in its class.
 */
const numbered = (flow: Step[], a: Answers) =>
  flow.filter(
    (s) => s !== 'healthNote' && s !== 'confirm' && (!isAgreementStep(s) || applies(s, a)),
  );

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
/** Classes and departments change rarely; re-read them at most this often. */
const CATALOG_CACHE_MS = 60_000;
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

/** `stay` keeps the same question open (a pick-several question that is still being answered). */
type Outcome =
  { answers: Answers; stay?: boolean } | { error: string } | { action: 'restart' | 'submit' };

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
  private catalogCache: { at: number; catalog: Catalog } | null = null;
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
    return this.ask(chatId, 'offer', {}, lang, phone, await this.catalog());
  }

  /** The next message from a chat that is registering. */
  async onMessage(reg: Registration, message: TgMessage) {
    const lang = toLang(reg.language);
    const t = REG_TEXT[lang];
    const catalog = await this.catalog();
    const flow = flowFor(catalog);
    const answers = (reg.answers ?? {}) as Answers;
    let step = reg.step as Step;
    // A class, the departments or an agreement no longer offered mid-conversation: move on.
    if ((isClassStep(step) || step === 'departments') && !flow.includes(step)) step = REST[0];
    if (isAgreementStep(step) && !flow.includes(step)) step = 'confirm';
    const input = (message.text ?? message.caption ?? '').trim();
    const photo = photoFrom(message);
    const ask = (s: Step, a: Answers) => this.ask(reg.chatId, s, a, lang, reg.phone, catalog);

    if (step === 'submitting') return this.api.sendMessage(reg.chatId, t.wait);
    if (input === t.cancel || input === '/cancel') {
      return this.end(reg, lang, t.cancelled);
    }
    if (!(await this.isOpen())) return this.end(reg, lang, t.closed);
    // /start, or a message with nothing to read, repeats the current question.
    if (input === '/start' || (input === '' && !photo)) return ask(step, answers);
    if (input === t.back && step !== 'offer') {
      const previous = previousStep(flow, step, answers) ?? step;
      await this.save(reg.id, previous, answers);
      return ask(previous, answers);
    }

    const outcome = this.accept(step, input, photo, answers, lang, catalog);
    if ('error' in outcome) {
      await this.api.sendMessage(reg.chatId, `⚠️ ${outcome.error}`);
      return ask(step, answers);
    }
    if ('action' in outcome) {
      if (outcome.action === 'restart') {
        await this.save(reg.id, 'firstName', {});
        return ask('firstName', {});
      }
      return this.submit(reg, answers, lang, catalog);
    }
    const next =
      step === 'offer' ? 'firstName' : outcome.stay ? step : nextStep(flow, step, outcome.answers);
    await this.save(reg.id, next, outcome.answers);
    return ask(next, outcome.answers);
  }

  /**
   * Active class types that have at least one active grade, and the active
   * service departments in tree order (the top office itself is not offered).
   */
  private async catalog(): Promise<Catalog> {
    if (this.catalogCache && Date.now() - this.catalogCache.at < CATALOG_CACHE_MS) {
      return this.catalogCache.catalog;
    }
    const [types, departments] = await Promise.all([
      this.prisma.classType.findMany({
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
          agreement: {
            select: {
              id: true,
              titleAm: true,
              titleEn: true,
              rulesAm: true,
              rulesEn: true,
              pledgeAm: true,
              pledgeEn: true,
            },
          },
        },
      }),
      this.prisma.department.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: { id: true, parentId: true, nameAm: true, nameEn: true },
      }),
    ]);
    // Depth-first from the top, so sub-departments follow their parent.
    const ordered: DepartmentOption[] = [];
    const visit = (parentId: number | null, depth: number) => {
      for (const d of departments.filter((x) => x.parentId === parentId)) {
        if (depth > 0) ordered.push({ id: d.id, nameAm: d.nameAm, nameEn: d.nameEn });
        visit(d.id, depth + 1);
      }
    };
    visit(null, 0);
    const catalog = {
      classes: types.filter((type) => type.grades.length > 0),
      departments: ordered,
    };
    this.catalogCache = { at: Date.now(), catalog };
    return catalog;
  }

  /** Validates one answer. */
  private accept(
    step: Step,
    input: string,
    photo: PhotoInput | undefined,
    a: Answers,
    lang: BotLang,
    catalog: Catalog,
  ): Outcome {
    const t = REG_TEXT[lang];
    const skipped = isOptional(step) && input === t.skip;

    if (step === 'departments') {
      const chosen = a.departmentIds ?? [];
      if (skipped) return { answers: { ...a, departmentIds: [] } };
      if (input === t.departmentsDone) return { answers: { ...a, departmentIds: chosen } };
      // Buttons carry a ✅/▫️ mark in front of the name; tapping one toggles it.
      const name = input.replace(/^(✅|▫️)\s*/u, '');
      const department = catalog.departments.find((d) => localName(d, lang) === name);
      if (!department) return { error: t.invalid.choose };
      const departmentIds = chosen.includes(department.id)
        ? chosen.filter((id) => id !== department.id)
        : [...chosen, department.id];
      return { answers: { ...a, departmentIds }, stay: true };
    }

    if (isAgreementStep(step)) {
      const typeId = agreementClassOf(step);
      const type = catalog.classes.find((c) => c.id === typeId);
      if (!type?.agreement) return { error: t.invalid.choose };
      const agreementId = type.agreement.id;
      const others = (a.agreementIds ?? []).filter((id) => id !== agreementId);
      if (input === t.agree) return { answers: { ...a, agreementIds: [...others, agreementId] } };
      // Not accepting means not joining that class; the registration carries on.
      if (input === t.skipClass(localName(type, lang))) {
        return {
          answers: {
            ...a,
            classGrades: { ...a.classGrades, [typeId]: null },
            agreementIds: others,
          },
        };
      }
      return { error: t.invalid.choose };
    }

    if (isClassStep(step)) {
      const typeId = classIdOf(step);
      const type = catalog.classes.find((c) => c.id === typeId);
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
    catalog: Catalog,
  ) {
    const t = REG_TEXT[lang];
    const flow = flowFor(catalog);
    const counted = numbered(flow, a);
    const total = counted.length;

    if (step === 'offer') return this.sendOffer(chatId, phone, lang, total, catalog);
    if (step === 'submitting') return this.api.sendMessage(chatId, t.wait);
    if (step === 'confirm') {
      return this.api.sendMessage(
        chatId,
        this.summary(a, lang, phone, catalog),
        buttons([[t.confirm], [t.back, t.restart], [t.cancel]]),
      );
    }

    const n = counted.indexOf(step === 'healthNote' ? 'health' : step) + 1;
    const section = isClassStep(step)
      ? 'classes'
      : step === 'departments'
        ? 'service'
        : isAgreementStep(step)
          ? 'agreement'
          : SECTION[step];
    const header = `${t.sections[section]}\n<code>${progressBar(n, total)}</code>  <i>${n} / ${total}</i>`;
    const footer = step === 'firstName' ? [t.cancel] : [t.back, t.cancel];
    const skipRow = isOptional(step) ? [[t.skip]] : [];

    if (isAgreementStep(step)) {
      const type = catalog.classes.find((c) => c.id === agreementClassOf(step))!;
      const ag = type.agreement!;
      const className = localName(type, lang);
      const title = lang === 'am' ? ag.titleAm : ag.titleEn;
      const rules = (lang === 'am' ? ag.rulesAm : ag.rulesEn)
        .split('\n')
        .map((rule) => rule.trim())
        .filter(Boolean);
      const pledge = lang === 'am' ? ag.pledgeAm : ag.pledgeEn;
      const body = [
        header,
        '',
        `📚 <b>${esc(t.agreementFor(className))}</b>`,
        `<i>${esc(t.agreementIntro(className))}</i>`,
        '',
        `<b>${esc(title)}</b>`,
        `<blockquote>${rules.map((rule, i) => `${i + 1}. ${esc(rule)}`).join('\n')}</blockquote>`,
        ...(pledge ? [`<i>${esc(pledge)}</i>`] : []),
        '',
        `👉 ${esc(t.agreementAsk(className))}`,
      ].join('\n');
      return this.api.sendMessage(
        chatId,
        body,
        buttons([[t.agree], [t.skipClass(className)], footer]),
      );
    }

    if (step === 'departments') {
      const chosen = catalog.departments.filter((d) => a.departmentIds?.includes(d.id));
      const labels = catalog.departments.map(
        (d) => `${chosen.includes(d) ? '✅' : '▫️'} ${localName(d, lang)}`,
      );
      const body = [
        header,
        '',
        `<b>${t.departmentsAsk.q}</b>`,
        `<i>${t.departmentsAsk.hint}</i>`,
        `<i>${t.departmentsNone}</i>`,
        ...(chosen.length > 0
          ? ['', t.departmentsChosen(esc(chosen.map((d) => localName(d, lang)).join('፣ ')))]
          : []),
      ].join('\n');
      return this.api.sendMessage(
        chatId,
        body,
        buttons([...rows(labels, 2), chosen.length > 0 ? [t.departmentsDone] : [t.skip], footer]),
      );
    }

    let question: Ask;
    let options: string[][] = [];
    if (isClassStep(step)) {
      const type = catalog.classes.find((c) => c.id === classIdOf(step))!;
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

    const current = this.display(step, a, lang, catalog);
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
    catalog: Catalog,
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
        ...(catalog.classes.length > 0 ? [s.classes] : []),
        ...(catalog.departments.length > 0 ? [s.service] : []),
        s.contact,
        s.address,
        s.work,
        s.emergency,
        s.health,
        s.photo,
        ...(catalog.classes.some((c) => c.agreement) ? [s.agreement] : []),
      ].join('\n')}</blockquote>`,
      t.offerFoot,
    ].join('\n');
    const keyboard = buttons([[t.start], [t.cancel]]);
    const seal = await this.sealImage();
    if (seal) return this.api.sendPhoto(chatId, seal, 'fikure-egzi.png', caption, keyboard);
    return this.api.sendMessage(chatId, caption, keyboard);
  }

  /** How an answer reads back to the person ("" when not answered yet). */
  private display(step: Step, a: Answers, lang: BotLang, catalog: Catalog): string {
    const t = REG_TEXT[lang];
    if (step === 'departments' || isAgreementStep(step)) return '';
    if (isClassStep(step)) {
      const typeId = classIdOf(step);
      if (!a.classGrades || !(typeId in a.classGrades)) return '';
      const gradeId = a.classGrades[typeId];
      const grade = catalog.classes
        .find((c) => c.id === typeId)
        ?.grades.find((g) => g.id === gradeId);
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

  private summary(a: Answers, lang: BotLang, phone: string, catalog: Catalog): string {
    const t = REG_TEXT[lang];
    const f = t.fields;
    const s = t.sections;
    const sep = lang === 'am' ? '፦' : ':';
    const row = (label: string, value: string | null | undefined) =>
      `${label}${sep} <b>${value ? esc(value) : f.none}</b>`;
    const block = (title: string, lines: string[]) =>
      `${title}\n<blockquote>${lines.join('\n')}</blockquote>`;
    const city = a.city === ADDIS_ABABA ? t.addisAbaba : a.city;
    const accepted = acceptedClasses(catalog, a);
    const classLines = catalog.classes.map((c) => {
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
      ...(catalog.departments.length > 0
        ? [
            block(s.service, [
              catalog.departments
                .filter((d) => a.departmentIds?.includes(d.id))
                .map((d) => `▸ <b>${esc(localName(d, lang))}</b>`)
                .join('\n') || f.notServing,
            ]),
          ]
        : []),
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
      block(
        accepted.length > 0
          ? `${s.health} · ${s.photo} · ${s.agreement}`
          : `${s.health} · ${s.photo}`,
        [
          row(f.health, a.hasHealthCondition ? a.healthConditionNote : f.noCondition),
          row(f.photo, a.photoFileId ? f.photoSent : null),
          ...accepted.map((c) => row(t.agreementFor(localName(c, lang)), f.accepted)),
        ],
      ),
      '',
      t.summaryHint,
    ].join('\n');
  }

  /** Creates the member and links the chat to them, so the bot's menu opens straight away. */
  private async submit(reg: Registration, a: Answers, lang: BotLang, catalog: Catalog) {
    const t = REG_TEXT[lang];
    // Claim the submission so a double tap cannot register the person twice.
    const claimed = await this.prisma.telegramRegistration.updateMany({
      where: { id: reg.id, step: 'confirm' },
      data: { step: 'submitting' },
    });
    if (claimed.count === 0) return;
    const { firstName, fatherName, gender, dateOfBirth } = a;
    if (!firstName || !fatherName || !gender || !dateOfBirth) {
      await this.save(reg.id, 'firstName', {});
      return this.ask(reg.chatId, 'firstName', {}, lang, reg.phone, catalog);
    }
    // Only grades and departments still offered: one retired mid-conversation is dropped.
    const offered = new Set(catalog.classes.flatMap((c) => c.grades.map((g) => g.id)));
    const classGradeIds = Object.values(a.classGrades ?? {}).filter(
      (id): id is number => id !== null && offered.has(id),
    );
    const departmentIds = (a.departmentIds ?? []).filter((id) =>
      catalog.departments.some((d) => d.id === id),
    );
    // A class's agreement only counts while the person is placed in that class.
    const agreementIds = acceptedClasses(catalog, a).map((c) => c.agreement!.id);

    try {
      // Member, roster places, history and chat link commit together.
      const member = await this.prisma.$transaction(async (tx) => {
        const created = await this.members.create(
          {
            firstName,
            fatherName,
            grandfatherName: a.grandfatherName ?? null,
            christianName: a.christianName ?? null,
            gender,
            dateOfBirth,
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
            emergencyContactPhone: a.emergencyContactName
              ? (a.emergencyContactPhone ?? null)
              : null,
            hasHealthCondition: a.hasHealthCondition ?? null,
            healthConditionNote: a.healthConditionNote ?? null,
            agreementIds,
            classGradeIds,
          },
          null,
          null,
          tx,
          { selfRegistered: true },
        );
        // Self-registered people join as ordinary members; the department sets any role.
        const joinedAt = dateOnly(todayIso());
        for (const departmentId of departmentIds) {
          await tx.departmentMembership.create({
            data: { departmentId, memberId: created.id, role: 'MEMBER', joinedAt },
          });
          await openServicePeriod(
            tx,
            { memberId: created.id, departmentId, role: 'MEMBER' },
            joinedAt,
            null,
          );
        }
        await tx.telegramRegistration.delete({ where: { id: reg.id } });
        await tx.telegramLink.upsert({
          where: { chatId: reg.chatId },
          create: {
            chatId: reg.chatId,
            telegramUserId: reg.telegramUserId,
            phone: reg.phone,
            memberId: created.id,
            language: lang,
          },
          update: { phone: reg.phone, memberId: created.id },
        });
        return created;
      });
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

/** Classes the person is placed in whose agreement they accepted. */
function acceptedClasses(catalog: Catalog, a: Answers): ClassOption[] {
  return catalog.classes.filter(
    (c) =>
      c.agreement &&
      typeof a.classGrades?.[c.id] === 'number' &&
      (a.agreementIds ?? []).includes(c.agreement.id),
  );
}
