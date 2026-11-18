import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Exam, ExamMarkInput, ExamSheet } from '../types'
import { ExamMarksSheet } from './exam-marks-sheet'

const member = (id: number, firstName: string) => ({
  member: {
    id,
    memberCode: `FE-0000${id}`,
    firstName,
    fatherName: 'Kebede',
    grandfatherName: null,
    christianName: null,
    hasPhoto: false,
    updatedAt: '2026-11-01T00:00:00Z',
  },
  marks: {},
  total: null,
  result: null,
})

const sheet = {
  exam: {
    id: 9,
    passMark: 60,
    totalWeight: 100,
    parts: [
      { id: 1, name: 'Movement', weight: 40, sortOrder: 0 },
      { id: 2, name: 'Melody', weight: 60, sortOrder: 1 },
    ],
  } as unknown as Exam,
  candidates: [member(1, 'Abebe'), member(2, 'Bereket'), member(3, 'Chaltu')],
} as ExamSheet

function renderSheet(onSave: (marks: ExamMarkInput[]) => Promise<void>) {
  const client = new QueryClient()
  return render(
    <QueryClientProvider client={client}>
      <ExamMarksSheet sheet={sheet} editable onSave={onSave} onRemove={vi.fn()} />
    </QueryClientProvider>,
  )
}

describe('ExamMarksSheet group marks', () => {
  it('gives the selected group the same marks, which can then be changed one by one', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn<(marks: ExamMarkInput[]) => Promise<void>>().mockResolvedValue()
    renderSheet(onSave)

    await user.click(screen.getByLabelText('Select Abebe Kebede'))
    await user.click(screen.getByLabelText('Select Bereket Kebede'))
    expect(screen.getByText('2 selected')).toBeInTheDocument()

    const [movement, melody] = screen.getAllByRole('textbox').slice(0, 2) as [HTMLElement, HTMLElement]
    await user.type(movement, '35')
    await user.type(melody, '50')
    await user.click(screen.getByRole('button', { name: 'Give to the 2 selected' }))

    expect(screen.getByLabelText('Abebe Kebede — Movement')).toHaveValue('35')
    expect(screen.getByLabelText('Bereket Kebede — Melody')).toHaveValue('50')
    expect(screen.getByLabelText('Chaltu Kebede — Movement')).toHaveValue('')

    // A separate mark for one of the group.
    const bereketMelody = screen.getByLabelText('Bereket Kebede — Melody')
    await user.clear(bereketMelody)
    await user.type(bereketMelody, '55')

    await user.click(screen.getByRole('button', { name: 'Save marks' }))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0]![0]).toEqual(
      expect.arrayContaining([
        { partId: 1, memberId: 1, score: 35 },
        { partId: 2, memberId: 1, score: 50 },
        { partId: 1, memberId: 2, score: 35 },
        { partId: 2, memberId: 2, score: 55 },
      ]),
    )
    expect(onSave.mock.calls[0]![0]).toHaveLength(4)
  })

  it('selects everyone shown and refuses a group mark above the weight', async () => {
    const user = userEvent.setup()
    renderSheet(vi.fn<(marks: ExamMarkInput[]) => Promise<void>>().mockResolvedValue())

    await user.click(screen.getByLabelText('Select everyone shown'))
    expect(screen.getByText('3 selected')).toBeInTheDocument()

    await user.type(screen.getAllByRole('textbox')[0]!, '45')
    expect(screen.getByRole('button', { name: 'Give to the 3 selected' })).toBeDisabled()
  })
})
