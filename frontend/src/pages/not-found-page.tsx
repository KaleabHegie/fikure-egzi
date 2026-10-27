import { MapPinOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { EmptyState } from '@/components/common/states'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <EmptyState
      icon={MapPinOff}
      title={t('pages.notFoundTitle')}
      description={t('pages.notFoundBody')}
      action={
        <Button asChild variant="outline">
          <Link to="/">{t('common.backToDashboard')}</Link>
        </Button>
      }
    />
  )
}
