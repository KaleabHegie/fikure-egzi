import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import {
  EDUCATION_LEVELS,
  type EducationLevel,
  GENDERS,
  type Gender,
  MEMBERSHIP_STATUSES,
  type MemberListParams,
  type MembershipStatus,
} from './types'

const DEFAULT_PAGE_SIZE = 20

function pick<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined
}

const yesNo = (value: string | null) => (value === 'true' ? true : value === 'false' ? false : undefined)
const isoDay = (value: string | null) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined)

function positiveInt(value: string | null, fallback: number): number {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : fallback
}

/**
 * List filters live in the URL, so a filtered view can be bookmarked or
 * shared, and coming back from a member's page restores it.
 */
export function useMemberListParams() {
  const [searchParams, setSearchParams] = useSearchParams()

  const params = useMemo<MemberListParams>(
    () => ({
      page: positiveInt(searchParams.get('page'), 1),
      pageSize: Math.min(positiveInt(searchParams.get('pageSize'), DEFAULT_PAGE_SIZE), 100),
      search: searchParams.get('search') || undefined,
      gender: pick<Gender>(searchParams.get('gender'), GENDERS),
      status: pick<MembershipStatus>(searchParams.get('status'), MEMBERSHIP_STATUSES),
      educationLevel: pick<EducationLevel>(searchParams.get('educationLevel'), EDUCATION_LEVELS),
      classGradeId: searchParams.get('classGradeId') ? positiveInt(searchParams.get('classGradeId'), 0) || undefined : undefined,
      departmentId: searchParams.get('departmentId') ? positiveInt(searchParams.get('departmentId'), 0) || undefined : undefined,
      selfRegistered: searchParams.get('selfRegistered') === 'true' || undefined,
      hasPhoto: yesNo(searchParams.get('hasPhoto')),
      classTypeId: searchParams.get('classTypeId') ? positiveInt(searchParams.get('classTypeId'), 0) || undefined : undefined,
      placed: yesNo(searchParams.get('placed')),
      inDepartment: yesNo(searchParams.get('inDepartment')),
      joinedFrom: isoDay(searchParams.get('joinedFrom')),
      joinedTo: isoDay(searchParams.get('joinedTo')),
      completion: pick(searchParams.get('completion'), ['complete', 'underHalf'] as const),
    }),
    [searchParams],
  )

  /** Applies changes; any change other than `page` resets to page 1. */
  const update = useCallback(
    (changes: Partial<Record<keyof MemberListParams, string | number | undefined>>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [key, value] of Object.entries(changes)) {
            if (value === undefined || value === '') next.delete(key)
            else next.set(key, String(value))
          }
          if (!('page' in changes)) next.delete('page')
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const hasFilters = Boolean(
    params.search || params.gender || params.status || params.educationLevel || params.classGradeId || params.departmentId || params.selfRegistered || params.hasPhoto !== undefined ||
      params.classTypeId || params.placed !== undefined || params.inDepartment !== undefined || params.joinedFrom || params.joinedTo || params.completion,
  )
  const reset = useCallback(() => setSearchParams({}, { replace: true }), [setSearchParams])

  return { params, update, reset, hasFilters }
}
