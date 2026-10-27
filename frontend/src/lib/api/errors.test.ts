import { AxiosError, AxiosHeaders } from 'axios'
import { ApiError, applyApiFieldErrors, toApiError } from './errors'

function axiosErrorWith(status: number, data: unknown) {
  const config = { headers: new AxiosHeaders() }
  return new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, {}, {
    status,
    statusText: '',
    headers: {},
    config,
    data,
  })
}

describe('toApiError', () => {
  it('reads the API error body', () => {
    const err = toApiError(
      axiosErrorWith(422, {
        statusCode: 422,
        message: 'Validation failed',
        details: [{ field: 'phone', messages: ['bad phone'] }],
      }),
    )
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(422)
    expect(err.details).toHaveLength(1)
  })

  it('reports network failures distinctly', () => {
    const err = toApiError(new AxiosError('Network Error', 'ERR_NETWORK'))
    expect(err.isNetworkError).toBe(true)
  })
})

describe('applyApiFieldErrors', () => {
  it('attaches known field errors and ignores unknown ones', () => {
    const setError = vi.fn()
    const error = new ApiError(422, 'Validation failed', [
      { field: 'phone', messages: ['bad phone'] },
      { field: 'somethingElse', messages: ['x'] },
    ])
    expect(applyApiFieldErrors(error, setError, ['phone'])).toBe(true)
    expect(setError).toHaveBeenCalledTimes(1)
    expect(setError).toHaveBeenCalledWith('phone', { type: 'server', message: 'bad phone' })
  })
})
