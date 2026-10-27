import { IdCard, Loader2, LogIn, Phone } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useNavigate } from 'react-router'
import logoUrl from '@/assets/logo.png'
import { AMHARIC_NAME, BrandMark } from '@/components/layout/brand-mark'
import { LanguageSwitch, ThemeToggle } from '@/components/layout/preferences'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { getErrorMessage, toApiError } from '@/lib/api/errors'
import { portalApi, portalSession } from '../api'
import { QrCamera } from '../components/qr-camera'

/** Members sign in to see their own record: member ID (typed or scanned) + the phone number on file. */
export function PortalLoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (portalSession.get()) return <Navigate to="/portal/me" replace />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim() || !phone.trim()) {
      setError(t('portal.fillBoth'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { token } = await portalApi.login(code.trim(), phone.trim())
      portalSession.set(token)
      navigate('/portal/me', { replace: true })
    } catch (err) {
      const status = toApiError(err).status
      setError(status === 401 ? t('portal.noMatch') : status === 429 ? t('portal.tooMany') : getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-brand text-brand-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pattern-cross absolute inset-0 opacity-[0.07]" aria-hidden />
        <BrandMark className="relative" inverted />
        <div className="relative max-w-md space-y-5">
          <img src={logoUrl} alt={t('auth.sealAlt')} className="size-28 rounded-full bg-white p-1 shadow-lg ring-4 ring-gold/40" />
          <p lang="am" className="text-lg font-semibold text-gold">
            {AMHARIC_NAME}
          </p>
          <h1 className="text-4xl leading-tight font-bold text-balance">{t('portal.heroTitle')}</h1>
          <p className="text-pretty text-brand-foreground/75">{t('portal.heroBody')}</p>
        </div>
        <p className="relative text-sm text-brand-foreground/60">{t('common.appName')}</p>
      </aside>

      <main className="relative flex items-center justify-center p-6 sm:p-10">
        <div className="absolute top-4 right-4 flex items-center gap-2 sm:top-6 sm:right-6">
          <LanguageSwitch />
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm space-y-6">
          <BrandMark className="lg:hidden" />

          <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
            <Field>
              <FieldLabel htmlFor="portal-code">{t('portal.memberId')}</FieldLabel>
              <div className="relative">
                <IdCard className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="portal-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="FE-00042"
                  autoComplete="off"
                  autoCapitalize="characters"
                  className="pl-9 font-mono"
                />
              </div>
            </Field>
            <QrCamera
              onCode={(scanned) => {
                setCode(scanned)
                setError(null)
              }}
            />
            <Field>
              <FieldLabel htmlFor="portal-phone">{t('portal.phone')}</FieldLabel>
              <div className="relative">
                <Phone className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="portal-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="09…"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  className="pl-9"
                />
              </div>
              <p className="text-xs text-muted-foreground">{t('portal.phoneHint')}</p>
            </Field>
            {error && (
              <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" size="lg" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <LogIn />}
              {t('portal.signIn')}
            </Button>
          </form>
          <p className="text-center text-xs text-muted-foreground">
            <Link to="/login" className="hover:underline">
              {t('portal.staffSignIn')}
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
