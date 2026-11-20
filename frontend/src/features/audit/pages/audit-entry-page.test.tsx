import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { AuditDetail } from '../types'
import { AuditEntryPage } from './audit-entry-page'

const entry: AuditDetail = {
  id: '42',
  userId: 1,
  user: { id: 1, fullName: 'Office Admin', email: 'admin@example.com' },
  action: 'UPDATE',
  entity: 'Member',
  entityId: '7',
  target: { am: 'Abebe Kebede', en: 'Abebe Kebede', code: 'FE-00007' },
  changes: {
    fields: ['phone', 'departmentIds', 'agreementIds'],
    diff: {
      phone: { from: '0911000000', to: '0922000000' },
      departmentIds: { from: [2], to: [4] },
      agreementIds: { to: [3] },
    },
  },
  refs: { departmentIds: { 2: { am: 'ልማት', en: 'Development' }, 4: { am: 'መዝሙር', en: 'Mezmur' } } },
  ipAddress: '10.0.0.1',
  createdAt: '2026-11-20T07:30:00.000Z',
}

vi.mock('../api', () => ({
  useAuditEntry: () => ({ isPending: false, isError: false, data: entry, refetch: vi.fn() }),
}))

describe('AuditEntryPage', () => {
  it('shows who, the record and each field from before to after, with ids named', () => {
    render(
      <MemoryRouter initialEntries={['/audit/42']}>
        <Routes>
          <Route path="/audit/:id" element={<AuditEntryPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('Office Admin')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abebe Kebede' })).toHaveAttribute('href', '/members/7')
    expect(screen.getByText('0911000000')).toBeInTheDocument()
    expect(screen.getByText('0922000000')).toBeInTheDocument()
    expect(screen.getByText('Development')).toBeInTheDocument()
    expect(screen.getByText('Mezmur')).toBeInTheDocument()
    expect(screen.getByText('not recorded')).toBeInTheDocument()
  })
})
