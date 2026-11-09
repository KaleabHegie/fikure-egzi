/**
 * The discipline and code-of-conduct agreement members sign (the paper form's
 * text). Keep in step with AGREEMENT in backend/src/modules/telegram/telegram.texts.ts,
 * which the bot shows during self-registration.
 */
export const AGREEMENT: Record<'am' | 'en', { title: string; rules: string[]; pledge: string }> = {
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
}
