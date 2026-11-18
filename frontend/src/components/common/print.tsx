import { Printer } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import logoUrl from '@/assets/logo.png'
import { AMHARIC_NAME } from '@/components/layout/brand-mark'
import { Button } from '@/components/ui/button'
import { formatEth } from '@/lib/ethiopian-calendar'
import { printPage } from '@/lib/print'
import { cn } from '@/lib/utils'

/**
 * Prints the page, or saves it as a PDF (a choice in every print screen): the
 * browser's print dialog, or Android's print screen inside the app.
 * `name` becomes the PDF's file name.
 */
export function PrintButton({
  className,
  disabled,
  size = 'default',
  variant = 'outline',
  name,
}: {
  className?: string
  disabled?: boolean
  size?: 'default' | 'sm' | 'lg'
  variant?: 'outline' | 'default'
  name?: string
}) {
  const { t } = useTranslation()
  return (
    <Button
      variant={variant}
      size={size}
      onClick={() => void printPage(name)}
      disabled={disabled}
      className={cn('print:hidden', className)}
    >
      <Printer />
      {t('print.print')}
    </Button>
  )
}

/**
 * The top of a printed report: the seal and school name, what the report is, the
 * filters it was printed with, and when. Only shows on paper.
 */
export function PrintHeader({
  title,
  details,
  screen,
}: {
  title: string
  details?: (string | null | false | undefined)[]
  /** Also show it on screen (print preview pages). */
  screen?: boolean
}) {
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
    <header className={cn('mb-4 border-b-2 border-black pb-3 text-black', screen ? 'block' : 'hidden print:block')}>
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
