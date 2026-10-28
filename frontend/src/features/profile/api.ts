import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, http, refreshSession } from '@/lib/api/client'
import { session } from '@/lib/auth/session'

export interface Profile {
  id: number
  email: string
  fullName: string
  phone: string | null
  lastLoginAt: string | null
  createdAt: string
  role: { code: string; name: string } | null
  departments: { id: number; nameEn: string; nameAm: string }[]
  member: { id: number; memberCode: string; firstName: string; fatherName: string; grandfatherName: string | null } | null
}

export interface ProfileInput {
  fullName: string
  email: string
  phone: string | null
  currentPassword?: string
}

const KEY = ['profile'] as const

export const profileApi = {
  get: () => api.get<Profile>('/auth/profile'),
  update: (input: ProfileInput) => api.patch<Profile>('/auth/profile', input),
  changePassword: (currentPassword: string, newPassword: string) =>
    http
      // This device's refresh token: it stays signed in, other devices are signed out.
      .put('/auth/password', { currentPassword, newPassword, refreshToken: session.getRefreshToken() ?? undefined })
      .then(() => undefined),
}

export function useProfile() {
  return useQuery({ queryKey: KEY, queryFn: profileApi.get })
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: profileApi.update,
    onSuccess: async (profile) => {
      qc.setQueryData(KEY, profile)
      // Re-issue the session so the header shows the new name right away.
      await refreshSession().catch(() => undefined)
    },
  })
}
