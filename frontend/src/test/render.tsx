import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { classKeys } from '@/features/classes/api'
import type { ClassType } from '@/features/classes/types'

export const TEST_CLASS_TYPES: ClassType[] = [
  {
    id: 1,
    code: 'MEZMUR',
    nameEn: 'Mezmur Class',
    nameAm: 'የመዝሙር ክፍል',
    descriptionEn: null,
    descriptionAm: null,
    sortOrder: 1,
    isActive: true,
    departmentId: 3,
    department: { id: 3, nameEn: 'Mezmur', nameAm: 'መዝሙር ክፍል' },
    memberCount: 0,
    grades: [
      { id: 11, classTypeId: 1, code: 'GEEZ', nameEn: "Ge'ez", nameAm: 'ግዕዝ', shortLabel: 'ሐ', sortOrder: 1, isActive: true, memberCount: 0 },
      { id: 12, classTypeId: 1, code: 'EZEL', nameEn: 'Ezel', nameAm: 'ዕዝል', shortLabel: 'ለ', sortOrder: 2, isActive: true, memberCount: 0 },
    ],
  },
]

/** Renders with a QueryClient whose class-type cache is pre-filled (no network). */
export function renderWithProviders(ui: React.ReactElement, classTypes: ClassType[] = TEST_CLASS_TYPES) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(classKeys.list(false), classTypes)
  client.setQueryData(classKeys.list(true), classTypes)
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}
