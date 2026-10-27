/** The Sunday school's time zone: "today" means today in Addis Ababa, not UTC. */
export const APP_TIME_ZONE = 'Africa/Addis_Ababa';

const ymd = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's date in Addis Ababa as 'YYYY-MM-DD'. */
export function todayIso(now = new Date()): string {
  return ymd.format(now);
}

/** 'YYYY-MM-DD' → Date at UTC midnight, the form DATE columns are stored in. */
export function dateOnly(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export const today = (now = new Date()): Date => dateOnly(todayIso(now));
