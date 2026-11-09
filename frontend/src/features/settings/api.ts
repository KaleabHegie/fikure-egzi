import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api/client'

/** Mirrors the API's AppSettings (GET/PATCH /settings, office only). */
export interface AppSettings {
  /** New people may register themselves through the Telegram bot. */
  selfRegistration: boolean
}

const settingsKey = ['settings'] as const

export const settingsApi = {
  get: () => api.get<AppSettings>('/settings'),
  update: (changes: Partial<AppSettings>) => api.patch<AppSettings>('/settings', changes),
}

export function useSettings() {
  return useQuery({ queryKey: settingsKey, queryFn: settingsApi.get })
}

export function useUpdateSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: settingsApi.update,
    onSuccess: (settings) => queryClient.setQueryData(settingsKey, settings),
  })
}
