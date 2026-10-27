import { render, screen } from '@testing-library/react'
import { PERMISSIONS } from '@/lib/permissions'
import { AuthContext, type AuthContextValue } from './context'
import { Can } from './guards'

function renderWithPermissions(permissions: string[], ui: React.ReactNode) {
  const value: AuthContextValue = {
    status: 'authenticated',
    user: null,
    login: vi.fn(),
    logout: vi.fn(),
    can: (...required) => required.every((p) => permissions.includes(p)),
    inDepartment: () => true,
  }
  return render(<AuthContext.Provider value={value}>{ui}</AuthContext.Provider>)
}

describe('<Can>', () => {
  it('renders children when the permission is held', () => {
    renderWithPermissions([PERMISSIONS.MEMBERS_CREATE], <Can permission={PERMISSIONS.MEMBERS_CREATE}>Register</Can>)
    expect(screen.getByText('Register')).toBeInTheDocument()
  })

  it('renders the fallback otherwise', () => {
    renderWithPermissions(
      [PERMISSIONS.MEMBERS_READ],
      <Can permission={PERMISSIONS.MEMBERS_DELETE} fallback="No access">
        Delete
      </Can>,
    )
    expect(screen.queryByText('Delete')).not.toBeInTheDocument()
    expect(screen.getByText('No access')).toBeInTheDocument()
  })
})
