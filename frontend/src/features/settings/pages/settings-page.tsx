import { ArrowRight, Check, Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { ErrorState } from '@/components/common/states'
import { PageHeader } from '@/components/layout/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { getErrorMessage } from '@/lib/api/errors'
import { cn } from '@/lib/utils'
import { useSettings, useUpdateSettings } from '../api'

/** Office-wide switches. Today: whether newcomers may register themselves in the bot. */
export function SettingsPage() {
  const { t } = useTranslation()
  const { data, isPending, isError, error, refetch } = useSettings()
  const update = useUpdateSettings()

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />

  const open = data?.selfRegistration ?? false
  const toggle = (next: boolean) =>
    update.mutate(
      { selfRegistration: next },
      {
        onSuccess: () => toast.success(next ? t('settings.selfRegistration.opened') : t('settings.selfRegistration.closed')),
        onError: (e) => toast.error(getErrorMessage(e)),
      },
    )
  const collected = [
    t('settings.selfRegistration.collects.personal'),
    t('settings.selfRegistration.collects.classes'),
    t('settings.selfRegistration.collects.contact'),
    t('settings.selfRegistration.collects.address'),
    t('settings.selfRegistration.collects.work'),
    t('settings.selfRegistration.collects.emergency'),
    t('settings.selfRegistration.collects.health'),
    t('settings.selfRegistration.collects.photo'),
    t('settings.selfRegistration.collects.agreement'),
  ]

  return (
    <div className="max-w-3xl">
      <PageHeader title={t('settings.title')} description={t('settings.description')} />

      <section className="rise-in rounded-xl border bg-card" aria-labelledby="self-registration-title">
        <header className="flex items-center gap-3 border-b border-dashed px-5 py-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand ring-1 ring-brand/20">
            <Send className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t('settings.telegram')}</p>
            <h2 id="self-registration-title" className="font-semibold">
              {t('settings.selfRegistration.title')}
            </h2>
          </div>
        </header>

        <div className="grid gap-5 p-5">
          <div className="flex items-start justify-between gap-6">
            <div className="space-y-1.5">
              <label htmlFor="self-registration" className="text-sm font-medium">
                {t('settings.selfRegistration.label')}
              </label>
              <p className="text-sm text-muted-foreground">{t('settings.selfRegistration.description')}</p>
            </div>
            {isPending ? (
              <Skeleton className="h-5 w-9 rounded-full" />
            ) : (
              <Switch id="self-registration" checked={open} disabled={update.isPending} onCheckedChange={toggle} />
            )}
          </div>

          {!isPending && (
            <p
              role="status"
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium',
                open ? 'bg-brand/10 text-brand' : 'bg-muted text-muted-foreground',
              )}
            >
              <span className={cn('size-2 rounded-full', open ? 'bg-brand motion-safe:animate-pulse' : 'bg-muted-foreground/50')} />
              {open ? t('settings.selfRegistration.statusOpen') : t('settings.selfRegistration.statusClosed')}
            </p>
          )}

          <div>
            <p className="mb-2 text-sm font-medium">{t('settings.selfRegistration.collectsTitle')}</p>
            <ul className="grid gap-1.5 text-sm text-muted-foreground">
              {collected.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-brand" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <Link
            to="/members?selfRegistered=true"
            className="inline-flex items-center gap-1 justify-self-start text-sm font-medium text-brand hover:underline"
          >
            {t('settings.selfRegistration.viewMembers')}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  )
}
