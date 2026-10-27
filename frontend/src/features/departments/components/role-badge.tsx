import { Crown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { DepartmentRole } from '../types'

const ROLE_STYLES: Record<DepartmentRole, string> = {
  HEAD: 'bg-primary text-primary-foreground',
  DEPUTY: 'bg-accent text-accent-foreground',
  SECRETARY: 'bg-gold/20 text-foreground',
  MEMBER: 'bg-muted text-muted-foreground',
}

export function RoleBadge({ role }: { role: DepartmentRole }) {
  const { t } = useTranslation()
  return (
    <span className={cn('inline-flex h-5 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap', ROLE_STYLES[role])}>
      {role === 'HEAD' && <Crown className="size-3" />}
      {t(`departments.roles.${role}`)}
    </span>
  )
}
