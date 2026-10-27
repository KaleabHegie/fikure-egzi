import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/render'
import { QrTile } from './qr-tile'

describe('<QrTile>', () => {
  it('shows the QR code of the member ID with the name and ID under it', async () => {
    renderWithProviders(
      <QrTile member={{ memberCode: 'FE-00042', firstName: 'Hanna', fatherName: 'Girma', grandfatherName: 'Tadesse' }} />,
    )
    expect(screen.getByText('Hanna Girma Tadesse')).toBeInTheDocument()
    expect(screen.getByText('FE-00042')).toBeInTheDocument()
    const qr = await screen.findByAltText('QR FE-00042')
    expect(qr.getAttribute('src')).toMatch(/^data:image\/png;base64,/)
  })
})
