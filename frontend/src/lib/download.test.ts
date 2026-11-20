const { save, success } = vi.hoisted(() => ({ save: vi.fn(), success: vi.fn() }))
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => ({ save }),
}))
vi.mock('sonner', () => ({ toast: { success: (m: string) => success(m), error: vi.fn() } }))

import { saveBlob, saveDataUrl } from './download'

describe('saveBlob in the Android app', () => {
  beforeEach(() => {
    save.mockReset()
    success.mockReset()
  })

  it('hands the file to the app as base64 and says where it went', async () => {
    save.mockResolvedValue({ location: 'downloads' })
    await saveBlob(new Blob(['hi'], { type: 'text/plain' }), 'note.txt')
    expect(save).toHaveBeenCalledWith({ name: 'note.txt', mimeType: 'text/plain', data: 'aGk=' })
    expect(success).toHaveBeenCalledWith(expect.stringContaining('note.txt'))
  })

  it('saves a QR data URL as a PNG', async () => {
    save.mockResolvedValue({ location: 'pictures' })
    await saveDataUrl('data:image/png;base64,iVBORw0KGgo=', 'FE-00001-qr.png')
    expect(save).toHaveBeenCalledWith({ name: 'FE-00001-qr.png', mimeType: 'image/png', data: 'iVBORw0KGgo=' })
  })
})
