import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  EyeOff,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  Trash2,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { EmptyState, ErrorState } from '@/components/common/states'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/use-auth'
import { getErrorMessage } from '@/lib/api/errors'
import { PERMISSIONS } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { classesApi, useClassMutation, useClassTypes } from '../api'
import { ClassGradeDialog, ClassTypeDialog } from '../components/class-dialogs'
import type { ClassGrade, ClassType } from '../types'
import { useLocalizedName } from '../use-localized'

type DialogState =
  | { kind: 'type'; type?: ClassType }
  | { kind: 'grade'; type: ClassType; grade?: ClassGrade }
  | { kind: 'deleteType'; type: ClassType }
  | { kind: 'deleteGrade'; grade: ClassGrade }
  | null

/** Moves the item at `index` by `delta` and returns the new id order. */
const moved = <T extends { id: number }>(items: T[], index: number, delta: number) => {
  const ids = items.map((i) => i.id)
  const [id] = ids.splice(index, 1)
  ids.splice(index + delta, 0, id!)
  return ids
}

function GradeBadge({ grade }: { grade: ClassGrade }) {
  return (
    <span className="grid h-7 min-w-7 place-items-center rounded-md bg-accent px-1.5 text-sm font-semibold text-accent-foreground">
      {grade.shortLabel ?? '—'}
    </span>
  )
}

function StatusPill({ active }: { active: boolean }) {
  const { t } = useTranslation()
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-full px-2 text-xs font-medium',
        active ? 'bg-success/12 text-success' : 'bg-muted text-muted-foreground',
      )}
    >
      {active ? t('classes.active') : t('classes.inactive')}
    </span>
  )
}

function ClassTypeCard({
  type,
  index,
  count,
  canManage,
  onDialog,
  onMoveType,
  onReorderGrades,
  onToggleGrade,
  onToggleType,
}: {
  type: ClassType
  index: number
  count: number
  canManage: boolean
  onDialog: (d: DialogState) => void
  onMoveType: (delta: -1 | 1) => void
  onReorderGrades: (typeId: number, ids: number[]) => void
  onToggleGrade: (grade: ClassGrade) => void
  onToggleType: (type: ClassType) => void
}) {
  const { t, i18n } = useTranslation()
  const name = useLocalizedName()
  const amharic = i18n.language === 'am'
  const otherName = amharic ? type.nameEn : type.nameAm
  const description = amharic ? type.descriptionAm : type.descriptionEn

  return (
    <section className={cn('rounded-xl border bg-card', !type.isActive && 'opacity-70')}>
      <header className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{name(type)}</h2>
            <span className="text-sm text-muted-foreground">· {otherName}</span>
            {!type.isActive && <StatusPill active={false} />}
          </div>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
          <p className="text-xs text-muted-foreground">
            <span className="font-mono">{type.code}</span> · {t('classes.grades', { count: type.grades.length })} ·{' '}
            {t('classes.members', { count: type.memberCount })} ·{' '}
            {t('classes.runBy', { name: name(type.department) })}
          </p>
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => onDialog({ kind: 'grade', type })}>
              <Plus />
              {t('classes.addGrade')}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={t('classes.editType')}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onDialog({ kind: 'type', type })}>
                  <Pencil />
                  {t('common.edit')}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={index === 0} onSelect={() => onMoveType(-1)}>
                  <ArrowUp />
                  {t('classes.moveUp')}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={index === count - 1} onSelect={() => onMoveType(1)}>
                  <ArrowDown />
                  {t('classes.moveDown')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onToggleType(type)}>
                  <Power />
                  {type.isActive ? t('classes.deactivate') : t('classes.activate')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => onDialog({ kind: 'deleteType', type })}>
                  <Trash2 />
                  {t('common.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </header>

      {type.grades.length === 0 ? (
        <p className="p-5 text-sm text-muted-foreground">{t('classes.noGrades')}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-16 pl-5">{t('classes.table.label')}</TableHead>
              <TableHead>{t('classes.table.name')}</TableHead>
              <TableHead className="hidden sm:table-cell">{t('classes.table.code')}</TableHead>
              <TableHead className="text-right">{t('classes.table.members')}</TableHead>
              <TableHead>{t('classes.table.status')}</TableHead>
              {canManage && <TableHead className="w-28 pr-5" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {type.grades.map((grade, gi) => (
              <TableRow key={grade.id} className={cn(!grade.isActive && 'text-muted-foreground')}>
                <TableCell className="pl-5">
                  <GradeBadge grade={grade} />
                </TableCell>
                <TableCell>
                  <span className="font-medium">{name(grade)}</span>
                  <span className="block text-xs text-muted-foreground">{amharic ? grade.nameEn : grade.nameAm}</span>
                </TableCell>
                <TableCell className="hidden font-mono text-xs sm:table-cell">{grade.code}</TableCell>
                <TableCell className="tabular text-right">
                  {grade.memberCount > 0 ? (
                    <Link
                      to={`/members?classGradeId=${grade.id}`}
                      className="inline-flex items-center gap-1 hover:underline"
                      aria-label={t('classes.viewMembers', { name: name(grade) })}
                    >
                      <Users className="size-3.5" />
                      {grade.memberCount.toLocaleString()}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </TableCell>
                <TableCell>
                  <StatusPill active={grade.isActive} />
                </TableCell>
                {canManage && (
                  <TableCell className="pr-5">
                    <div className="flex justify-end gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t('classes.moveUp')}
                        disabled={gi === 0}
                        onClick={() => onReorderGrades(type.id, moved(type.grades, gi, -1))}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t('classes.moveDown')}
                        disabled={gi === type.grades.length - 1}
                        onClick={() => onReorderGrades(type.id, moved(type.grades, gi, 1))}
                      >
                        <ArrowDown />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={t('classes.editGrade')}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => onDialog({ kind: 'grade', type, grade })}>
                            <Pencil />
                            {t('common.edit')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => onToggleGrade(grade)}>
                            <Power />
                            {grade.isActive ? t('classes.deactivate') : t('classes.activate')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => onDialog({ kind: 'deleteGrade', grade })}
                          >
                            <Trash2 />
                            {t('common.delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  )
}

export function ClassesPage() {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const { can } = useAuth()
  const canManage = can(PERMISSIONS.CLASSES_MANAGE)
  const [showInactive, setShowInactive] = useState(false)
  const [dialog, setDialog] = useState<DialogState>(null)
  const { data: types, isPending, isError, error, refetch } = useClassTypes(showInactive)

  const notifyError = (e: unknown) => toast.error(getErrorMessage(e))
  const createType = useClassMutation(classesApi.createType)
  const updateType = useClassMutation((a: { id: number; input: Parameters<typeof classesApi.updateType>[1] }) =>
    classesApi.updateType(a.id, a.input),
  )
  const removeType = useClassMutation(classesApi.removeType)
  const reorderTypes = useClassMutation(classesApi.reorderTypes)
  const createGrade = useClassMutation((a: { typeId: number; input: Parameters<typeof classesApi.createGrade>[1] }) =>
    classesApi.createGrade(a.typeId, a.input),
  )
  const updateGrade = useClassMutation((a: { id: number; input: Parameters<typeof classesApi.updateGrade>[1] }) =>
    classesApi.updateGrade(a.id, a.input),
  )
  const removeGrade = useClassMutation(classesApi.removeGrade)
  const reorderGrades = useClassMutation((a: { typeId: number; ids: number[] }) =>
    classesApi.reorderGrades(a.typeId, a.ids),
  )

  // Reordering needs every type, including inactive ones the list may hide.
  const moveType = async (index: number, delta: number) => {
    try {
      const all = await classesApi.list(true)
      const visible = types ?? []
      const target = visible[index + delta]
      const current = visible[index]
      if (!target || !current) return
      const ids = all.map((x) => x.id)
      const from = ids.indexOf(current.id)
      const to = ids.indexOf(target.id)
      ids.splice(from, 1)
      ids.splice(to, 0, current.id)
      await reorderTypes.mutateAsync(ids)
    } catch (e) {
      notifyError(e)
    }
  }

  const header = (
    <PageHeader
      title={t('classes.title')}
      description={t('classes.description')}
      actions={
        <>
          <div className="flex items-center gap-2">
            <Switch id="show-inactive" checked={showInactive} onCheckedChange={setShowInactive} />
            <Label htmlFor="show-inactive" className="text-sm font-normal">
              <EyeOff className="size-4 text-muted-foreground" />
              {t('classes.showInactive')}
            </Label>
          </div>
          {canManage && (
            <Button size="lg" onClick={() => setDialog({ kind: 'type' })}>
              <Plus />
              {t('classes.newType')}
            </Button>
          )}
        </>
      }
    />
  )

  let body: React.ReactNode
  if (isError) body = <ErrorState error={error} onRetry={() => void refetch()} className="rounded-xl border bg-card" />
  else if (isPending) {
    body = (
      <div className="space-y-4">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    )
  } else if (types.length === 0) {
    body = (
      <EmptyState
        icon={BookOpen}
        title={t('classes.noTypes')}
        description={t('classes.noTypesBody')}
        className="rounded-xl border bg-card"
        action={
          canManage && (
            <Button onClick={() => setDialog({ kind: 'type' })}>
              <Plus />
              {t('classes.newType')}
            </Button>
          )
        }
      />
    )
  } else {
    body = (
      <div className="space-y-6">
        {types.map((type, index) => (
          <ClassTypeCard
            key={type.id}
            type={type}
            index={index}
            count={types.length}
            canManage={canManage}
            onDialog={setDialog}
            onMoveType={(delta) => void moveType(index, delta)}
            onReorderGrades={(typeId, ids) => reorderGrades.mutate({ typeId, ids }, { onError: notifyError })}
            onToggleGrade={(g) =>
              updateGrade.mutate({ id: g.id, input: { isActive: !g.isActive } }, { onError: notifyError })
            }
            onToggleType={(ty) =>
              updateType.mutate({ id: ty.id, input: { isActive: !ty.isActive } }, { onError: notifyError })
            }
          />
        ))}
      </div>
    )
  }

  return (
    <>
      {header}
      {body}

      <ClassTypeDialog
        open={dialog?.kind === 'type'}
        onOpenChange={(open) => !open && setDialog(null)}
        type={dialog?.kind === 'type' ? dialog.type : undefined}
        onSave={async (input) => {
          if (dialog?.kind === 'type' && dialog.type) {
            await updateType.mutateAsync({ id: dialog.type.id, input })
            toast.success(t('classes.saved'))
          } else {
            await createType.mutateAsync(input)
            toast.success(t('classes.created'))
          }
        }}
      />

      <ClassGradeDialog
        open={dialog?.kind === 'grade'}
        onOpenChange={(open) => !open && setDialog(null)}
        typeName={dialog?.kind === 'grade' ? name(dialog.type) : ''}
        grade={dialog?.kind === 'grade' ? dialog.grade : undefined}
        onSave={async (input) => {
          if (dialog?.kind !== 'grade') return
          if (dialog.grade) {
            await updateGrade.mutateAsync({ id: dialog.grade.id, input })
            toast.success(t('classes.saved'))
          } else {
            await createGrade.mutateAsync({ typeId: dialog.type.id, input })
            toast.success(t('classes.created'))
          }
        }}
      />

      <ConfirmDialog
        open={dialog?.kind === 'deleteType'}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t('classes.deleteType.title')}
        description={
          dialog?.kind === 'deleteType'
            ? dialog.type.grades.length > 0 || dialog.type.memberCount > 0
              ? t('classes.deleteType.blocked')
              : t('classes.deleteType.body', { name: name(dialog.type) })
            : ''
        }
        confirmLabel={t('classes.deleteType.confirm')}
        destructive
        pending={removeType.isPending}
        onConfirm={() => {
          if (dialog?.kind !== 'deleteType') return
          removeType.mutate(dialog.type.id, {
            onSuccess: () => {
              toast.success(t('classes.deleted'))
              setDialog(null)
            },
            onError: notifyError,
          })
        }}
      />

      <ConfirmDialog
        open={dialog?.kind === 'deleteGrade'}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t('classes.deleteGrade.title')}
        description={
          dialog?.kind === 'deleteGrade'
            ? dialog.grade.memberCount > 0
              ? t('classes.deleteGrade.blocked', { count: dialog.grade.memberCount })
              : t('classes.deleteGrade.body', { name: name(dialog.grade) })
            : ''
        }
        confirmLabel={t('classes.deleteGrade.confirm')}
        destructive
        pending={removeGrade.isPending}
        onConfirm={() => {
          if (dialog?.kind !== 'deleteGrade') return
          removeGrade.mutate(dialog.grade.id, {
            onSuccess: () => {
              toast.success(t('classes.deleted'))
              setDialog(null)
            },
            onError: notifyError,
          })
        }}
      />
    </>
  )
}
