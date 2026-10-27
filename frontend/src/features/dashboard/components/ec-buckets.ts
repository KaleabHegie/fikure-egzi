import { ecToday, gcToEc } from '@/lib/ethiopian-calendar'

export interface Bucket {
  key: string
  year: number
  month: number
  count: number
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
