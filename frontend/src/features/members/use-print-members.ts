import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { membersApi } from './api'
import type { Member, MemberListParams } from './types'
import { useMemberListParams } from './use-member-list-params'

const PAGE = 100

/** Every member matching the list filters (the API pages at 100). */
async function fetchAll(params: Omit<MemberListParams, 'page' | 'pageSize'>): Promise<Member[]> {
  const first = await membersApi.list({ ...params, page: 1, pageSize: PAGE, sortBy: 'memberCode', sortOrder: 'asc' })
  const rest = await Promise.all(
    Array.from({ length: first.meta.totalPages - 1 }, (_, i) =>
      membersApi.list({ ...params, page: i + 2, pageSize: PAGE, sortBy: 'memberCode', sortOrder: 'asc' }),
    ),
  )
  return [...first.data, ...rest.flatMap((p) => p.data)]
}

/**
 * The members a print sheet is for: one member (?id=42), or every member
 * matching the member-list filters carried in the URL.
 */
export function usePrintMembers() {
  const [searchParams] = useSearchParams()
  const { params } = useMemberListParams()
  const singleId = Number(searchParams.get('id')) || null
  const { page: _page, pageSize: _pageSize, ...filters } = params
  const query = useQuery({
    queryKey: ['member-print', singleId, filters],
    queryFn: async () => (singleId ? [await membersApi.get(singleId)] : fetchAll(filters)),
  })
  return { singleId, ...query }
}
