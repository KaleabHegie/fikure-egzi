import { formatPhone, normalizeEthiopianPhone } from './phone'

describe('phone helpers', () => {
  it.each([
    ['+251911223344', '0911223344'],
    ['251911223344', '0911223344'],
    ['0911 22-33-44', '0911223344'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeEthiopianPhone(input)).toBe(expected)
  })

  it('groups digits for display', () => {
    expect(formatPhone('0911223344')).toBe('0911 22 33 44')
    expect(formatPhone(null)).toBe('')
  })
})
