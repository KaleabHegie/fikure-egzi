import { Check, Loader2, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EthDatePicker } from '@/components/common/eth-date-picker'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MemberAvatar } from '@/features/members/components/member-avatar'
import { memberFullName } from '@/features/members/utils'
import { getErrorMessage } from '@/lib/api/errors'
import { todayIso } from '@/lib/ethiopian-calendar'
import { cn } from '@/lib/utils'
import { useDepartmentCandidates } from '../api'
import { DEPARTMENT_ROLES, type DepartmentMembership, type DepartmentRole, type MemberSummary } from '../types'

/** Search box that commits after typing pauses, so each keystroke isn't a request. */
function useDebounced(value: string, ms = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

export function AddMemberDialog({
  open,
  onOpenChange,
  departmentId,
  departmentName,
  roster,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  departmentId: number
  departmentName: string
  roster: DepartmentMembership[]
  onAdd: (input: { member: MemberSummary; role: DepartmentRole; joinedAt: string }) => Promise<void>
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<MemberSummary | null>(null)
  const [role, setRole] = useState<DepartmentRole>('MEMBER')
  const [joinedAt, setJoinedAt] = useState(todayIso())
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const query = useDebounced(search.trim())
  // Searches every member, not just the ones this user already sees.
  const { data, isFetching } = useDepartmentCandidates(departmentId, query, open)

  const alreadyIn = new Set(roster.map((r) => r.member.id))
  const holderOf = (r: DepartmentRole) =>
    r === 'HEAD' || r === 'DEPUTY' ? roster.find((m) => m.role === r)?.member : undefined

  const reset = () => {
    setSearch('')
    setSelected(null)
    setRole('MEMBER')
    setJoinedAt(todayIso())
    setError(null)
  }

  const submit = async () => {
    if (!selected) return
    setPending(true)
    setError(null)
    try {
      await onAdd({ member: selected, role, joinedAt })
      reset()
      onOpenChange(false)
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('departments.roster.addTitle', { name: departmentName })}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="dept-member-search">{t('departments.roster.member')}</FieldLabel>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="dept-member-search"
                type="search"
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('departments.roster.searchPlaceholder')}
                autoFocus
              />
              {isFetching && (
                <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>
            <ul className="max-h-64 overflow-y-auto rounded-lg border" role="listbox" aria-label={t('departments.roster.member')}>
              {data?.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">{t('departments.roster.noResults')}</li>
              )}
              {data?.map((m) => {
                const disabled = alreadyIn.has(m.id)
                const isSelected = selected?.id === m.id
                return (
                  <li key={m.id} role="option" aria-selected={isSelected} aria-disabled={disabled}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => setSelected(m)}
                      className={cn(
                        'flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors',
                        isSelected ? 'bg-accent' : 'hover:bg-muted',
                        disabled && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      <MemberAvatar member={m} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{memberFullName(m)}</span>
                        <span className="block text-xs text-muted-foreground">
                          {m.memberCode}
                          {m.christianName && ` · ${m.christianName}`}
                        </span>
                      </span>
                      {(isSelected || disabled) && <Check className="size-4 text-primary" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="dept-role">{t('departments.roster.role')}</FieldLabel>
              <Select value={role} onValueChange={(v) => setRole(v as DepartmentRole)}>
                <SelectTrigger id="dept-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENT_ROLES.map((r) => {
                    const holder = holderOf(r)
                    return (
                      <SelectItem key={r} value={r} disabled={Boolean(holder)}>
                        {t(`departments.roles.${r}`)}
                        {holder && (
                          <span className="text-muted-foreground">
                            {' '}
                            — {t('departments.roster.roleTaken', { name: memberFullName(holder) })}
                          </span>
                        )}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="dept-joined">{t('departments.roster.joinedAt')}</FieldLabel>
              <EthDatePicker id="dept-joined" value={joinedAt} onChange={(v) => setJoinedAt(v || todayIso())} />
            </Field>
          </div>

          {error && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={!selected || pending}>
            {pending && <Loader2 className="animate-spin" />}
            {t('departments.roster.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
