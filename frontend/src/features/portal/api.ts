import axios from 'axios'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { env } from '@/config/env'
import type { MemberAttendanceSummary } from '@/features/attendance/types'
import type { Member } from '@/features/members/types'
import type { ApiEnvelope } from '@/lib/api/types'

/*
 * The member portal is separate from staff sign-in: its own short-lived
 * token, kept only for this browser tab, and its own HTTP client (no staff
 * token, no staff refresh).
 */
const TOKEN_KEY = 'fe-member-portal'

export const portalSession = {
  get: () => {
    try {
      return sessionStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set: (token: string) => {
    try {
      sessionStorage.setItem(TOKEN_KEY, token)
    } catch {
      // Private mode: the member just signs in again next time.
    }
  },
  clear: () => {
    try {
      sessionStorage.removeItem(TOKEN_KEY)
    } catch {
      // ignore
    }
  },
}

const portalHttp = axios.create({ baseURL: env.apiBaseUrl, timeout: 20_000 })
portalHttp.interceptors.request.use((config) => {
  const token = portalSession.get()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export type PortalMember = Omit<Member, 'notes' | 'createdBy' | 'updatedBy'> & {
  serviceGroups: {
    term: { id: number; nameEn: string; nameAm: string; isCurrent: boolean }
    group: { id: number; nameEn: string; nameAm: string }
  }[]
}

export const portalApi = {
  login: (code: string, phone: string) =>
    portalHttp.post<ApiEnvelope<{ token: string; expiresIn: number }>>('/portal/login', { code, phone }).then((r) => r.data.data),
  me: () => portalHttp.get<ApiEnvelope<PortalMember>>('/portal/me').then((r) => r.data.data),
  attendance: (range: { from?: string; to?: string }) =>
    portalHttp
      .get<ApiEnvelope<MemberAttendanceSummary>>('/portal/me/attendance', { params: range })
      .then((r) => r.data.data),
  photo: () => portalHttp.get<Blob>('/portal/me/photo', { responseType: 'blob' }).then((r) => r.data),
}

export function usePortalMember() {
  return useQuery({ queryKey: ['portal', 'me'], queryFn: portalApi.me, retry: false, enabled: Boolean(portalSession.get()) })
}

export function usePortalPhoto(member: Pick<PortalMember, 'hasPhoto' | 'updatedAt'> | undefined): string | null {
  const { data } = useQuery({
    queryKey: ['portal', 'photo', member?.updatedAt],
    queryFn: portalApi.photo,
    enabled: Boolean(member?.hasPhoto),
    staleTime: Infinity,
  })
  const url = useMemo(() => (data ? URL.createObjectURL(data) : null), [data])
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url)
  }, [url])
  return url
}
