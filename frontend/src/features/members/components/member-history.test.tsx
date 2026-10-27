import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { memberKeys } from '../api'
import type { MemberHistory as History } from '../types'
import { MemberHistory } from './member-history'

const course = { id: 2, code: 'COURSE', nameEn: 'Course Class', nameAm: 'የኮርስ ክፍል' }
const grade = (n: number) => ({ id: n, code: `G0${n}`, nameEn: `Grade ${n}`, nameAm: `${n}ኛ ክፍል`, shortLabel: String(n) })

const history: History = {
  classes: [
    { id: 3, classType: course, classGrade: grade(2), startedAt: '2026-09-11', endedAt: null },
    { id: 2, classType: course, classGrade: grade(1), startedAt: '2025-09-11', endedAt: '2026-09-11' },
  ],
  departments: [
    {
      id: 9,
      role: 'HEAD',
      department: { id: 4, code: 'EDUCATION', nameEn: 'Education', nameAm: 'ትምህርት ክፍል' },
      startedAt: '2026-01-01',
      endedAt: null,
    },
  ],
}

describe('<MemberHistory>', () => {
  it('lists past and current periods with Ethiopian-calendar dates', () => {
    const client = new QueryClient()
    client.setQueryData(memberKeys.history(1), history)
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <MemberHistory memberId={1} />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(screen.getByText('Grade 2')).toBeInTheDocument()
    expect(screen.getByText('Grade 1')).toBeInTheDocument()
    // 2025-09-11 → Meskerem 1, 2018 E.C.; 2026-09-11 → Meskerem 1, 2019 E.C.
    expect(screen.getByText('Meskerem 1, 2018 – Meskerem 1, 2019')).toBeInTheDocument()
    expect(screen.getByText('Since Meskerem 1, 2019')).toBeInTheDocument()
    expect(screen.getAllByText('Current')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Education' })).toHaveAttribute('href', '/departments/4')
  })
})
