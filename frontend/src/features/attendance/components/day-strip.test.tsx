import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DayStrip } from './day-strip'

describe('DayStrip', () => {
  it('shows the day with three days either side, marks days with sessions, and steps a week', async () => {
    const user = userEvent.setup()
    const onDay = vi.fn()
    // 2026-11-18 is Hidar 9, 2019 E.C. (a Wednesday).
    render(<DayStrip day="2026-11-18" onDay={onDay} counts={{ '2026-11-15': 2 }} />)

    const days = screen.getAllByRole('button', { pressed: false }).concat(screen.getAllByRole('button', { pressed: true }))
    expect(days).toHaveLength(7)
    expect(screen.getByRole('button', { pressed: true })).toHaveAccessibleName(/Wed Hidar 9/)
    expect(screen.getByRole('button', { name: /Sun Hidar 6 · 2 sessions/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Previous 7 days' }))
    expect(onDay).toHaveBeenLastCalledWith('2026-11-11')
    await user.click(screen.getByRole('button', { name: 'Next 7 days' }))
    expect(onDay).toHaveBeenLastCalledWith('2026-11-25')
    await user.click(screen.getByRole('button', { name: /Sun Hidar 6/ }))
    expect(onDay).toHaveBeenLastCalledWith('2026-11-15')
  })
})
