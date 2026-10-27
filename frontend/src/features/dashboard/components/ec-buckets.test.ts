import { bucketByEcMonth } from './ec-buckets'

describe('bucketByEcMonth', () => {
  const now = new Date('2026-10-26T09:00:00Z') // Tikimt 16, 2019 E.C.

  it('returns the last 12 Ethiopian months ending with the current one', () => {
    const buckets = bucketByEcMonth([], 12, now)
    expect(buckets).toHaveLength(12)
    expect(buckets.at(-1)).toMatchObject({ year: 2019, month: 2 }) // Tikimt 2019
    expect(buckets[0]).toMatchObject({ year: 2018, month: 3 }) // Hidar 2018
  })

  it('counts days into their E.C. month and folds Pagume into Nehase', () => {
    const buckets = bucketByEcMonth(
      [
        { date: '2026-10-11', count: 2 }, // Tikimt 1, 2019
        { date: '2026-09-08', count: 1 }, // Pagume 3, 2018 → Nehase 2018
        { date: '2026-08-20', count: 4 }, // Nehase 14, 2018
        { date: '2020-01-01', count: 9 }, // outside the window
      ],
      12,
      now,
    )
    const find = (y: number, m: number) => buckets.find((b) => b.year === y && b.month === m)?.count
    expect(find(2019, 2)).toBe(2)
    expect(find(2018, 12)).toBe(5)
    expect(buckets.reduce((s, b) => s + b.count, 0)).toBe(7)
  })
})
