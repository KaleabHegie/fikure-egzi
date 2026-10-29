import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import QRCode from 'qrcode';
import { normalizeEthiopianPhone } from '../../common/transforms/string.transforms.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttendanceService } from '../attendance/attendance.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CoursesService } from '../courses/courses.service.js';
import { MembersService } from '../members/members.service.js';
import { type ReplyMarkup, TelegramApi, type TgMessage, type TgUpdate } from './telegram-api.js';
import { BRAND, type BotLang, ecDate, ecDateTime, esc, TEXT } from './telegram.texts.js';

type Link = {
  id: number;
  chatId: bigint;
  phone: string;
  memberId: number | null;
  language: string;
};
type PhoneMember = {
  id: number;
  memberCode: string;
  firstName: string;
  fatherName: string;
  grandfatherName: string | null;
};
type Action =
  'profile' | 'attendance' | 'courses' | 'qr' | 'switch' | 'language' | 'logout' | 'start';

const fullName = (m: Pick<PhoneMember, 'firstName' | 'fatherName' | 'grandfatherName'>) =>
  [m.firstName, m.fatherName, m.grandfatherName].filter(Boolean).join(' ');

/** Menu buttons and commands, in both languages, → what they do. */
const ACTIONS = new Map<string, Action>([
  ['/start', 'start'],
  ['/profile', 'profile'],
  ['/attendance', 'attendance'],
  ['/courses', 'courses'],
  ['/qr', 'qr'],
  ['/language', 'language'],
  ['/logout', 'logout'],
  ...(['am', 'en'] as const).flatMap((lang) =>
    (Object.entries(TEXT[lang].menu) as [Action, string][]).map(
      ([action, label]) => [label, action] as [string, Action],
    ),
  ),
]);

/**
 * The members' Telegram bot. A chat is let in only after sharing its own
 * Telegram contact whose phone number is on a member record; it then sees that
 * member's details, attendance, courses and QR code — read-only, nothing else.
 */
@Injectable()
export class TelegramBotService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('TelegramBot');
  private polling = false;
  private seal: Buffer | null = null;

  constructor(
    private readonly api: TelegramApi,
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly members: MembersService,
    private readonly attendance: AttendanceService,
    private readonly courses: CoursesService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    // Dev only: production receives updates by webhook.
    if (this.api.enabled && this.config.telegram.polling) void this.poll();
  }

  onApplicationShutdown() {
    this.polling = false;
  }

  /** Handles one update. Never throws: a failing update must not make Telegram retry forever. */
  async handle(update: TgUpdate): Promise<void> {
    try {
      if (update.callback_query) await this.onCallback(update.callback_query);
      else if (update.message) await this.onMessage(update.message);
    } catch (error) {
      this.logger.error(`Update ${update.update_id} failed: ${(error as Error).stack ?? error}`);
    }
  }

  // ── Messages ─────────────────────────────────────────────────────────────

  private async onMessage(message: TgMessage) {
    // Personal data: private chats only, never groups.
    if (message.chat.type !== 'private' || !message.from) return;
    const chatId = BigInt(message.chat.id);
    const link = await this.prisma.telegramLink.findUnique({ where: { chatId } });
    const lang: BotLang = link
      ? toLang(link.language)
      : message.from.language_code?.startsWith('en')
        ? 'en'
        : 'am';

    if (message.contact) return this.onContact(message, lang, link);
    if (!link) return this.welcome(chatId, lang);

    const action =
      ACTIONS.get((message.text ?? '').trim().split(/\s|@/)[0] ?? '') ??
      ACTIONS.get((message.text ?? '').trim());
    if (action === 'logout') return this.logout(link, lang);
    if (action === 'language') return this.toggleLanguage(link);

    const people = await this.peopleFor(link);
    if (!people) return;
    const member = await this.current(link, people, lang);
    if (!member) return;

    switch (action) {
      case 'profile':
        return this.profile(link, member, people.length, lang);
      case 'attendance':
        return this.attendanceReport(link, member, people.length, lang);
      case 'courses':
        return this.courseReport(link, member, people.length, lang);
      case 'qr':
        return this.qr(link, member, people.length, lang);
      case 'switch':
        return this.askWhich(link, people, lang);
      case 'start':
        return this.api.sendMessage(
          chatId,
          TEXT[lang].linked(esc(fullName(member))),
          menu(lang, people.length),
        );
      default:
        return this.api.sendMessage(chatId, TEXT[lang].help, menu(lang, people.length));
    }
  }

  /** The chat shares a contact: it must be its own, and the number must be on a member record. */
  private async onContact(message: TgMessage, lang: BotLang, existing: Link | null) {
    const chatId = BigInt(message.chat.id);
    const contact = message.contact!;
    // Telegram verifies a user's own number; a forwarded contact card proves nothing.
    if (contact.user_id !== message.from!.id) {
      return this.api.sendMessage(chatId, TEXT[lang].shareOwn, shareKeyboard(lang));
    }
    const phone = normalizeEthiopianPhone(contact.phone_number);
    const people = await this.membersWithPhone(phone);
    if (people.length === 0) {
      if (existing) await this.prisma.telegramLink.delete({ where: { id: existing.id } });
      return this.api.sendMessage(
        chatId,
        TEXT[lang].notRegistered(esc(phone)),
        shareKeyboard(lang),
      );
    }
    const memberId = people.length === 1 ? people[0]!.id : null;
    const link = await this.prisma.telegramLink.upsert({
      where: { chatId },
      create: { chatId, telegramUserId: BigInt(message.from!.id), phone, memberId, language: lang },
      update: { telegramUserId: BigInt(message.from!.id), phone, memberId },
    });
    await this.audit.record({
      userId: null,
      action: 'LOGIN',
      entity: 'TelegramBot',
      entityId: memberId ?? people[0]!.id,
      changes: { members: people.map((p) => p.memberCode) },
    });
    if (memberId === null) return this.askWhich(link, people, lang);
    return this.api.sendMessage(
      chatId,
      TEXT[lang].linked(esc(fullName(people[0]!))),
      menu(lang, 1),
    );
  }

  private async onCallback(query: NonNullable<TgUpdate['callback_query']>) {
    await this.api.answerCallback(query.id);
    const chatId = query.message?.chat.id;
    if (!chatId || query.message?.chat.type !== 'private') return;
    const link = await this.prisma.telegramLink.findUnique({ where: { chatId: BigInt(chatId) } });
    if (!link) return this.welcome(BigInt(chatId), 'am');
    const lang = toLang(link.language);
    const match = /^m:(\d+)$/.exec(query.data ?? '');
    if (!match) return;
    const people = await this.peopleFor(link);
    const chosen = people?.find((p) => p.id === Number(match[1]));
    if (!people || !chosen) return;
    await this.prisma.telegramLink.update({
      where: { id: link.id },
      data: { memberId: chosen.id },
    });
    return this.api.sendMessage(
      link.chatId,
      TEXT[lang].linked(esc(fullName(chosen))),
      menu(lang, people.length),
    );
  }

  // ── Access ───────────────────────────────────────────────────────────────

  private membersWithPhone(phone: string): Promise<PhoneMember[]> {
    if (!/^0[79]\d{8}$/.test(phone)) return Promise.resolve([]);
    return this.prisma.member.findMany({
      where: { deletedAt: null, OR: [{ phone }, { alternatePhone: phone }] },
      select: {
        id: true,
        memberCode: true,
        firstName: true,
        fatherName: true,
        grandfatherName: true,
      },
      orderBy: [{ firstName: 'asc' }, { fatherName: 'asc' }],
    });
  }

  /** Re-checked on every message: if the number left the records, access ends. */
  private async peopleFor(link: Link): Promise<PhoneMember[] | null> {
    const people = await this.membersWithPhone(link.phone);
    if (people.length > 0) return people;
    await this.prisma.telegramLink.delete({ where: { id: link.id } });
    await this.api.sendMessage(
      link.chatId,
      TEXT[toLang(link.language)].accessEnded,
      shareKeyboard(toLang(link.language)),
    );
    return null;
  }

  private async current(
    link: Link,
    people: PhoneMember[],
    lang: BotLang,
  ): Promise<PhoneMember | null> {
    const chosen = people.find((p) => p.id === link.memberId);
    if (chosen) return chosen;
    if (people.length === 1) {
      await this.prisma.telegramLink.update({
        where: { id: link.id },
        data: { memberId: people[0]!.id },
      });
      return people[0]!;
    }
    await this.askWhich(link, people, lang);
    return null;
  }

  private askWhich(link: Pick<Link, 'chatId'>, people: PhoneMember[], lang: BotLang) {
    return this.api.sendMessage(link.chatId, TEXT[lang].pickMember, {
      inline_keyboard: people.map((p) => [
        { text: `${fullName(p)} · ${p.memberCode}`, callback_data: `m:${p.id}` },
      ]),
    });
  }

  private async welcome(chatId: bigint, lang: BotLang) {
    const caption = TEXT[lang].welcome(BRAND[lang]);
    const seal = await this.sealImage();
    if (seal)
      return this.api.sendPhoto(chatId, seal, 'fikure-egzi.png', caption, shareKeyboard(lang));
    return this.api.sendMessage(chatId, caption, shareKeyboard(lang));
  }

  private async logout(link: Link, lang: BotLang) {
    await this.prisma.telegramLink.delete({ where: { id: link.id } });
    return this.api.sendMessage(link.chatId, TEXT[lang].loggedOut, shareKeyboard(lang));
  }

  private async toggleLanguage(link: Link) {
    const lang: BotLang = link.language === 'en' ? 'am' : 'en';
    await this.prisma.telegramLink.update({ where: { id: link.id }, data: { language: lang } });
    const people = await this.membersWithPhone(link.phone);
    return this.api.sendMessage(link.chatId, TEXT[lang].languageSet, menu(lang, people.length));
  }

  // ── Screens ──────────────────────────────────────────────────────────────

  private async profile(link: Link, who: PhoneMember, count: number, lang: BotLang) {
    const t = TEXT[lang];
    const m = await this.members.findOne(who.id);
    const name = (x: { nameAm: string; nameEn: string }) => (lang === 'am' ? x.nameAm : x.nameEn);
    const group = await this.prisma.serviceGroupMember.findFirst({
      where: { memberId: who.id, term: { isCurrent: true } },
      select: { group: { select: { nameAm: true, nameEn: true } } },
    });
    const line = (label: string, value: unknown) =>
      `<b>${label}:</b> ${esc(value || t.profile.none)}`;
    const lines = [
      `${t.profile.title}`,
      `<b>${esc(fullName(m))}</b>`,
      '',
      line(t.profile.code, m.memberCode),
      line(t.profile.christianName, m.christianName),
      line(t.profile.gender, t.gender[m.gender]),
      line(t.profile.birth, m.dateOfBirth ? ecDate(m.dateOfBirth, lang) : null),
      line(t.profile.phone, m.phone),
      line(t.profile.status, t.memberStatus[m.status]),
      line(t.profile.joined, m.joinedAt ? ecDate(m.joinedAt, lang) : null),
      line(
        t.profile.classes,
        m.classes.map((c) => `${name(c.classType)} · ${name(c.classGrade)}`).join('، '),
      ),
      line(
        t.profile.departments,
        m.departments.map((d) => `${name(d.department)} (${t.roles[d.role] ?? d.role})`).join('، '),
      ),
      ...(group ? [line(t.profile.group, name(group.group))] : []),
    ];
    return this.api.sendMessage(link.chatId, lines.join('\n'), menu(lang, count));
  }

  private async attendanceReport(link: Link, who: PhoneMember, count: number, lang: BotLang) {
    const t = TEXT[lang].attendance;
    const from = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
    const s = await this.attendance.memberSummary(who.id, null, from);
    if (s.sessions === 0) {
      return this.api.sendMessage(
        link.chatId,
        `${t.title}\n<b>${esc(fullName(who))}</b>\n\n${t.empty}`,
        menu(lang, count),
      );
    }
    const recent = s.records
      .slice(0, 10)
      .map(
        (r) =>
          `• ${ecDateTime(new Date(r.startsAt), lang)} — ${esc(r.title)}\n   ${TEXT[lang].statuses[r.status] ?? r.status}`,
      );
    const text = [
      t.title,
      `<b>${esc(fullName(who))}</b>`,
      '',
      t.summary(s.present, s.late, s.absent, s.excused),
      ...(s.rate !== null ? [t.rate(`${s.rate}%`)] : []),
      '',
      `<b>${t.recent}</b>`,
      ...recent,
    ].join('\n');
    return this.api.sendMessage(link.chatId, text, menu(lang, count));
  }

  private async courseReport(link: Link, who: PhoneMember, count: number, lang: BotLang) {
    const t = TEXT[lang].courses;
    const { taking, teaching } = await this.courses.memberCourses(who.id);
    const name = (x: { nameAm: string; nameEn: string }) => (lang === 'am' ? x.nameAm : x.nameEn);
    const teacherNames = (list: { fullName: string }[]) => list.map((x) => x.fullName).join('، ');
    const blocks: string[] = [`${t.title}\n<b>${esc(fullName(who))}</b>`];
    if (teaching.length > 0) {
      blocks.push(
        `<b>${t.teaching}</b>\n` +
          teaching
            .map(
              (r) =>
                `• <b>${esc(name(r.course))}</b> — ${esc(name(r.classGrade.classType))} · ${esc(name(r.classGrade))}\n` +
                `   ${ecDate(r.startDate, lang)} – ${ecDate(r.endDate, lang)} · ${t.students(r.students)}`,
            )
            .join('\n'),
      );
    }
    if (taking.length > 0) {
      blocks.push(
        taking
          .map((r) => {
            const marks =
              r.marks.length === 0
                ? t.noAssessments
                : r.marks.map((m) => `${esc(m.name)} ${m.score ?? '—'}/${m.maxScore}`).join(' · ');
            const result =
              r.total === null
                ? t.noMarks
                : `${t.total}: <b>${r.total}/${r.totalMax}</b> ${r.result === 'PASS' ? t.pass : r.result === 'FAIL' ? t.fail : `(${t.pending})`}`;
            return [
              `• <b>${esc(name(r.course))}</b> ${t.phases[r.phase] ?? ''}`,
              `   ${esc(name(r.classGrade))} · ${ecDate(r.startDate, lang)} – ${ecDate(r.endDate, lang)}`,
              ...(r.teachers.length ? [`   ${t.teachers}: ${esc(teacherNames(r.teachers))}`] : []),
              `   ${marks}`,
              `   ${result}`,
            ].join('\n');
          })
          .join('\n\n'),
      );
    }
    if (teaching.length === 0 && taking.length === 0) blocks.push(t.empty);
    return this.api.sendMessage(link.chatId, blocks.join('\n\n'), menu(lang, count));
  }

  private async qr(link: Link, who: PhoneMember, count: number, lang: BotLang) {
    // Same content as the printed QR tiles: just the member ID.
    const png = await QRCode.toBuffer(who.memberCode, {
      type: 'png',
      width: 600,
      margin: 2,
      errorCorrectionLevel: 'M',
    });
    return this.api.sendPhoto(
      link.chatId,
      png,
      `${who.memberCode}.png`,
      TEXT[lang].qrCaption(esc(fullName(who)), esc(who.memberCode)),
      menu(lang, count),
    );
  }

  // ── Plumbing ─────────────────────────────────────────────────────────────

  private async sealImage(): Promise<Buffer | null> {
    if (this.seal) return this.seal;
    try {
      this.seal = await readFile(resolve(process.cwd(), 'assets', 'telegram-seal.png'));
      return this.seal;
    } catch {
      return null;
    }
  }

  /** Dev: long-poll Telegram (TELEGRAM_POLLING=true) so the bot works without a public URL. */
  private async poll() {
    this.polling = true;
    await this.api.call('deleteWebhook', { drop_pending_updates: false });
    this.logger.log('Polling Telegram for updates (dev)');
    let offset = 0;
    while (this.polling) {
      const updates = await this.api.call<TgUpdate[]>('getUpdates', {
        offset,
        timeout: 30,
        allowed_updates: ['message', 'callback_query'],
      });
      if (!updates) {
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      for (const update of updates) {
        offset = update.update_id + 1;
        await this.handle(update);
      }
    }
  }
}

const toLang = (value: string): BotLang => (value === 'en' ? 'en' : 'am');

function shareKeyboard(lang: BotLang): ReplyMarkup {
  return {
    keyboard: [[{ text: TEXT[lang].shareButton, request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

function menu(lang: BotLang, memberCount: number): ReplyMarkup {
  const m = TEXT[lang].menu;
  return {
    keyboard: [
      [{ text: m.profile }, { text: m.attendance }],
      [{ text: m.courses }, { text: m.qr }],
      ...(memberCount > 1 ? [[{ text: m.switch }]] : []),
      [{ text: m.language }, { text: m.logout }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}
