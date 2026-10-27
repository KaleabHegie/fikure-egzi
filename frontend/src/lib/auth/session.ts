import type { AuthTokens, AuthUser } from './types'

/**
 * Client-side session store.
 *
 * The access token lives only in memory (never persisted), which limits what
 * an XSS payload could lift from storage. The refresh token is persisted so a
 * reload can silently restore the session via POST /auth/refresh.
 */
const REFRESH_TOKEN_KEY = 'fe.refreshToken'

export interface SessionSnapshot {
  accessToken: string | null
  user: AuthUser | null
}

let snapshot: SessionSnapshot = { accessToken: null, user: null }
const listeners = new Set<() => void>()

function emit(next: SessionSnapshot) {
  snapshot = next
  listeners.forEach((l) => l())
}

function readRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY)
  } catch {
    return null
  }
}

export const session = {
  get: (): SessionSnapshot => snapshot,
  getAccessToken: () => snapshot.accessToken,
  getRefreshToken: readRefreshToken,

  start(tokens: AuthTokens) {
    try {
      localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken)
    } catch {
      // Storage unavailable (private mode): the session just won't survive a reload.
    }
    emit({ accessToken: tokens.accessToken, user: tokens.user })
  },

  clear() {
    try {
      localStorage.removeItem(REFRESH_TOKEN_KEY)
    } catch {
      // ignore
    }
    emit({ accessToken: null, user: null })
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
