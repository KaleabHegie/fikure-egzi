import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, http } from '@/lib/api/client'
import { memberKeys } from '@/features/members/api'
import type { ClassGrade, ClassGradeInput, ClassType, ClassTypeInput } from './types'

export const classKeys = {
  all: ['classes'] as const,
  list: (includeInactive: boolean) => [...classKeys.all, { includeInactive }] as const,
}

export const classesApi = {
  list: (includeInactive: boolean) => api.get<ClassType[]>('/class-types', { params: { includeInactive } }),
  createType: (input: ClassTypeInput) => api.post<ClassType>('/class-types', input),
  updateType: (id: number, input: Partial<ClassTypeInput>) => api.patch<ClassType>(`/class-types/${id}`, input),
  removeType: (id: number) => api.delete(`/class-types/${id}`),
  reorderTypes: (ids: number[]) => http.put('/class-types/order', { ids }).then(() => undefined),
  createGrade: (typeId: number, input: ClassGradeInput) =>
    api.post<ClassGrade>(`/class-types/${typeId}/grades`, input),
  updateGrade: (id: number, input: Partial<ClassGradeInput>) =>
    api.patch<ClassGrade>(`/class-grades/${id}`, input),
  removeGrade: (id: number) => api.delete(`/class-grades/${id}`),
  reorderGrades: (typeId: number, ids: number[]) =>
    http.put(`/class-types/${typeId}/grades/order`, { ids }).then(() => undefined),
}

/** Class types with their grades. Defaults to what is currently offered (active only). */
export function useClassTypes(includeInactive = false) {
  return useQuery({
    queryKey: classKeys.list(includeInactive),
    queryFn: () => classesApi.list(includeInactive),
    staleTime: 5 * 60_000,
  })
}

/** Wraps a class mutation so every class list (and member views showing class names) refreshes. */
export function useClassMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: classKeys.all })
      void qc.invalidateQueries({ queryKey: memberKeys.all })
    },
  })
}
