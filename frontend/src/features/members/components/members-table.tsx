import { Building2, Eye, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/use-auth'
import { formatDate } from '@/lib/format'
import { PERMISSIONS } from '@/lib/permissions'
import { formatPhone } from '@/lib/phone'
import { useLocalizedName } from '@/features/classes/use-localized'
import { useMemberLabels } from '../labels'
import type { Member } from '../types'
import { memberFullName } from '../utils'
import { StatusBadge } from './member-badges'
import { MemberAvatar } from './member-avatar'

const COLUMNS = ['code', 'name', 'gender', 'classes', 'phone', 'status', 'joined'] as const

export function MembersTable({
  members,
  loading,
  onDelete,
  onAddToDepartment,
}: {
  members: Member[]
  loading: boolean
  onDelete: (member: Member) => void
  onAddToDepartment: (member: Member) => void
}) {
  const { t } = useTranslation()
  const labels = useMemberLabels()
  const localName = useLocalizedName()
  const navigate = useNavigate()
  const { can } = useAuth()

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {COLUMNS.map((c) => (
            <TableHead key={c}>{t(`members.table.${c}`)}</TableHead>
          ))}
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading
          ? Array.from({ length: 8 }, (_, i) => (
              <TableRow key={i}>
                {[...COLUMNS, 'actions'].map((c) => (
                  <TableCell key={c}>
                    <Skeleton className="h-4 w-full max-w-28" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          : members.map((m) => (
              <TableRow key={m.id} className="cursor-pointer" onClick={() => navigate(`/members/${m.id}`)}>
                <TableCell className="tabular font-mono text-xs text-muted-foreground">{m.memberCode}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <MemberAvatar member={m} />
                    <div className="min-w-0">
                      <Link
                        to={`/members/${m.id}`}
                        className="font-medium hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {memberFullName(m)}
                      </Link>
                      {m.christianName && (
                        <span className="block text-xs text-muted-foreground">{m.christianName}</span>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>{labels.gender(m.gender)}</TableCell>
                <TableCell>
                  {m.classes.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {m.classes.map((c) => (
                        <span
                          key={c.classType.id}
                          title={`${localName(c.classType)}: ${localName(c.classGrade)}`}
                          className="inline-flex h-5 items-center rounded-md bg-accent px-1.5 text-xs font-medium whitespace-nowrap text-accent-foreground"
                        >
                          {localName(c.classGrade)}
                        </span>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell className="tabular whitespace-nowrap">{formatPhone(m.phone) || '—'}</TableCell>
                <TableCell>
                  <StatusBadge status={m.status} />
                </TableCell>
                <TableCell className="tabular whitespace-nowrap text-muted-foreground">{formatDate(m.joinedAt)}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t('members.table.actions', { name: memberFullName(m) })}
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link to={`/members/${m.id}`}>
                          <Eye />
                          {t('common.view')}
                        </Link>
                      </DropdownMenuItem>
                      {can(PERMISSIONS.MEMBERS_UPDATE) && (
                        <DropdownMenuItem asChild>
                          <Link to={`/members/${m.id}/edit`}>
                            <Pencil />
                            {t('common.edit')}
                          </Link>
                        </DropdownMenuItem>
                      )}
                      {can(PERMISSIONS.DEPARTMENTS_ROSTER) && (
                        <DropdownMenuItem onSelect={() => onAddToDepartment(m)}>
                          <Building2 />
                          {t('departments.roster.addToDepartment')}
                        </DropdownMenuItem>
                      )}
                      {can(PERMISSIONS.MEMBERS_DELETE) && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => onDelete(m)}>
                            <Trash2 />
                            {t('common.delete')}
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
      </TableBody>
    </Table>
  )
}
