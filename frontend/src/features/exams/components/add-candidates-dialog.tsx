import { Check, GraduationCap, Loader2, Search, UserPlus, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useClassTypes } from '@/features/classes/api'
import { useGradeLabel, useLocalizedName } from '@/features/classes/use-localized'
import { useDepartments } from '@/features/departments/api'
import { MemberAvatar } from '@/features/members/components/member-avatar'
import { memberFullName } from '@/features/members/utils'
import { getErrorMessage } from '@/lib/api/errors'
import { useCandidateSearch } from '../api'

type AddInput = { memberIds?: number[]; classGradeId?: number; departmentId?: number }

/** Search box that commits after typing pauses, so each keystroke isn't a request. */
function useDebounced(value: string, ms = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

/**
 * Who sits the exam: everyone in a class level (e.g. Mezmur · Ezel), everyone
 * on a department's roster, or members picked one by one. People already
 * sitting it are skipped.
 */
export function AddCandidatesDialog({
  open,
  onOpenChange,
  examId,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  examId: number
  onAdd: (input: AddInput) => Promise<number>
}) {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const gradeLabel = useGradeLabel()
  const { data: classTypes } = useClassTypes()
  const { data: departments } = useDepartments()
  const [gradeId, setGradeId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [search, setSearch] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const query = useDebounced(search.trim())
  const { data: found, isFetching } = useCandidateSearch(examId, query, open)

  const add = async (key: string, input: AddInput) => {
    setPending(key)
    try {
      const added = await onAdd(input)
      toast.success(added > 0 ? t('exams.candidates.added', { count: added }) : t('exams.candidates.noneNew'))
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setPending(null)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setSearch('')
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('exams.candidates.addTitle')}</DialogTitle>
          <DialogDescription>{t('exams.candidates.addBody')}</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="class">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="class">
              <GraduationCap />
              {t('exams.candidates.byClass')}
            </TabsTrigger>
            <TabsTrigger value="department">
              <Users />
              {t('exams.candidates.byDepartment')}
            </TabsTrigger>
            <TabsTrigger value="member">
              <UserPlus />
              {t('exams.candidates.byMember')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="class" className="grid gap-3 pt-3">
            <Field>
              <FieldLabel>{t('exams.candidates.classLevel')}</FieldLabel>
              <Select value={gradeId} onValueChange={setGradeId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('exams.candidates.chooseLevel')} />
                </SelectTrigger>
                <SelectContent>
                  {(classTypes ?? []).map((type) => (
                    <SelectGroup key={type.id}>
                      <SelectLabel>{name(type)}</SelectLabel>
                      {type.grades.map((g) => (
                        <SelectItem key={g.id} value={String(g.id)}>
                          {gradeLabel(g)} · {t('exams.candidates.people', { count: g.memberCount })}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Button
              disabled={!gradeId || pending !== null}
              onClick={() => void add('class', { classGradeId: Number(gradeId) })}
              className="justify-self-end"
            >
              {pending === 'class' && <Loader2 className="animate-spin" />}
              {t('exams.candidates.addAll')}
            </Button>
          </TabsContent>

          <TabsContent value="department" className="grid gap-3 pt-3">
            <Field>
              <FieldLabel>{t('exams.candidates.departmentRoster')}</FieldLabel>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('exams.candidates.chooseDepartment')} />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {(departments ?? []).map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {name(d)} · {t('exams.candidates.people', { count: d.memberCount })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Button
              disabled={!departmentId || pending !== null}
              onClick={() => void add('department', { departmentId: Number(departmentId) })}
              className="justify-self-end"
            >
              {pending === 'department' && <Loader2 className="animate-spin" />}
              {t('exams.candidates.addAll')}
            </Button>
          </TabsContent>

          <TabsContent value="member" className="grid gap-3 pt-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('exams.candidates.searchPlaceholder')}
                aria-label={t('exams.candidates.searchPlaceholder')}
                className="pl-8"
                autoFocus
              />
              {isFetching && <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
            </div>
            {query.length < 2 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">{t('exams.candidates.typeToSearch')}</p>
            ) : found && found.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">{t('exams.candidates.noMatch')}</p>
            ) : (
              <ul className="grid gap-1">
                {(found ?? []).map((m) => (
                  <li key={m.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-accent/60">
                    <MemberAvatar member={m} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{memberFullName(m)}</p>
                      <p className="font-mono text-xs text-muted-foreground">{m.memberCode}</p>
                    </div>
                    {m.isCandidate ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Check className="size-3.5 text-success" />
                        {t('exams.candidates.already')}
                      </span>
                    ) : (
                      <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => void add(`m${m.id}`, { memberIds: [m.id] })}>
                        {pending === `m${m.id}` ? <Loader2 className="animate-spin" /> : <UserPlus />}
                        {t('exams.candidates.add')}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
