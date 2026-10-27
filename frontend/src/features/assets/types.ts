export const ASSET_CATEGORIES = [
  'FURNITURE',
  'ELECTRONICS',
  'MUSICAL_INSTRUMENT',
  'LITURGICAL',
  'BOOKS',
  'CLOTHING',
  'VEHICLE',
  'OTHER',
] as const
export const ASSET_CONDITIONS = ['NEW', 'GOOD', 'FAIR', 'POOR', 'BROKEN'] as const
export const ASSET_STATUSES = ['IN_USE', 'IN_STORE', 'UNDER_REPAIR', 'LOST', 'DISPOSED'] as const
export const ASSET_ACQUISITIONS = ['PURCHASED', 'DONATED'] as const

export type AssetCategory = (typeof ASSET_CATEGORIES)[number]
export type AssetCondition = (typeof ASSET_CONDITIONS)[number]
export type AssetStatus = (typeof ASSET_STATUSES)[number]
export type AssetAcquisition = (typeof ASSET_ACQUISITIONS)[number]

/** Mirrors the API's asset payload. */
export interface Asset {
  id: number
  assetCode: string
  name: string
  category: AssetCategory
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
  category: AssetCategory
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
  category?: AssetCategory
  status?: AssetStatus
  departmentId?: number
}

export interface AssetTotals {
  /** Owned assets (disposed ones are left out). */
  assets: number
  items: number
  value: number
}
