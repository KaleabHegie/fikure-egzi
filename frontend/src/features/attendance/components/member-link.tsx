import { Link } from 'react-router'
import { useAuth } from '@/features/auth/use-auth'
import { PERMISSIONS } from '@/lib/permissions'
import { cn } from '@/lib/utils'

/** Links to the member's page for users who can open it; attendance takers just see the name. */
export function MemberLink({
  memberId,
  className,
  children,
}: {
  memberId: number
  className?: string
  children: React.ReactNode
}) {
  const { can } = useAuth()
  if (!can(PERMISSIONS.MEMBERS_READ)) return <div className={className}>{children}</div>
  return (
    <Link to={`/members/${memberId}`} className={cn(className, 'hover:underline')}>
      {children}
    </Link>
  )
}
