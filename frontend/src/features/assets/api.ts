import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import type { PhotoChange } from '@/features/members/api'
import { api, http } from '@/lib/api/client'
import type { PaginationMeta } from '@/lib/api/types'
import type { Asset, AssetInput, AssetListParams, AssetTotals } from './types'

const BASE = '/assets'

export const assetKeys = {
  all: ['assets'] as const,
  list: (p: AssetListParams) => [...assetKeys.all, 'list', p] as const,
  detail: (id: number) => [...assetKeys.all, 'detail', id] as const,
  photo: (id: number, version: string) => [...assetKeys.all, 'photo', id, version] as const,
}

export const assetsApi = {
  list: (p: AssetListParams) =>
    http
      .get<{ data: Asset[]; meta: PaginationMeta & { totals: AssetTotals } }>(BASE, { params: p })
      .then((r) => r.data),
  get: (id: number) => api.get<Asset>(`${BASE}/${id}`),
  create: (input: AssetInput) => api.post<Asset>(BASE, input),
  update: (id: number, input: Partial<AssetInput>) => api.patch<Asset>(`${BASE}/${id}`, input),
  remove: (id: number) => api.delete(`${BASE}/${id}`),
  photo: (id: number) => http.get<Blob>(`${BASE}/${id}/photo`, { responseType: 'blob' }).then((r) => r.data),
  uploadPhoto: (id: number, photo: Blob) => {
    const body = new FormData()
    body.append('photo', photo, 'photo.jpg')
    return http
      .put<{ data: Asset }>(`${BASE}/${id}/photo`, body, { headers: { 'Content-Type': undefined } })
      .then((r) => r.data.data)
  },
  removePhoto: (id: number) => http.delete<{ data: Asset }>(`${BASE}/${id}/photo`).then((r) => r.data.data),
}

export function useAssets(p: AssetListParams) {
  return useQuery({ queryKey: assetKeys.list(p), queryFn: () => assetsApi.list(p), placeholderData: keepPreviousData })
}

export function useAsset(id: number) {
  return useQuery({ queryKey: assetKeys.detail(id), queryFn: () => assetsApi.get(id), enabled: id > 0 })
}

/** Object URL of an asset's photo (fetched with the auth header), or null. */
export function useAssetPhoto(asset: Pick<Asset, 'id' | 'hasPhoto' | 'updatedAt'> | undefined): string | null {
  const { data } = useQuery({
    queryKey: assetKeys.photo(asset?.id ?? 0, asset?.updatedAt ?? ''),
    queryFn: () => assetsApi.photo(asset!.id),
    enabled: Boolean(asset?.hasPhoto),
    staleTime: Infinity,
    gcTime: 5 * 60_000,
  })
  const url = useMemo(() => (data && asset?.hasPhoto ? URL.createObjectURL(data) : null), [data, asset?.hasPhoto])
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url)
  }, [url])
  return url
}

/** Applies a photo change after the asset itself is saved. */
export async function applyAssetPhoto(id: number, change: PhotoChange): Promise<void> {
  if (change.kind === 'set') await assetsApi.uploadPhoto(id, change.file)
  if (change.kind === 'remove') await assetsApi.removePhoto(id)
}

export function useAssetMutation<TArgs, TResult = unknown>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSettled: () => void qc.invalidateQueries({ queryKey: assetKeys.all }) })
}
