import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api/errors'
import { renderWithProviders as render } from '@/test/render'
import { emptyMemberForm } from '../schema'
import { MemberForm } from './member-form'

const filled = () => ({
  ...emptyMemberForm(),
  firstName: 'Abebe',
  fatherName: 'Kebede',
  gender: 'MALE' as const,
  dateOfBirth: '2005-09-11',
})

describe('<MemberForm>', () => {
  it('blocks submission and shows required-field errors', async () => {
    const onSubmit = vi.fn()
    render(<MemberForm defaultValues={emptyMemberForm()} submitLabel="Register" onSubmit={onSubmit} onCancel={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Register' }))

    expect(await screen.findByText('First name is required')).toBeInTheDocument()
    expect(screen.getByText('Gender is required')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows API field errors next to the matching input', async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiError(422, 'Validation failed', [{ field: 'firstName', messages: ['Name already used'] }]),
    )
    render(<MemberForm defaultValues={filled()} submitLabel="Register" onSubmit={onSubmit} onCancel={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Register' }))

    expect(await screen.findByText('Name already used')).toBeInTheDocument()
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('shows non-field API errors as a form-level message', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(500, 'An unexpected error occurred'))
    render(<MemberForm defaultValues={filled()} submitLabel="Register" onSubmit={onSubmit} onCancel={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Register' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The server is unavailable right now')
  })

  it('offers a grade picker per class type and keeps the chosen grade', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <MemberForm
        defaultValues={{ ...filled(), classGrades: { '1': '12' } }}
        submitLabel="Register"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText('Classes')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Mezmur Class' })).toHaveTextContent('Ezel (ለ)')

    await userEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ classGrades: { '1': '12' } }), { kind: 'keep' })
  })
})
