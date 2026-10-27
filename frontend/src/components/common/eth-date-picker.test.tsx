import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EthDatePicker } from './eth-date-picker'

describe('<EthDatePicker>', () => {
  it('shows the Gregorian value as an E.C. date', () => {
    render(<EthDatePicker value="2026-10-26" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Tikimt 16, 2019/ })).toBeInTheDocument()
  })

  it('returns a Gregorian ISO date when an E.C. day is picked', async () => {
    const onChange = vi.fn()
    render(<EthDatePicker value="2026-10-26" onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: /Tikimt 16, 2019/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Tikimt 1, 2019' }))

    // Tikimt 1, 2019 E.C. = 11 October 2026 G.C.
    expect(onChange).toHaveBeenCalledWith('2026-10-11')
  })
})
