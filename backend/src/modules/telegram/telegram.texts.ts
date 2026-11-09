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

/** A timestamp's Addis Ababa Ethiopian date as compact "dd/mm" for table rows. */
export function ecShort(value: Date): string {
  const ec = gcIsoToEc(addisIso(value));
  return `${String(ec.day).padStart(2, '0')}/${String(ec.month).padStart(2, '0')}`;
}

/** Escapes text for Telegram's HTML parse mode. */
export const esc = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/**
 * The discipline and code-of-conduct agreement every member signs (the paper
 * form's text). Self-registration cannot finish until it is accepted.
 */
export const AGREEMENT: Record<BotLang, { title: string; rules: string[]; pledge: string }> = {
  am: {
    title: 'የዲሲፕሊን እና የሥነ-ምግባር ስምምነት',
    rules: [
      'የክፍሉን ሥርዓትና ደንብ ማክበር።',
      'በአገልግሎት ወቅት ተገቢ አለባበስና ባህሪ መከተል።',
      'ከኃላፊዎችና ከሌሎች አባላት ጋር በአክብሮት መግባባት።',
      'የሰንበት ት/ቤቱንና የክፍሉን ስምና ክብር መጠበቅ።',
      'የተሰጠኝን ኃላፊነት በታማኝነት መወጣት።',
      'የክፍሉን ውስጣዊ መረጃ ምስጢራዊነት መጠበቅ።',
      'የክፍሉን ሥርዓት የሚጥስ ተግባር ከመፈጸም መቆጠብ።',
    ],
    pledge:
      'እኔ ከላይ የተጠቀሱትን ደንቦች ተረድቼ በመከተል ተስማምቻለሁ። ይህ ሳይሆን ቢቀር ክፍሉ የሚወስድብኝን ህጋዊ እርምጃ የምቀበል መሆኑን አረጋግጣለሁ።',
  },
  en: {
    title: 'Discipline and Code of Conduct Agreement',
    rules: [
      'Respect the order and rules of the department.',
      'Dress and behave appropriately during service.',
      'Treat leaders and fellow members with respect.',
      'Protect the name and honour of the Sunday school and the department.',
      'Carry out the responsibilities given to me faithfully.',
      'Keep the department’s internal information confidential.',
      'Refrain from any act that breaks the department’s order.',
    ],
    pledge:
      'I have understood the rules above and agree to follow them. If I do not, I accept the action the department takes against me.',
  },
};

/** Every message the bot sends, in Amharic and English. */
export const TEXT = {
  am: {
    welcome: (brand: string, selfRegistration: boolean) =>
      `<b>${brand}</b>\nእንኳን ደህና መጡ!\n\nይህ ቦት የአባልነት መረጃዎን፣ አቴንዳንስዎን፣ ኮርሶችዎንና የQR ኮድዎን ያሳያል።\n\nለመቀጠል ከታች ያለውን <b>«📱 ስልክ ቁጥሬን አጋራ»</b> ይጫኑ።${
        selfRegistration
          ? ' ገና አባል ካልሆኑ፣ ቁጥርዎን ካጋሩ በኋላ እዚሁ ራስዎን መመዝገብ ይችላሉ።'
          : ' ቁጥሩ በሰንበት ትምህርት ቤቱ የተመዘገበ መሆን አለበት።'
      }`,
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
      card: 'የአባልነት መታወቂያ',
      age: (n: number) => `${n} ዓመት`,
      birthPlace: 'የትውልድ ቦታ',
      contact: 'የመገናኛ መረጃ',
      email: 'ኢሜይል',
      address: 'አድራሻ',
      house: 'የቤት ቁ.',
      woreda: 'ወረዳ',
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
      choose: 'የትኛውን የአገልግሎት ክፍል አቴንዳንስ ይመልከቱ?',
      all: '📋 ሁሉም',
      office: 'ፅህፈት ቤት',
      more: (n: number) => `… ${n} ተጨማሪ ክፍለ ጊዜዎች`,
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
    register: {
      offer: (phone: string) =>
        `📋 <b>${phone}</b> ገና አልተመዘገበም።\n\nአሁን እዚሁ ራስዎን እንደ አዲስ አባል መመዝገብ ይችላሉ — 10 ጥያቄዎች፣ 2 ደቂቃ ገደማ።`,
      start: '📝 ልመዝገብ',
      cancel: '✖ ሰርዝ',
      skip: '⏭ እለፍ',
      step: (n: number) => `<i>ጥያቄ ${n}/10</i>`,
      ask: {
        firstName: '👤 ስምዎን ይጻፉ።',
        fatherName: '👤 የአባትዎን ስም ይጻፉ።',
        grandfatherName: '👤 የአያትዎን ስም ይጻፉ።',
        christianName: '✝️ የክርስትና ስምዎን ይጻፉ። ከሌለዎት «⏭ እለፍ» ይጫኑ።',
        gender: '👥 ጾታዎን ይምረጡ።',
        dateOfBirth:
          '🎂 የትውልድ ቀንዎን በኢትዮጵያ አቆጣጠር ቀን/ወር/ዓመት ብለው ይጻፉ።\nለምሳሌ፦ <code>15/01/2000</code> (መስከረም 15 ቀን 2000)',
        subCity: '🏙 የሚኖሩበትን ክፍለ ከተማ ይጻፉ፣ ወይም «⏭ እለፍ» ይጫኑ።',
        woreda: '📍 ወረዳዎን ይጻፉ፣ ወይም «⏭ እለፍ» ይጫኑ።',
        health: '🩺 ክትትል ወይም ልዩ ትኩረት የሚፈልግ የጤና ሁኔታ አለዎት?',
        healthNote: '🩺 የጤና ሁኔታዎን በአጭሩ ይግለጹ (ለምሳሌ፦ አስም፣ የስኳር ሕመም፣ አለርጂ)።',
      },
      male: '👨 ወንድ',
      female: '👩 ሴት',
      yes: '✔️ አዎ፣ አለኝ',
      no: '➖ የለኝም',
      agreementIntro: 'ምዝገባውን ለማጠናቀቅ የሚከተለውን ስምምነት ያንብቡ፦',
      agree: '✅ አንብቤ ተስማምቻለሁ',
      invalid: {
        name: 'እባክዎ ትክክለኛ ስም ይጻፉ — ፊደላት ብቻ፣ ከ100 ፊደል ያልበለጠ።',
        choose: 'እባክዎ ከታች ካሉት ቁልፎች አንዱን ይጫኑ።',
        date: 'ቀኑ አልተነበበም። በኢትዮጵያ አቆጣጠር ቀን/ወር/ዓመት ይጻፉ፤ ለምሳሌ <code>15/01/2000</code>።',
        dateRange: 'የትውልድ ቀኑ ያለፈ ቀን መሆን አለበት፣ ከ100 ዓመት በፊትም መሆን የለበትም።',
        tooLong: (max: number) => `እባክዎ ከ${max} ፊደል ባልበለጠ ይጻፉ።`,
        note: 'እባክዎ የጤና ሁኔታውን በጥቂት ቃላት ይግለጹ።',
      },
      summaryTitle: '📋 <b>መረጃዎን ያረጋግጡ</b>',
      summaryHint: 'ትክክል ከሆነ «✅ ይመዝገብ» ይጫኑ።',
      fields: {
        name: 'ሙሉ ስም',
        christianName: 'የክርስትና ስም',
        gender: 'ጾታ',
        birth: 'የትውልድ ቀን',
        phone: 'ስልክ',
        address: 'አድራሻ',
        woreda: 'ወረዳ',
        health: 'የጤና ሁኔታ',
        none: 'የለም',
        agreement: 'ስምምነት',
        accepted: 'ተቀብለዋል',
      },
      confirm: '✅ ይመዝገብ',
      restart: '🔁 እንደገና ልሙላ',
      wait: '⏳ በመመዝገብ ላይ…',
      done: (name: string, code: string) =>
        `🎉 <b>እንኳን ደስ አለዎት፣ ${name}!</b>\n\nተመዝግበዋል። የአባልነት መለያ ቁጥርዎ፦ <code>${code}</code>\n\nጽሕፈት ቤቱ ቀሪ መረጃዎን ለማሟላት ሊያገኝዎት ይችላል። አሁን ከታች ካሉት ቁልፎች ይምረጡ።`,
      cancelled: 'ምዝገባው ተሰርዟል። በፈለጉ ጊዜ ስልክ ቁጥርዎን በማጋራት እንደገና መጀመር ይችላሉ።',
      declined: 'ምዝገባው የሚጠናቀቀው ስምምነቱን ሲቀበሉ ብቻ ነው፤ ስለዚህ ተሰርዟል። ጥያቄ ካለዎት ጽሕፈት ቤቱን ያነጋግሩ።',
      closed: 'ራስን መመዝገብ በአሁኑ ጊዜ ዝግ ነው። እባክዎ ጽሕፈት ቤቱን ያነጋግሩ።',
      duplicate: (code: string) =>
        `ይህ ሙሉ ስም ቀድሞ ተመዝግቧል (<code>${code}</code>)። እርስዎ ከሆኑ ይህን ስልክ ቁጥር በመዝገብዎ ላይ እንዲጨምሩልዎ ጽሕፈት ቤቱን ያነጋግሩ።`,
      failed: 'ምዝገባው አልተጠናቀቀም። እባክዎ «✅ ይመዝገብ»ን እንደገና ይጫኑ፤ ካልሰራ ጽሕፈት ቤቱን ያነጋግሩ።',
    },
  },
  en: {
    welcome: (brand: string, selfRegistration: boolean) =>
      `<b>${brand}</b>\nWelcome!\n\nThis bot shows your membership details, attendance, courses and QR code.\n\nTo continue, tap <b>“📱 Share my phone number”</b> below.${
        selfRegistration
          ? ' Not a member yet? After sharing your number you can register yourself right here.'
          : ' The number must be registered with the Sunday school.'
      }`,
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
      card: 'Membership card',
      age: (n: number) => `${n} years`,
      birthPlace: 'Place of birth',
      contact: 'Contact',
      email: 'Email',
      address: 'Address',
      house: 'House',
      woreda: 'Woreda',
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
      choose: 'Which department’s attendance would you like?',
      all: '📋 All',
      office: 'Office',
      more: (n: number) => `… ${n} more sessions`,
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
    register: {
      offer: (phone: string) =>
        `📋 <b>${phone}</b> is not registered yet.\n\nYou can register yourself as a new member right here — 10 questions, about 2 minutes.`,
      start: '📝 Register me',
      cancel: '✖ Cancel',
      skip: '⏭ Skip',
      step: (n: number) => `<i>Question ${n}/10</i>`,
      ask: {
        firstName: '👤 Type your first name.',
        fatherName: '👤 Type your father’s name.',
        grandfatherName: '👤 Type your grandfather’s name.',
        christianName: '✝️ Type your Christian (baptismal) name, or tap “⏭ Skip”.',
        gender: '👥 Choose your gender.',
        dateOfBirth:
          '🎂 Type your date of birth in the Ethiopian calendar as day/month/year.\nFor example: <code>15/01/2000</code> (Meskerem 15, 2000)',
        subCity: '🏙 Type the sub-city you live in, or tap “⏭ Skip”.',
        woreda: '📍 Type your woreda, or tap “⏭ Skip”.',
        health: '🩺 Do you have a health condition that needs attention or care?',
        healthNote:
          '🩺 Briefly describe the condition (for example: asthma, diabetes, an allergy).',
      },
      male: '👨 Male',
      female: '👩 Female',
      yes: '✔️ Yes, I do',
      no: '➖ No',
      agreementIntro: 'To finish registering, read the following agreement:',
      agree: '✅ I have read it and agree',
      invalid: {
        name: 'Please type a real name — letters only, at most 100 characters.',
        choose: 'Please tap one of the buttons below.',
        date: 'That date could not be read. Type it in the Ethiopian calendar as day/month/year, e.g. <code>15/01/2000</code>.',
        dateRange: 'The date of birth must be in the past and within the last 100 years.',
        tooLong: (max: number) => `Please keep it to ${max} characters or fewer.`,
        note: 'Please describe the condition in a few words.',
      },
      summaryTitle: '📋 <b>Check your details</b>',
      summaryHint: 'If everything is right, tap “✅ Register”.',
      fields: {
        name: 'Full name',
        christianName: 'Christian name',
        gender: 'Gender',
        birth: 'Date of birth',
        phone: 'Phone',
        address: 'Address',
        woreda: 'Woreda',
        health: 'Health condition',
        none: 'None',
        agreement: 'Agreement',
        accepted: 'Accepted',
      },
      confirm: '✅ Register',
      restart: '🔁 Start over',
      wait: '⏳ Registering…',
      done: (name: string, code: string) =>
        `🎉 <b>Welcome, ${name}!</b>\n\nYou are registered. Your member ID is <code>${code}</code>.\n\nThe office may contact you to complete the rest of your details. Choose from the buttons below.`,
      cancelled: 'Registration cancelled. Share your phone number any time to start again.',
      declined:
        'Registration can only be completed by accepting the agreement. If you have questions, contact the office.',
      closed: 'Self-registration is closed right now. Please contact the office.',
      duplicate: (code: string) =>
        `A member with this full name is already registered (<code>${code}</code>). If that is you, ask the office to add this phone number to your record.`,
      failed:
        'Registration did not go through. Tap “✅ Register” again; if it still fails, contact the office.',
    },
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
