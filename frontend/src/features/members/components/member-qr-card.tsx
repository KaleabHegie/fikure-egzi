import { Download, Printer, QrCode } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { memberQrPayload, useQrDataUrl } from '@/lib/qr'
import type { Member } from '../types'

/** QR code of the member's ID, with download and ID-card print actions. */
export function MemberQrCard({ member }: { member: Member }) {
  const { t } = useTranslation()
  const { data: qr } = useQrDataUrl(memberQrPayload(member.memberCode))

  const download = () => {
    if (!qr) return
    const a = document.createElement('a')
    a.href = qr
    a.download = `${member.memberCode}-qr.png`
    a.click()
  }

  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-medium">
        <QrCode className="size-4 text-muted-foreground" />
        {t('members.qr.title')}
      </h2>
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        <div className="rounded-lg bg-white p-2 ring-1 ring-border">
          {qr ? (
            <img src={qr} alt={t('members.qr.alt', { code: member.memberCode })} className="size-36" />
          ) : (
            <Skeleton className="size-36" />
          )}
        </div>
        <div className="space-y-3 text-center sm:text-left">
          <div>
            <p className="font-mono text-lg font-semibold tracking-wide">{member.memberCode}</p>
            <p className="text-xs text-muted-foreground">{t('members.qr.hint')}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
            <Button variant="outline" size="sm" onClick={download} disabled={!qr}>
              <Download />
              {t('members.qr.download')}
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to={`/members/cards?id=${member.id}`} target="_blank" rel="noopener">
                <Printer />
                {t('members.qr.printCard')}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
