import { Printer } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import logoUrl from '@/assets/logo.png'
import { AMHARIC_NAME } from '@/components/layout/brand-mark'
import { Button } from '@/components/ui/button'
import { formatEth } from '@/lib/ethiopian-calendar'
import { isNativeApp } from '@/lib/native'
import { cn } from '@/lib/utils'

/**
 * Prints the page. Hidden in the Android app, whose web view cannot print;
 * reports are printed from the website.
 */
export function PrintButton({
  className,
  disabled,
  size = 'default',
}: {
  className?: string
  disabled?: boolean
  size?: 'default' | 'sm'
}) {
  const { t } = useTranslation()
  const [native] = useState(isNativeApp)
  if (native) return null
  return (
    <Button variant="outline" size={size} onClick={() => window.print()} disabled={disabled} className={cn('print:hidden', className)}>
      <Printer />
      {t('print.print')}
    </Button>
  )
}

/**
 * The top of a printed report: the seal and school name, what the report is, the
 * filters it was printed with, and when. Only shows on paper.
 */
export function PrintHeader({ title, details }: { title: string; details?: (string | null | false | undefined)[] }) {
  const { t, i18n } = useTranslation()
  const lines = (details ?? []).filter(Boolean) as string[]
  // The time printed is when the print dialog opens, not when the page loaded.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const update = () => setNow(new Date())
    window.addEventListener('beforeprint', update)
    return () => window.removeEventListener('beforeprint', update)
  }, [])
  const printed = formatEth(now, 'datetime', i18n.language === 'am' ? 'am' : 'en')
  return (
    <header className="mb-4 hidden border-b-2 border-black pb-3 text-black print:block">
      <div className="flex items-center gap-3">
        <img src={logoUrl} alt="" className="size-14 rounded-full" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold" lang="am">
            {AMHARIC_NAME}
          </p>
          <h1 className="text-xl leading-tight font-bold">{title}</h1>
        </div>
        <p className="shrink-0 self-start text-right text-[9pt] text-neutral-600">
          {t('print.printedOn')}
          <br />
          {printed}
        </p>
      </div>
      {lines.length > 0 && <p className="mt-2 text-[10pt] text-neutral-700">{lines.join(' · ')}</p>}
    </header>
  )
}
