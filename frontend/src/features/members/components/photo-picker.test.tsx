import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PhotoPicker } from './photo-picker'

describe('<PhotoPicker>', () => {
  it('rejects files that are not JPEG/PNG/WebP without changing the photo', async () => {
    const onChange = vi.fn()
    const { container } = render(<PhotoPicker currentUrl={null} change={{ kind: 'keep' }} onChange={onChange} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    await userEvent.upload(input, new File(['gif'], 'a.gif', { type: 'image/gif' }), { applyAccept: false })

    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a JPEG, PNG or WebP image')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('marks an existing photo for removal', async () => {
    const onChange = vi.fn()
    render(<PhotoPicker currentUrl="blob:photo" change={{ kind: 'keep' }} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Remove photo' }))

    expect(onChange).toHaveBeenCalledWith({ kind: 'remove' })
  })
})
