import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Loader2, Printer } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { membersApi } from '../api'
import { QrTile } from '../components/qr-tile'
import type { Member, MemberListParams } from '../types'
import { useMemberListParams } from '../use-member-list-params'

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

/** QR codes per A4 page: 4 across, 5 down. */
const PER_PAGE = 20

/**
 * Printable A4 sheets of member QR codes (name + ID under each): one member
 * (?id=42) or every member matching the member-list filters, 4 × 5 per page.
 */
export function MemberCardsPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const { params } = useMemberListParams()
  const singleId = Number(searchParams.get('id')) || null
  const { page: _page, pageSize: _pageSize, ...filters } = params

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['member-cards', singleId, filters],
    queryFn: async () => (singleId ? [await membersApi.get(singleId)] : fetchAll(filters)),
  })

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />

  return (
    <div className="min-h-svh bg-muted/40 print:bg-white">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b bg-background/95 px-6 py-3 backdrop-blur">
        <Button asChild variant="ghost" size="sm">
          <Link to={singleId ? `/members/${singleId}` : '/members'}>
            <ArrowLeft />
            {t('nav.members')}
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="font-semibold">{t('members.qr.cardsTitle')}</h1>
          <p className="text-xs text-muted-foreground">
            {isPending ? t('members.qr.loadingCards') : t('members.qr.cardsCount', { count: data.length })}
          </p>
        </div>
        <Button onClick={() => window.print()} disabled={isPending || data.length === 0}>
          {isPending ? <Loader2 className="animate-spin" /> : <Printer />}
          {t('members.qr.print')}
        </Button>
      </div>

      {data && (
        <div className="flex flex-col items-center gap-6 py-6 print:block print:py-0">
          {Array.from({ length: Math.ceil(data.length / PER_PAGE) }, (_, page) => (
            // One A4 page: 190 × 277 mm inside the 10 mm print margins.
            <section
              key={page}
              className="qr-page grid h-[277mm] w-[190mm] grid-cols-4 grid-rows-5 bg-white shadow-sm print:shadow-none"
            >
              {data.slice(page * PER_PAGE, (page + 1) * PER_PAGE).map((m) => (
                <QrTile key={m.id} member={m} />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
