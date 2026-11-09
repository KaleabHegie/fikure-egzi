import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '@/test/render'
import { IdCard, ID_CARD_HEADING, type IdCardMember } from './id-card'

const member: IdCardMember = {
  id: 7,
  memberCode: 'FE-00042',
  firstName: 'ዳንኤል',
  fatherName: 'ማስረሻ',
  christianName: 'ፍቁረ ሥላሴ',
  dateOfBirth: '1999-08-21',
  phone: '0982087021',
  emergencyContactName: 'ገብረ ተመስገን',
  hasPhoto: false,
  updatedAt: '2026-11-09T00:00:00.000Z',
}

describe('IdCard', () => {
  it('shows the school band, the member details and the card footer', () => {
    renderWithProviders(<IdCard member={member} validity="2019-2020" contact="0111557739 | 0901044444" />)

    expect(screen.getByText(ID_CARD_HEADING)).toBeInTheDocument()
    expect(screen.getByText('ዳንኤል ማስረሻ')).toBeInTheDocument()
    expect(screen.getByText('ፍቁረ ሥላሴ')).toBeInTheDocument()
    expect(screen.getByText('ገብረ ተመስገን')).toBeInTheDocument()
    expect(screen.getByText('0982087021')).toBeInTheDocument()
    expect(screen.getByText('FE-00042')).toBeInTheDocument()
    expect(screen.getByText('የሚያገለግልበት ጊዜ = 2019-2020')).toBeInTheDocument()
    expect(screen.getByText('ለበለጠ መረጃ፡ 0111557739 | 0901044444')).toBeInTheDocument()
  })

  it('writes the birth date in the Ethiopian calendar, day first', () => {
    renderWithProviders(<IdCard member={member} validity="2019-2020" contact="" />)
    // 21 Aug 1999 (G.C.) is 15 Nehase 1991 (E.C.).
    expect(screen.getByText('15-12-1991')).toBeInTheDocument()
  })
})
