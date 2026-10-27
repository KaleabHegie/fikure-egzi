import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { api, http } from '@/lib/api/client'
import type { MemberPayload } from './schema'
import type { ImportPreview, Member, MemberHistory, MemberListParams, MemberStats } from './types'

const BASE = '/members'

export const memberKeys = {
  all: ['members'] as const,
  lists: () => [...memberKeys.all, 'list'] as const,
  list: (params: MemberListParams) => [...memberKeys.lists(), params] as const,
  detail: (id: number) => [...memberKeys.all, 'detail', id] as const,
  stats: () => [...memberKeys.all, 'stats'] as const,
  photo: (id: number, version: string) => [...memberKeys.all, 'photo', id, version] as const,
  history: (id: number) => [...memberKeys.all, 'history', id] as const,
}

export const membersApi = {
  list: (params: MemberListParams) => api.getPage<Member>(BASE, params),
  get: (id: number) => api.get<Member>(`${BASE}/${id}`),
  stats: () => api.get<MemberStats>(`${BASE}/stats`),
  create: (payload: MemberPayload) => api.post<Member>(BASE, payload),
  update: (id: number, payload: Partial<MemberPayload>) => api.patch<Member>(`${BASE}/${id}`, payload),
  remove: (id: number) => api.delete(`${BASE}/${id}`),
  photo: (id: number) => http.get<Blob>(`${BASE}/${id}/photo`, { responseType: 'blob' }).then((r) => r.data),
  uploadPhoto: (id: number, photo: Blob) => {
    const body = new FormData()
    body.append('photo', photo, 'photo.jpg')
    // Let the browser set the multipart boundary.
    return http
      .put<{ data: Member }>(`${BASE}/${id}/photo`, body, { headers: { 'Content-Type': undefined } })
      .then((r) => r.data.data)
  },
  history: (id: number) => api.get<MemberHistory>(`${BASE}/${id}/history`),
  importTemplate: (lang: 'am' | 'en') =>
    http.get<Blob>(`${BASE}/import/template`, { params: { lang }, responseType: 'blob' }).then((r) => r.data),
  previewImport: (file: File) => {
    const body = new FormData()
    body.append('file', file)
    return http
      .post<{ data: ImportPreview }>(`${BASE}/import/preview`, body, { headers: { 'Content-Type': undefined } })
      .then((r) => r.data.data)
  },
  commitImport: (file: File) => {
    const body = new FormData()
    body.append('file', file)
    // Large files take a while: one transaction for every row.
    return http
      .post<{ data: { imported: number } }>(`${BASE}/import`, body, {
        headers: { 'Content-Type': undefined },
        timeout: 300_000,
      })
      .then((r) => r.data.data)
  },
  removePhoto: (id: number) => http.delete<{ data: Member }>(`${BASE}/${id}/photo`).then((r) => r.data.data),
}

/**
 * Object URL for a member's photo, or null. Photos are private, so they are
 * fetched with the auth header (a plain <img src> could not send it). The
 * record's updatedAt versions the cache, so a new photo is picked up.
 */
export function useMemberPhoto(member: Pick<Member, 'id' | 'hasPhoto' | 'updatedAt'> | undefined): string | null {
  const { data } = useQuery({
    queryKey: memberKeys.photo(member?.id ?? 0, member?.updatedAt ?? ''),
    queryFn: () => membersApi.photo(member!.id),
    enabled: Boolean(member?.hasPhoto),
    staleTime: Infinity,
    gcTime: 5 * 60_000,
  })
  const url = useMemo(() => (data && member?.hasPhoto ? URL.createObjectURL(data) : null), [data, member?.hasPhoto])
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url)
  }, [url])
  return url
}

export type PhotoChange = { kind: 'keep' } | { kind: 'set'; file: Blob } | { kind: 'remove' }

/** Applies a photo change after the member record itself is saved. */
export async function applyPhotoChange(id: number, change: PhotoChange): Promise<Member | null> {
  if (change.kind === 'set') return membersApi.uploadPhoto(id, change.file)
  if (change.kind === 'remove') return membersApi.removePhoto(id)
  return null
}

export function useMembers(params: MemberListParams) {
  return useQuery({
    queryKey: memberKeys.list(params),
    queryFn: () => membersApi.list(params),
    placeholderData: keepPreviousData,
  })
}

export function useMember(id: number) {
  return useQuery({
    queryKey: memberKeys.detail(id),
    queryFn: () => membersApi.get(id),
    enabled: Number.isInteger(id) && id > 0,
  })
}

export function useMemberHistory(id: number) {
  return useQuery({
    queryKey: memberKeys.history(id),
    queryFn: () => membersApi.history(id),
    enabled: Number.isInteger(id) && id > 0,
  })
}

export function useMemberStats() {
  return useQuery({ queryKey: memberKeys.stats(), queryFn: membersApi.stats })
}

export function useCreateMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: membersApi.create,
    onSuccess: (member) => {
      qc.setQueryData(memberKeys.detail(member.id), member)
      void qc.invalidateQueries({ queryKey: memberKeys.lists() })
      void qc.invalidateQueries({ queryKey: memberKeys.stats() })
    },
  })
}

export function useUpdateMember(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<MemberPayload>) => membersApi.update(id, payload),
    onSuccess: (member) => {
      qc.setQueryData(memberKeys.detail(id), member)
      void qc.invalidateQueries({ queryKey: memberKeys.lists() })
      void qc.invalidateQueries({ queryKey: memberKeys.stats() })
    },
  })
}

export function useDeleteMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: membersApi.remove,
    onSuccess: (_void, id) => {
      qc.removeQueries({ queryKey: memberKeys.detail(id) })
      void qc.invalidateQueries({ queryKey: memberKeys.lists() })
      void qc.invalidateQueries({ queryKey: memberKeys.stats() })
    },
  })
}
