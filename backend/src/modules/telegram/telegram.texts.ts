import { gcIsoToEc } from '../../common/utils/ethiopian-calendar.js';
import { formatEthTime } from '../../common/utils/ethiopian-time.js';

export type BotLang = 'am' | 'en';

export const BRAND = {
  am: 'ፍቁረ እግዚእ ሰንበት ትምህርት ቤት',
  en: 'Fikure Egzi Sunday School',
};

const MONTHS = {
  am: [
    'መስከረም',
    'ጥቅምት',
    'ኅዳር',
    'ታኅሣሥ',
    'ጥር',
    'የካቲት',
    'መጋቢት',
    'ሚያዝያ',
    'ግንቦት',
    'ሰኔ',
    'ሐምሌ',
    'ነሐሴ',
    'ጳጉሜ',
  ],
  en: [
    'Meskerem',
    'Tikimt',
    'Hidar',
    'Tahsas',
    'Tir',
    'Yekatit',
    'Megabit',
    'Miazia',
    'Ginbot',
    'Sene',
    'Hamle',
    'Nehase',
    'Pagume',
  ],
};

/** Gregorian date/timestamp → Ethiopian calendar, like the web app ("ጥቅምት 18 ቀን 2019 ዓ.ም"). */
export function ecDate(value: Date | string, lang: BotLang): string {
  const iso = typeof value === 'string' ? value.slice(0, 10) : addisIso(value);
  const ec = gcIsoToEc(iso);
  const month = MONTHS[lang][ec.month - 1];
  return lang === 'am' ? `${month} ${ec.day} ቀን ${ec.year} ዓ.ም` : `${month} ${ec.day}, ${ec.year}`;
}

/** A timestamp's Addis Ababa date and Ethiopian clock time. */
export function ecDateTime(value: Date, lang: BotLang): string {
  const local = new Date(value.getTime() + 3 * 3_600_000);
  const hhmm = local.toISOString().slice(11, 16);
  return `${ecDate(value, lang)} · ${formatEthTime(hhmm, lang)}`;
}

const addisIso = (d: Date) => new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);

/** Escapes text for Telegram's HTML parse mode. */
export const esc = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/** Every message the bot sends, in Amharic and English. */
export const TEXT = {
  am: {
    welcome: (brand: string) =>
      `<b>${brand}</b>\nእንኳን ደህና መጡ!\n\nይህ ቦት የአባልነት መረጃዎን፣ አቴንዳንስዎን፣ ኮርሶችዎንና የQR ኮድዎን ያሳያል።\n\nለመቀጠል ከታች ያለውን <b>«📱 ስልክ ቁጥሬን አጋራ»</b> ይጫኑ። ቁጥሩ በሰንበት ትምህርት ቤቱ የተመዘገበ መሆን አለበት።`,
    shareButton: '📱 ስልክ ቁጥሬን አጋራ',
    shareOwn: 'እባክዎ የራስዎን ቁጥር ከታች ባለው «📱 ስልክ ቁጥሬን አጋራ» ቁልፍ ያጋሩ።',
    notRegistered: (phone: string) =>
      `❌ <b>${phone}</b> በሰንበት ትምህርት ቤቱ መዝገብ ውስጥ የለም።\n\nቦቱን ለመጠቀም ስልክ ቁጥርዎ በአባልነት መዝገብዎ ላይ መመዝገብ አለበት። እባክዎ ጽሕፈት ቤቱን ያነጋግሩ።`,
    linked: (name: string) => `✅ እንኳን ደህና መጡ፣ <b>${name}</b>!\nከታች ካሉት ቁልፎች ይምረጡ።`,
    pickMember: 'ይህ ቁጥር ለብዙ አባላት ተመዝግቧል። የማንን መረጃ ማየት ይፈልጋሉ?',
    accessEnded:
      'ይህ ቁጥር ከአሁን በኋላ በአባልነት መዝገብ ላይ የለም፤ ቦቱ ተዘግቷል። ለመቀጠል ቁጥርዎን እንደገና ያጋሩ ወይም ጽሕፈት ቤቱን ያነጋግሩ።',
    menu: {
      profile: '👤 መረጃዬ',
      attendance: '📅 አቴንዳንስ',
      courses: '🎓 ኮርሶች',
      qr: '🔳 የQR ኮዴ',
      switch: '👥 አባል ቀይር',
      language: '🌐 English',
      logout: '🚪 ውጣ',
    },
    help: 'ከታች ካሉት ቁልፎች ይምረጡ፦ መረጃዬ፣ አቴንዳንስ፣ ኮርሶች ወይም የQR ኮዴ።',
    loggedOut: '👋 ወጥተዋል። እንደገና ለመጠቀም ስልክ ቁጥርዎን ያጋሩ።',
    languageSet: '🌐 ቋንቋ፦ አማርኛ',
    profile: {
      title: '👤 የአባልነት መረጃ',
      code: 'መለያ ቁጥር',
      christianName: 'የክርስትና ስም',
      gender: 'ጾታ',
      birth: 'የትውልድ ቀን',
      phone: 'ስልክ',
      status: 'ሁኔታ',
      joined: 'የተቀላቀሉበት',
      classes: 'ክፍሎች',
      departments: 'የአገልግሎት ክፍሎች',
      group: 'የአገልግሎት ምድብ',
      none: '—',
    },
    gender: { MALE: 'ወንድ', FEMALE: 'ሴት' } as Record<string, string>,
    memberStatus: { ACTIVE: 'ንቁ', INACTIVE: 'ንቁ ያልሆነ' } as Record<string, string>,
    roles: { HEAD: 'ሰብሳቢ', DEPUTY: 'ምክትል ሰብሳቢ', SECRETARY: 'ጸሐፊ', MEMBER: 'አባል' } as Record<
      string,
      string
    >,
    attendance: {
      title: '📅 አቴንዳንስ (ያለፉት 90 ቀናት)',
      summary: (present: number, late: number, absent: number, excused: number) =>
        `✅ ተገኝቷል ${present} · ⏰ አርፍዷል ${late} · ❌ ቀርቷል ${absent} · 📝 ፈቃድ ${excused}`,
      rate: (rate: string) => `የመገኘት መጠን፦ <b>${rate}</b>`,
      recent: 'የቅርብ ጊዜ',
      empty: 'ባለፉት 90 ቀናት ምንም የአቴንዳንስ መዝገብ የለም።',
    },
    statuses: {
      PRESENT: '✅ ተገኝቷል',
      LATE: '⏰ አርፍዷል',
      ABSENT: '❌ ቀርቷል',
      EXCUSED: '📝 ፈቃድ',
    } as Record<string, string>,
    courses: {
      title: '🎓 ኮርሶች',
      teaching: '🧑‍🏫 አሁን የሚያስተምሯቸው',
      students: (n: number) => `${n} ተማሪዎች`,
      teachers: 'መምህራን',
      total: 'ድምር',
      pass: '✅ አልፏል',
      fail: '❌ ወድቋል',
      pending: 'ያልተጠናቀቀ',
      noMarks: 'ገና ውጤት የለም',
      noAssessments: 'ምዘናዎች ገና አልተዘጋጁም',
      empty: 'ምንም ኮርስ የለም።',
      phases: { upcoming: '🔜 የሚጀምር', ongoing: '🟢 በሂደት ላይ', finished: '⚪ የተጠናቀቀ' } as Record<
        string,
        string
      >,
    },
    qrCaption: (name: string, code: string) =>
      `🔳 <b>${name}</b>\n${code}\n\nይህን ኮድ በአቴንዳንስ ጊዜ ያሳዩ።`,
  },
  en: {
    welcome: (brand: string) =>
      `<b>${brand}</b>\nWelcome!\n\nThis bot shows your membership details, attendance, courses and QR code.\n\nTo continue, tap <b>“📱 Share my phone number”</b> below. The number must be registered with the Sunday school.`,
    shareButton: '📱 Share my phone number',
    shareOwn: 'Please share your own number with the “📱 Share my phone number” button below.',
    notRegistered: (phone: string) =>
      `❌ <b>${phone}</b> is not in the Sunday school's records.\n\nTo use this bot, your phone number must be on your member record. Please contact the office.`,
    linked: (name: string) => `✅ Welcome, <b>${name}</b>!\nChoose from the buttons below.`,
    pickMember:
      'This number is registered for several members. Whose details would you like to see?',
    accessEnded:
      'This number is no longer on a member record, so the bot is closed. Share your number again or contact the office.',
    menu: {
      profile: '👤 My details',
      attendance: '📅 Attendance',
      courses: '🎓 Courses',
      qr: '🔳 My QR code',
      switch: '👥 Switch member',
      language: '🌐 አማርኛ',
      logout: '🚪 Sign out',
    },
    help: 'Choose from the buttons below: My details, Attendance, Courses or My QR code.',
    loggedOut: '👋 You are signed out. Share your phone number to use the bot again.',
    languageSet: '🌐 Language: English',
    profile: {
      title: '👤 Membership details',
      code: 'Member ID',
      christianName: 'Christian name',
      gender: 'Gender',
      birth: 'Date of birth',
      phone: 'Phone',
      status: 'Status',
      joined: 'Joined',
      classes: 'Classes',
      departments: 'Departments',
      group: 'Service group',
      none: '—',
    },
    gender: { MALE: 'Male', FEMALE: 'Female' } as Record<string, string>,
    memberStatus: { ACTIVE: 'Active', INACTIVE: 'Inactive' } as Record<string, string>,
    roles: {
      HEAD: 'Head',
      DEPUTY: 'Deputy head',
      SECRETARY: 'Secretary',
      MEMBER: 'Member',
    } as Record<string, string>,
    attendance: {
      title: '📅 Attendance (last 90 days)',
      summary: (present: number, late: number, absent: number, excused: number) =>
        `✅ Present ${present} · ⏰ Late ${late} · ❌ Absent ${absent} · 📝 Excused ${excused}`,
      rate: (rate: string) => `Attendance rate: <b>${rate}</b>`,
      recent: 'Recent',
      empty: 'No attendance records in the last 90 days.',
    },
    statuses: {
      PRESENT: '✅ Present',
      LATE: '⏰ Late',
      ABSENT: '❌ Absent',
      EXCUSED: '📝 Excused',
    } as Record<string, string>,
    courses: {
      title: '🎓 Courses',
      teaching: '🧑‍🏫 Teaching now',
      students: (n: number) => `${n} students`,
      teachers: 'Teachers',
      total: 'Total',
      pass: '✅ Passed',
      fail: '❌ Failed',
      pending: 'Pending',
      noMarks: 'No marks yet',
      noAssessments: 'Assessments not set up yet',
      empty: 'No courses.',
      phases: { upcoming: '🔜 Upcoming', ongoing: '🟢 Ongoing', finished: '⚪ Finished' } as Record<
        string,
        string
      >,
    },
    qrCaption: (name: string, code: string) =>
      `🔳 <b>${name}</b>\n${code}\n\nShow this code at attendance.`,
  },
} satisfies Record<BotLang, unknown>;

/** Bot commands, shown in Telegram's menu. */
export const COMMANDS: Record<BotLang, { command: string; description: string }[]> = {
  am: [
    { command: 'start', description: 'ጀምር' },
    { command: 'profile', description: 'የአባልነት መረጃዬ' },
    { command: 'attendance', description: 'አቴንዳንስ' },
    { command: 'courses', description: 'ኮርሶች' },
    { command: 'qr', description: 'የQR ኮዴ' },
    { command: 'language', description: 'ቋንቋ ቀይር / Change language' },
    { command: 'logout', description: 'ውጣ' },
  ],
  en: [
    { command: 'start', description: 'Start' },
    { command: 'profile', description: 'My membership details' },
    { command: 'attendance', description: 'Attendance' },
    { command: 'courses', description: 'Courses' },
    { command: 'qr', description: 'My QR code' },
    { command: 'language', description: 'Change language / ቋንቋ ቀይር' },
    { command: 'logout', description: 'Sign out' },
  ],
};

/** The bot's profile texts (Telegram's "What can this bot do?" and short description). */
export const BOT_PROFILE: Record<BotLang, { name: string; description: string; short: string }> = {
  am: {
    name: 'ፍቁረ እግዚእ ሰንበት ትምህርት ቤት',
    description:
      'የፍቁረ እግዚእ ሰንበት ትምህርት ቤት አባላት ቦት።\n\nበአባልነት መዝገብዎ ላይ ያለውን ስልክ ቁጥር ያጋሩ፤ ከዚያ መረጃዎን፣ አቴንዳንስዎን፣ ኮርሶችዎንና የQR ኮድዎን ይመልከቱ።',
    short: 'የአባልነት መረጃ፣ አቴንዳንስ፣ ኮርሶችና QR ኮድ — ለፍቁረ እግዚእ ሰንበት ትምህርት ቤት አባላት።',
  },
  en: {
    name: 'Fikure Egzi Sunday School',
    description:
      'The Fikure Egzi Sunday School members’ bot.\n\nShare the phone number on your member record, then see your details, attendance, courses and QR code.',
    short:
      'Membership details, attendance, courses and QR code for Fikure Egzi Sunday School members.',
  },
};
