import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
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
  groupId: null,
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
  groups: [],
} as ExamSheet

type OnSave = (marks: ExamMarkInput[], groups: { memberIds: number[] }[]) => Promise<void>

function renderSheet(onSave: OnSave, data: ExamSheet = sheet, onGroup = vi.fn()) {
  const client = new QueryClient()
  return render(
    <QueryClientProvider client={client}>
      <ExamMarksSheet sheet={data} editable onSave={onSave} onGroup={onGroup} onRemove={vi.fn()} />
    </QueryClientProvider>,
  )
}

/** The candidates' names in the order the sheet shows them. */
const shownNames = () =>
  screen.getAllByRole('checkbox', { name: /^Select (?!everyone)/ }).map((c) => c.getAttribute('aria-label'))

describe('ExamMarksSheet group marks', () => {
  it('gives the selected group the same marks, which can then be changed one by one', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn<OnSave>().mockResolvedValue()
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
    // Kept as a group marked together.
    expect(onSave.mock.calls[0]![1]).toEqual([{ memberIds: [1, 2] }])
  })

  it('puts the selected on top and keeps them shown while searching for the next one', async () => {
    const user = userEvent.setup()
    renderSheet(vi.fn<OnSave>().mockResolvedValue())

    await user.click(screen.getByLabelText('Select Chaltu Kebede'))
    expect(shownNames()).toEqual(['Select Chaltu Kebede', 'Select Abebe Kebede', 'Select Bereket Kebede'])

    await user.type(screen.getByLabelText('Find a candidate'), 'Abe')
    expect(shownNames()).toEqual(['Select Chaltu Kebede', 'Select Abebe Kebede'])
  })

  it('shows the groups marked together and opens one', async () => {
    const user = userEvent.setup()
    const onGroup = vi.fn()
    const grouped = {
      ...sheet,
      candidates: [
        { ...member(1, 'Abebe'), groupId: 5, total: 80, result: 'PASS' },
        { ...member(2, 'Bereket'), groupId: 5, total: 80, result: 'PASS' },
        member(3, 'Chaltu'),
      ],
      groups: [{ id: 5, number: 1, createdAt: '2026-11-18T08:00:00Z', createdBy: 'Exam Taker', memberIds: [1, 2] }],
    } as ExamSheet
    renderSheet(vi.fn<OnSave>().mockResolvedValue(), grouped, onGroup)

    // A chip on each member of the group.
    expect(screen.getAllByRole('button', { name: 'Group 1' })).toHaveLength(2)

    // A short filter row: All · Group 1 (2 members).
    const filter = screen.getByRole('group', { name: 'Marked together' })
    expect(filter).toHaveTextContent('AllGroup 12')
    await user.click(within(filter).getByRole('button', { name: /Group 1/ }))
    expect(onGroup).toHaveBeenCalledWith(5)
  })

  it('selects everyone shown and refuses a group mark above the weight', async () => {
    const user = userEvent.setup()
    renderSheet(vi.fn<OnSave>().mockResolvedValue())

    await user.click(screen.getByLabelText('Select everyone shown'))
    expect(screen.getByText('3 selected')).toBeInTheDocument()

    await user.type(screen.getAllByRole('textbox')[0]!, '45')
    expect(screen.getByRole('button', { name: 'Give to the 3 selected' })).toBeDisabled()
  })
})
