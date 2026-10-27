import axios, { type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios'
import { env } from '@/config/env'
import { session } from '@/lib/auth/session'
import type { AuthTokens } from '@/lib/auth/types'
import { toApiError } from './errors'
import type { ApiEnvelope, Page } from './types'

const TIMEOUT_MS = 20_000

/** Bare instance for auth calls — no interceptors, so refresh can't recurse. */
const authHttp = axios.create({ baseURL: env.apiBaseUrl, timeout: TIMEOUT_MS })

/** The instance every feature uses. */
export const http = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
})

http.interceptors.request.use((config) => {
  const token = session.getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let refreshInFlight: Promise<AuthTokens> | null = null

/**
 * Exchanges the stored refresh token for a new token pair. Concurrent callers
 * share one request, because the API rotates (and revokes) the token on use.
 */
export function refreshSession(): Promise<AuthTokens> {
  const refreshToken = session.getRefreshToken()
  if (!refreshToken) return Promise.reject(new Error('No refresh token'))

  refreshInFlight ??= authHttp
    .post<ApiEnvelope<AuthTokens>>('/auth/refresh', { refreshToken })
    .then((res) => {
      session.start(res.data.data)
      return res.data.data
    })
    .catch((error: unknown) => {
      const apiError = toApiError(error)
      // Only a definite rejection ends the session. A network error or a 5xx
      // (API restarting, deploy in progress) keeps the refresh token for the next try.
      if (apiError.status === 401 || apiError.status === 403) session.clear()
      throw apiError
    })
    .finally(() => {
      refreshInFlight = null
    })
  return refreshInFlight
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean }

http.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    const config = (axios.isAxiosError(error) ? error.config : undefined) as RetriableConfig | undefined
    const status = axios.isAxiosError(error) ? error.response?.status : undefined

    // One silent retry after refreshing an expired access token.
    if (status === 401 && config && !config._retried && session.getRefreshToken()) {
      config._retried = true
      try {
        await refreshSession()
        return http(config)
      } catch {
        // fall through: session.clear() already sent the user to login
      }
    }
    throw toApiError(error)
  },
)

export const authApi = {
  login: (email: string, password: string) =>
    authHttp
      .post<ApiEnvelope<AuthTokens>>('/auth/login', { email, password })
      .then((r) => r.data.data)
      .catch((e: unknown) => {
        throw toApiError(e)
      }),
  logout: (refreshToken: string) => http.post('/auth/logout', { refreshToken }),
}

/** Thin helpers that unwrap the API envelope so callers get plain data. */
export const api = {
  get: <T>(url: string, config?: AxiosRequestConfig) =>
    http.get<ApiEnvelope<T>>(url, config).then((r) => r.data.data),
  getPage: <T>(url: string, params?: object) =>
    http.get<Page<T>>(url, { params }).then((r) => r.data),
  post: <T>(url: string, body?: unknown) =>
    http.post<ApiEnvelope<T>>(url, body).then((r) => r.data.data),
  patch: <T>(url: string, body?: unknown) =>
    http.patch<ApiEnvelope<T>>(url, body).then((r) => r.data.data),
  put: <T>(url: string, body?: unknown) =>
    http.put<ApiEnvelope<T>>(url, body).then((r) => r.data.data),
  delete: (url: string) => http.delete(url).then(() => undefined),
}
