import { KeyRound, Loader2, MoreHorizontal, Pencil, Plus, Search, UserCog, UserRoundCheck, UserRoundX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { EmptyState, ErrorState } from '@/components/common/states'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Field, FieldLabel } from '@/components/ui/field'
import { PasswordInput } from '@/components/form/password-input'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/use-auth'
import { useLocalizedName } from '@/features/classes/use-localized'
import { getErrorMessage } from '@/lib/api/errors'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { usersApi, useUserMutation, useUsers } from '../api'
import { UserDialog } from '../components/user-dialog'
import type { SystemUser, UserInput } from '../types'

const ROLE_STYLES: Record<string, string> = {
  SUPER_ADMIN: 'bg-primary/12 text-primary',
  DEPARTMENT_ADMIN: 'bg-accent text-accent-foreground',
  ATTENDANCE_TAKER: 'bg-muted text-foreground/80',
  TEACHER: 'bg-gold/20 text-foreground',
}

function useDebounced(value: string, ms = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

/** Admin sets a new password for someone who forgot theirs; they are signed out everywhere. */
function PasswordDialog({ user, onClose }: { user: SystemUser; onClose: () => void }) {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const save = useUserMutation((p: string) => usersApi.setPassword(user.id, p))
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) return setError(t('users.passwordTooShort'))
    save.mutate(password, {
      onSuccess: () => {
        toast.success(t('users.passwordSet', { name: user.fullName }))
        onClose()
      },
      onError: (err) => setError(getErrorMessage(err)),
    })
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('users.setPassword')}</DialogTitle>
          <DialogDescription>{t('users.setPasswordBody', { name: user.fullName })}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="new-password">{t('users.fields.password')}</FieldLabel>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(error) || undefined}
            />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />}
              {t('users.setPassword')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function UsersPage() {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const { user: me } = useAuth()
  const [search, setSearch] = useState('')
  const query = useDebounced(search.trim())
  const users = useUsers(query)
  const [editing, setEditing] = useState<SystemUser | 'new' | null>(null)
  const [passwordFor, setPasswordFor] = useState<SystemUser | null>(null)
  const scoped = me?.departmentIds != null

  const save = useUserMutation((a: { id?: number; input: UserInput }) =>
    a.id ? usersApi.update(a.id, a.input) : usersApi.create(a.input),
  )
  const setActive = useUserMutation((a: { id: number; isActive: boolean }) =>
    usersApi.update(a.id, { isActive: a.isActive }),
  )

  const list = users.data ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('users.title')}
        description={scoped ? t('users.descriptionScoped') : t('users.description')}
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus />
            {scoped ? t('users.newTaker') : t('users.new')}
          </Button>
        }
      />

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('users.search')}
          aria-label={t('users.search')}
          className="pl-8"
        />
      </div>

      {users.isError ? (
        <ErrorState error={users.error} onRetry={() => void users.refetch()} />
      ) : users.isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : list.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title={query ? t('users.noMatch') : t('users.empty')}
          description={query ? undefined : t('users.emptyBody')}
          className="rounded-xl border bg-card"
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">{t('users.fields.fullName')}</TableHead>
                <TableHead>{t('users.fields.role')}</TableHead>
                <TableHead>{t('users.fields.departments')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('users.lastLogin')}</TableHead>
                <TableHead>{t('users.status')}</TableHead>
                <TableHead className="w-10 pr-5" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((u) => (
                <TableRow key={u.id} className={cn(!u.isActive && 'text-muted-foreground')}>
                  <TableCell className="pl-5">
                    <span className="font-medium">{u.fullName}</span>
                    {u.id === me?.id && <span className="ml-1.5 text-xs text-muted-foreground">({t('users.you')})</span>}
                    <span className="block text-xs text-muted-foreground">
                      {u.email}
                      {u.member && <span className="font-mono"> · {u.member.memberCode}</span>}
                    </span>
                  </TableCell>
                  <TableCell>
                    {u.role && (
                      <span
                        className={cn(
                          'inline-flex h-5 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap',
                          ROLE_STYLES[u.role.code],
                        )}
                      >
                        {t(`userMenu.roles.${u.role.code}`)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-64 text-sm">
                    {u.departments.length === 0 ? (
                      <span className="text-muted-foreground">{t('users.allDepartments')}</span>
                    ) : (
                      u.departments.map((d) => name(d)).join('، ')
                    )}
                  </TableCell>
                  <TableCell className="hidden text-sm md:table-cell">
                    {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : <span className="text-muted-foreground">{t('users.never')}</span>}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'inline-flex h-5 items-center rounded-full px-2 text-xs font-medium',
                        u.isActive ? 'bg-success/12 text-success' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {u.isActive ? t('users.active') : t('users.inactive')}
                    </span>
                  </TableCell>
                  <TableCell className="pr-5">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={t('users.actions', { name: u.fullName })}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(u)}>
                          <Pencil />
                          {t('common.edit')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setPasswordFor(u)}>
                          <KeyRound />
                          {t('users.setPassword')}
                        </DropdownMenuItem>
                        {u.id !== me?.id && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant={u.isActive ? 'destructive' : 'default'}
                              onSelect={() =>
                                setActive.mutate(
                                  { id: u.id, isActive: !u.isActive },
                                  {
                                    onSuccess: () =>
                                      toast.success(u.isActive ? t('users.deactivated') : t('users.activated')),
                                    onError: (e) => toast.error(getErrorMessage(e)),
                                  },
                                )
                              }
                            >
                              {u.isActive ? <UserRoundX /> : <UserRoundCheck />}
                              {u.isActive ? t('users.deactivate') : t('users.activate')}
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
        </div>
      )}

      {editing && (
        <UserDialog
          open
          onOpenChange={(o) => !o && setEditing(null)}
          user={editing === 'new' ? undefined : editing}
          onSave={async (input) => {
            await save.mutateAsync({ id: editing === 'new' ? undefined : editing.id, input })
            toast.success(editing === 'new' ? t('users.created') : t('users.saved'))
          }}
        />
      )}
      {passwordFor && <PasswordDialog user={passwordFor} onClose={() => setPasswordFor(null)} />}
    </div>
  )
}
