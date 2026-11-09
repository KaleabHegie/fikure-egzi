import { ArrowLeft, Loader2, Printer } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ecToday } from '@/lib/ethiopian-calendar'
import { IdCard } from '../components/id-card'
import { usePrintMembers } from '../use-print-members'

/** Cards per A4 page: 2 across, 5 down, each at true CR80 size. */
const PER_PAGE = 10
const CONTACT_KEY = 'fe.idCards.contact'
const DEFAULT_CONTACT = '0111557739 | 0901044444'

function remembered(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) || fallback
  } catch {
    return fallback
  }
}

/**
 * Printable A4 sheets of membership ID cards in the school's card design:
 * one member (?id=42) or every member matching the member-list filters.
 * The validity years and the office numbers can be adjusted before printing.
 */
export function MemberIdCardsPage() {
  const { t } = useTranslation()
  const { singleId, data, isPending, isError, error, refetch } = usePrintMembers()
  const year = ecToday().year
  const [validity, setValidity] = useState(`${year}-${year + 1}`)
  const [contact, setContact] = useState(() => remembered(CONTACT_KEY, DEFAULT_CONTACT))

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />

  const saveContact = (value: string) => {
    setContact(value)
    try {
      localStorage.setItem(CONTACT_KEY, value)
    } catch {
      // Private windows refuse storage; the value still applies to this print.
    }
  }

  return (
    <div className="min-h-svh bg-muted/40 print:bg-white">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-end gap-3 border-b bg-background/95 px-6 py-3 backdrop-blur">
        <Button asChild variant="ghost" size="sm" className="self-center">
          <Link to={singleId ? `/members/${singleId}` : '/members'}>
            <ArrowLeft />
            {t('nav.members')}
          </Link>
        </Button>
        <div className="min-w-48 flex-1 self-center">
          <h1 className="font-semibold">{t('members.idCards.title')}</h1>
          <p className="text-xs text-muted-foreground">
            {isPending ? t('members.idCards.loading') : t('members.idCards.count', { count: data.length })}
          </p>
        </div>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          {t('members.idCards.validity')}
          <Input id="id-card-validity" value={validity} onChange={(e) => setValidity(e.target.value)} className="h-9 w-32" />
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          {t('members.idCards.contact')}
          <Input id="id-card-contact" value={contact} onChange={(e) => saveContact(e.target.value)} className="h-9 w-56" />
        </label>
        <Button onClick={() => window.print()} disabled={isPending || data.length === 0}>
          {isPending ? <Loader2 className="animate-spin" /> : <Printer />}
          {t('members.qr.print')}
        </Button>
      </div>

      {data && (
        <div className="flex flex-col items-center gap-6 py-6 print:block print:py-0">
          {Array.from({ length: Math.ceil(data.length / PER_PAGE) }, (_, page) => (
            // One A4 page inside the 10 mm print margins: 2 × 5 cards with cutting room between them.
            <section
              key={page}
              className="qr-page grid h-[277mm] w-[190mm] grid-cols-[85.6mm_85.6mm] content-start justify-center gap-x-[6mm] gap-y-[1.5mm] bg-white shadow-sm print:shadow-none"
            >
              {data.slice(page * PER_PAGE, (page + 1) * PER_PAGE).map((m) => (
                <IdCard key={m.id} member={m} validity={validity} contact={contact} />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
