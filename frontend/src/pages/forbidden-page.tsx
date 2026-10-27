import { ShieldX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { EmptyState } from '@/components/common/states'
import { Button } from '@/components/ui/button'

export function ForbiddenPage() {
  const { t } = useTranslation()
  return (
    <EmptyState
      icon={ShieldX}
      title={t('pages.forbiddenTitle')}
      description={t('pages.forbiddenBody')}
      action={
        <Button asChild variant="outline">
          <Link to="/">{t('common.backToDashboard')}</Link>
        </Button>
      }
    />
  )
}
