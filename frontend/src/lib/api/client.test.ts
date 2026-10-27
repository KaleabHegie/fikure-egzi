import { AxiosError, AxiosHeaders } from 'axios'
import { session } from '@/lib/auth/session'

const post = vi.fn()
vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>()
  const create = (config?: object) => {
    const instance = actual.default.create(config)
    instance.post = post
    return instance
  }
  return { ...actual, default: { ...actual.default, create } }
})

const { refreshSession } = await import('./client')

function failWith(status: number) {
  const config = { headers: new AxiosHeaders() }
  return new AxiosError('fail', 'ERR', config, {}, { status, statusText: '', headers: {}, config, data: {} })
}

describe('refreshSession', () => {
  beforeEach(() => {
    localStorage.setItem('fe.refreshToken', 'r'.repeat(64))
    post.mockReset()
  })

  it('keeps the session when the API is temporarily unavailable', async () => {
    post.mockRejectedValue(failWith(502))
    await expect(refreshSession()).rejects.toMatchObject({ status: 502 })
    expect(session.getRefreshToken()).toBe('r'.repeat(64))
  })

  it('ends the session when the refresh token is rejected', async () => {
    post.mockRejectedValue(failWith(401))
    await expect(refreshSession()).rejects.toMatchObject({ status: 401 })
    expect(session.getRefreshToken()).toBeNull()
  })
})
