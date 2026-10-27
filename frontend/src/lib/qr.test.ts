import { memberQrPayload, qrDataUrl } from './qr'

describe('member QR codes', () => {
  it('encode only the member ID', () => {
    expect(memberQrPayload('FE-00042')).toBe('FE-00042')
  })

  it('render as a PNG data URL', async () => {
    const url = await qrDataUrl('FE-00042', 128)
    expect(url).toMatch(/^data:image\/png;base64,/)
  })
})
