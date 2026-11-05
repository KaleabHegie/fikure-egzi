export const ASSET_CONDITIONS = ['NEW', 'GOOD', 'FAIR', 'POOR', 'BROKEN'] as const
export const ASSET_STATUSES = ['IN_USE', 'IN_STORE', 'UNDER_REPAIR', 'LOST', 'DISPOSED'] as const
export const ASSET_ACQUISITIONS = ['PURCHASED', 'DONATED'] as const

export type AssetCondition = (typeof ASSET_CONDITIONS)[number]
export type AssetStatus = (typeof ASSET_STATUSES)[number]
export type AssetAcquisition = (typeof ASSET_ACQUISITIONS)[number]

/** Admin-managed category (seeded defaults carry a code; user-created ones don't). */
export interface AssetCategory {
  id: number
  code: string | null
  nameEn: string
  nameAm: string
  sortOrder?: number
}

export interface AssetCategoryInput {
  nameEn: string
  nameAm: string
}

/** Mirrors the API's asset payload. */
export interface Asset {
  id: number
  assetCode: string
  name: string
  categoryId: number
  category: Pick<AssetCategory, 'id' | 'code' | 'nameEn' | 'nameAm'>
  description: string | null
  quantity: number
  condition: AssetCondition
  status: AssetStatus
  location: string | null
  serialNumber: string | null
  acquisition: AssetAcquisition | null
  acquiredOn: string | null
  /** Price or estimated value, in birr. */
  cost: number | null
  donorName: string | null
  departmentId: number
  department: { id: number; nameEn: string; nameAm: string }
  notes: string | null
  hasPhoto: boolean
  createdAt: string
  updatedAt: string
}

export interface AssetInput {
  name: string
  categoryId: number
  departmentId: number
  description: string | null
  quantity: number
  condition: AssetCondition
  status: AssetStatus
  location: string | null
  serialNumber: string | null
  acquisition: AssetAcquisition | null
  acquiredOn: string | null
  cost: number | null
  donorName: string | null
  notes: string | null
}

export interface AssetListParams {
  page: number
  pageSize: number
  search?: string
  categoryId?: number
  status?: AssetStatus
  departmentId?: number
}

export interface AssetTotals {
  /** Owned assets (disposed ones are left out). */
  assets: number
  items: number
  value: number
}
