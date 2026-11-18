import { ecMonthBounds, ecToday, gcToEc } from '@/lib/ethiopian-calendar'

export interface Bucket {
  key: string
  year: number
  month: number
  count: number
}

/** The members list showing who joined in this month (Nehase includes Pagume, as in the chart). */
export function joinedInLink(b: Pick<Bucket, 'year' | 'month'>): string {
  const from = ecMonthBounds(b.year, b.month).start
  const to = ecMonthBounds(b.year, b.month === 12 ? 13 : b.month).end
  return `/members?joinedFrom=${from}&joinedTo=${to}`
}

/**
 * The last `months` Ethiopian months, oldest first, with counts. Pagume (the
 * 5–6 day 13th month) is folded into Nehase, as in DPMES, so it never shows
 * as a misleadingly tiny bar.
 */
export function bucketByEcMonth(days: { date: string; count: number }[], months = 12, now = new Date()): Bucket[] {
  const today = ecToday(now)
  let year = today.year
  let month = Math.min(today.month, 12)
  const buckets: Bucket[] = []
  for (let i = 0; i < months; i++) {
    buckets.unshift({ key: `${year}-${month}`, year, month, count: 0 })
    month -= 1
    if (month === 0) {
      month = 12
      year -= 1
    }
  }
  const index = new Map(buckets.map((b) => [b.key, b]))
  for (const { date, count } of days) {
    const ec = gcToEc(date)
    if (!ec) continue
    const bucket = index.get(`${ec.year}-${Math.min(ec.month, 12)}`)
    if (bucket) bucket.count += count
  }
  return buckets
}
