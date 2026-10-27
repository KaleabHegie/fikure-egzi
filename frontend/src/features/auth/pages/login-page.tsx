import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, LogIn } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { z } from 'zod'
import logoUrl from '@/assets/logo.png'
import { TextField } from '@/components/form/form-fields'
import { AMHARIC_NAME, BrandMark } from '@/components/layout/brand-mark'
import { LanguageSwitch, ThemeToggle } from '@/components/layout/preferences'
import { Button } from '@/components/ui/button'
import { msg } from '@/i18n'
import { getErrorMessage, toApiError } from '@/lib/api/errors'
import { useAuth } from '../use-auth'

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, msg('validation.emailRequired'))
    .pipe(z.email(msg('validation.email'))),
  password: z.string().min(1, msg('validation.passwordRequired')),
})
type LoginValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const { t } = useTranslation()
  const { login, status } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [formError, setFormError] = useState<string | null>(null)
  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/'

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  if (status === 'authenticated') return <Navigate to={redirectTo} replace />

  const onSubmit = form.handleSubmit(async ({ email, password }) => {
    setFormError(null)
    try {
      await login(email, password)
      navigate(redirectTo, { replace: true })
    } catch (error) {
      // At login, 401 means wrong credentials rather than an expired session.
      setFormError(toApiError(error).status === 401 ? t('auth.invalidCredentials') : getErrorMessage(error))
    }
  })

  return (
    <div className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-brand text-brand-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pattern-cross absolute inset-0 opacity-[0.07]" aria-hidden />
        <BrandMark className="relative" inverted />
        <div className="relative max-w-md space-y-5">
          <img
            src={logoUrl}
            alt={t('auth.sealAlt')}
            className="size-28 rounded-full bg-white p-1 shadow-lg ring-4 ring-gold/40"
          />
          <p lang="am" className="text-lg font-semibold text-gold">
            {AMHARIC_NAME}
          </p>
          <h1 className="text-4xl leading-tight font-bold text-balance">{t('auth.heroTitle')}</h1>
          <p className="text-pretty text-brand-foreground/75">{t('auth.heroBody')}</p>
        </div>
        <p className="relative text-sm text-brand-foreground/60">{t('common.appName')}</p>
      </aside>

      <main className="relative flex items-center justify-center p-6 sm:p-10">
        <div className="absolute top-4 right-4 flex items-center gap-2 sm:top-6 sm:right-6">
          <LanguageSwitch />
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm space-y-8">
          <BrandMark className="lg:hidden" />
          <div className="space-y-1.5">
            <h2 className="text-2xl font-semibold">{t('auth.signIn')}</h2>
            <p className="text-sm text-muted-foreground">{t('auth.signInHint')}</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            <TextField
              control={form.control}
              name="email"
              label={t('auth.email')}
              type="email"
              autoComplete="username"
              autoFocus
            />
            <TextField
              control={form.control}
              name="password"
              label={t('auth.password')}
              type="password"
              autoComplete="current-password"
            />

            {formError && (
              <p
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                {formError}
              </p>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : <LogIn />}
              {t('auth.signIn')}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground">
            {t('portal.areYouMember')}{' '}
            <Link to="/portal" className="font-medium text-primary hover:underline">
              {t('portal.seeYourDetails')}
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
