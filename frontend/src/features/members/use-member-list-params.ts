import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import {
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
      classGradeId: searchParams.get('classGradeId') ? positiveInt(searchParams.get('classGradeId'), 0) || undefined : undefined,
      departmentId: searchParams.get('departmentId') ? positiveInt(searchParams.get('departmentId'), 0) || undefined : undefined,
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

  const hasFilters = Boolean(params.search || params.gender || params.status || params.classGradeId || params.departmentId)
  const reset = useCallback(() => setSearchParams({}, { replace: true }), [setSearchParams])

  return { params, update, reset, hasFilters }
}
