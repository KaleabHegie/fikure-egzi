import { useTranslation } from 'react-i18next'
import logoUrl from '@/assets/logo.png'
import { am } from '@/i18n/locales/am'
import { cn } from '@/lib/utils'

/** The Amharic name is part of the brand, shown in both languages. */
export const AMHARIC_NAME = am.common.appName

/** Official seal + wordmark. `inverted` for use on the green brand surface. */
export function BrandMark({
  className,
  inverted,
  compact,
}: {
  className?: string
  inverted?: boolean
  compact?: boolean
}) {
  const { t, i18n } = useTranslation()
  const amharic = i18n.language === 'am'
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <img
        src={logoUrl}
        alt=""
        width={40}
        height={40}
        className={cn('size-10 shrink-0 rounded-full bg-white', inverted && 'ring-2 ring-white/30')}
      />
      {!compact && (
        <span className="min-w-0 leading-tight">
          <span className="block font-record text-base leading-tight font-semibold">
            {amharic ? am.common.shortName : 'Fikure Egzi'}
          </span>
          <span
            className={cn('block truncate text-xs', inverted ? 'text-brand-foreground/70' : 'text-muted-foreground')}
            lang="am"
          >
            {amharic ? am.common.sundaySchool : AMHARIC_NAME}
          </span>
        </span>
      )}
      <span className="sr-only">{t('common.appName')}</span>
    </div>
  )
}
