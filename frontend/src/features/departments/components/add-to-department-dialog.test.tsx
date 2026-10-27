import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthContext, type AuthContextValue } from '@/features/auth/context'
import { departmentKeys, departmentsApi } from '../api'
import type { Department } from '../types'
import { AddToDepartmentDialog } from './add-to-department-dialog'

const dept = (id: number, nameEn: string, parentId: number | null): Department => ({
  id,
  code: nameEn.toUpperCase(),
  nameEn,
  nameAm: nameEn,
  descriptionEn: null,
  descriptionAm: null,
  parentId,
  sortOrder: id,
  isActive: true,
  memberCount: 0,
  head: null,
})

/** Office admins (scope null) may use every department; department admins only their own. */
const auth = (scope: number[] | null): AuthContextValue => ({
  status: 'authenticated',
  user: null,
  login: vi.fn(),
  logout: vi.fn(),
  can: () => true,
  inDepartment: (id) => scope === null || (id != null && scope.includes(id)),
})

function renderDialog(scope: number[] | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(departmentKeys.list(false), [dept(1, 'Office', null), dept(2, 'Education', 1), dept(3, 'Finance', 1)])
  client.setQueryData(departmentKeys.members(3), [])
  return render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={auth(scope)}>
      <AddToDepartmentDialog
        open
        onOpenChange={vi.fn()}
        member={{ id: 42, firstName: 'Hanna', fatherName: 'Girma', grandfatherName: null }}
        currentDepartmentIds={[2]}
      />
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
}

describe('<AddToDepartmentDialog>', () => {
  it('adds the member to the chosen department with the chosen role', async () => {
    const addMember = vi.spyOn(departmentsApi, 'addMember').mockResolvedValue(undefined)
    renderDialog()

    await userEvent.click(screen.getByRole('combobox', { name: 'Department' }))
    // Already serving in Education → listed but not selectable.
    expect(screen.getByRole('option', { name: /Education/ })).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(screen.getByRole('option', { name: /Finance/ }))

    await userEvent.click(screen.getByRole('combobox', { name: 'Role' }))
    await userEvent.click(screen.getByRole('option', { name: 'Secretary' }))

    await userEvent.click(screen.getByRole('button', { name: 'Add to department' }))

    expect(addMember).toHaveBeenCalledWith(3, expect.objectContaining({ memberId: 42, role: 'SECRETARY' }))
  })

  it("offers a department admin only their own departments", async () => {
    renderDialog([3])
    await userEvent.click(screen.getByRole('combobox', { name: 'Department' }))
    expect(screen.getByRole('option', { name: /Finance/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Education/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Office/ })).not.toBeInTheDocument()
  })
})
