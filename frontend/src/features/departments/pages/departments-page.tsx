import { Building2, ChevronRight, Crown, EyeOff, Landmark, Plus, Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { EmptyState, ErrorState } from '@/components/common/states'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/features/auth/use-auth'
import { useLocalizedName } from '@/features/classes/use-localized'
import { MemberAvatar } from '@/features/members/components/member-avatar'
import { memberFullName } from '@/features/members/utils'
import { getErrorMessage } from '@/lib/api/errors'
import { PERMISSIONS } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { departmentsApi, useDepartmentMutation, useDepartments } from '../api'
import { DepartmentDialog } from '../components/department-dialog'
import { type DepartmentActions, DepartmentMenu } from '../components/department-menu'
import { buildDepartmentTree, type Department, type DepartmentInput, type DepartmentTreeNode } from '../types'

type DialogState =
  | { kind: 'edit'; department?: Department; parentId?: number | null }
  | { kind: 'delete'; department: DepartmentTreeNode }
  | null

function HeadLine({ department }: { department: Department }) {
  const { t } = useTranslation()
  if (!department.head) return <p className="text-xs text-muted-foreground">{t('departments.noHead')}</p>
  return (
    <div className="flex items-center gap-2 text-sm">
      <MemberAvatar member={department.head} />
      <span className="min-w-0">
        <span className="block truncate font-medium">{memberFullName(department.head)}</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Crown className="size-3" />
          {t('departments.head')}
        </span>
      </span>
    </div>
  )
}

/** A department administered by the office: a card linking to its roster page. */
function DepartmentCard({
  node,
  index,
  siblings,
  canManage,
  actions,
}: {
  node: DepartmentTreeNode
  index: number
  siblings: number
  canManage: boolean
  actions: DepartmentActions
}) {
  const { t, i18n } = useTranslation()
  const name = useLocalizedName()
  const other = i18n.language === 'am' ? node.nameEn : node.nameAm
  return (
    <div className={cn('group relative flex flex-col gap-4 rounded-xl border bg-card p-4 transition-shadow hover:shadow-sm', !node.isActive && 'opacity-60')}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-sm font-semibold text-accent-foreground">
            {index + 1}
          </span>
          <div className="min-w-0">
            <Link to={`/departments/${node.id}`} className="font-semibold after:absolute after:inset-0 hover:underline">
              {name(node)}
            </Link>
            <p className="truncate text-xs text-muted-foreground">{other}</p>
            {!node.isActive && <p className="text-xs font-medium text-muted-foreground">{t('departments.inactive')}</p>}
          </div>
        </div>
        {canManage && (
          <div className="relative z-10">
            <DepartmentMenu department={node} isFirst={index === 0} isLast={index === siblings - 1} actions={actions} />
          </div>
        )}
      </div>
      <HeadLine department={node} />
      <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Users className="size-3.5" />
          {t('departments.members', { count: node.memberCount })}
        </span>
        {node.children.length > 0 && <span>{t('departments.administers', { count: node.children.length })}</span>}
        <ChevronRight className="size-4" />
      </div>
    </div>
  )
}

/** A top-level department (ፅህፈት ቤት): a banner, with the departments it administers below. */
function RootSection({
  node,
  index,
  roots,
  canManage,
  actions,
}: {
  node: DepartmentTreeNode
  index: number
  roots: number
  canManage: boolean
  actions: DepartmentActions
}) {
  const { t, i18n } = useTranslation()
  const name = useLocalizedName()
  const amharic = i18n.language === 'am'
  const description = amharic ? node.descriptionAm : node.descriptionEn
  return (
    <section className="space-y-4">
      <div
        className={cn(
          'relative overflow-hidden rounded-xl bg-brand p-5 text-brand-foreground sm:p-6',
          !node.isActive && 'opacity-70',
        )}
      >
        <div className="pattern-cross absolute inset-0 opacity-[0.06]" aria-hidden />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="grid size-12 place-items-center rounded-xl bg-brand-foreground/10 text-gold ring-1 ring-brand-foreground/20">
              <Landmark className="size-6" />
            </span>
            <div>
              <Link to={`/departments/${node.id}`} className="text-xl font-bold hover:underline">
                {name(node)}
              </Link>
              <p className="text-sm text-brand-foreground/75">
                {amharic ? node.nameEn : node.nameAm}
                {description && ` · ${description}`}
              </p>
              <p className="mt-1 text-xs text-brand-foreground/70">
                {t('departments.administers', { count: node.children.length })} ·{' '}
                {t('departments.members', { count: node.memberCount })}
                {node.head && ` · ${t('departments.head')}: ${memberFullName(node.head)}`}
              </p>
            </div>
          </div>
          {canManage && (
            <div className="relative flex items-center gap-1 [&_button]:text-brand-foreground [&_button:hover]:bg-brand-foreground/10">
              <Button variant="ghost" size="sm" onClick={() => actions.onAddChild(node)}>
                <Plus />
                {t('departments.newDepartment')}
              </Button>
              <DepartmentMenu department={node} isFirst={index === 0} isLast={index === roots - 1} actions={actions} />
            </div>
          )}
        </div>
      </div>

      {node.children.length > 0 && (
        <div className="relative grid gap-3 border-l-2 border-dashed border-primary/30 pl-4 sm:grid-cols-2 sm:pl-6 xl:grid-cols-4">
          {node.children.map((child, i) => (
            <DepartmentCard
              key={child.id}
              node={child}
              index={i}
              siblings={node.children.length}
              canManage={canManage}
              actions={actions}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export function DepartmentsPage() {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const { can } = useAuth()
  const canManage = can(PERMISSIONS.DEPARTMENTS_MANAGE)
  const [showInactive, setShowInactive] = useState(false)
  const [dialog, setDialog] = useState<DialogState>(null)
  const { data, isPending, isError, error, refetch } = useDepartments(showInactive)
  const { data: all } = useDepartments(true)

  const notifyError = (e: unknown) => toast.error(getErrorMessage(e))
  const create = useDepartmentMutation(departmentsApi.create)
  const update = useDepartmentMutation((a: { id: number; input: Parameters<typeof departmentsApi.update>[1] }) =>
    departmentsApi.update(a.id, a.input),
  )
  const remove = useDepartmentMutation(departmentsApi.remove)
  const reorder = useDepartmentMutation((a: { parentId: number | null; ids: number[] }) =>
    departmentsApi.reorder(a.parentId, a.ids),
  )

  const actions: DepartmentActions = {
    onEdit: (d) => setDialog({ kind: 'edit', department: d }),
    onAddChild: (d) => setDialog({ kind: 'edit', parentId: d.id }),
    onToggle: (d) => update.mutate({ id: d.id, input: { isActive: !d.isActive } }, { onError: notifyError }),
    onDelete: (d) => setDialog({ kind: 'delete', department: d as DepartmentTreeNode }),
    // Reorder within the full sibling list (including hidden inactive ones).
    onMove: (d, delta) => {
      const siblings = (all ?? []).filter((s) => s.parentId === d.parentId).map((s) => s.id)
      const visible = (data ?? []).filter((s) => s.parentId === d.parentId)
      const target = visible[visible.findIndex((s) => s.id === d.id) + delta]
      if (!target) return
      const from = siblings.indexOf(d.id)
      siblings.splice(from, 1)
      siblings.splice(siblings.indexOf(target.id) + (delta > 0 ? 1 : 0), 0, d.id)
      reorder.mutate({ parentId: d.parentId, ids: siblings }, { onError: notifyError })
    },
  }

  const save = async (input: DepartmentInput) => {
    if (dialog?.kind !== 'edit') return
    if (dialog.department) {
      const { code: _code, ...changes } = input
      await update.mutateAsync({ id: dialog.department.id, input: changes })
      toast.success(t('departments.saved'))
    } else {
      await create.mutateAsync(input)
      toast.success(t('departments.created'))
    }
  }

  const tree = data ? buildDepartmentTree(data) : []
  const deleting = dialog?.kind === 'delete' ? dialog.department : null
  const deleteBlocked = deleting ? deleting.children.length > 0 || deleting.memberCount > 0 : false

  let body: React.ReactNode
  if (isError) body = <ErrorState error={error} onRetry={() => void refetch()} className="rounded-xl border bg-card" />
  else if (isPending) {
    body = (
      <div className="space-y-4">
        <Skeleton className="h-28 rounded-xl" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      </div>
    )
  } else if (tree.length === 0) {
    body = (
      <EmptyState
        icon={Building2}
        title={t('departments.noDepartments')}
        description={t('departments.noDepartmentsBody')}
        className="rounded-xl border bg-card"
      />
    )
  } else {
    body = (
      <div className="space-y-8">
        {tree.map((root, i) => (
          <RootSection key={root.id} node={root} index={i} roots={tree.length} canManage={canManage} actions={actions} />
        ))}
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title={t('departments.title')}
        description={t('departments.description')}
        actions={
          <>
            <div className="flex items-center gap-2">
              <Switch id="dept-inactive" checked={showInactive} onCheckedChange={setShowInactive} />
              <Label htmlFor="dept-inactive" className="text-sm font-normal">
                <EyeOff className="size-4 text-muted-foreground" />
                {t('departments.showInactive')}
              </Label>
            </div>
            {canManage && (
              <Button size="lg" onClick={() => setDialog({ kind: 'edit', parentId: null })}>
                <Plus />
                {t('departments.newDepartment')}
              </Button>
            )}
          </>
        }
      />
      {body}

      <DepartmentDialog
        open={dialog?.kind === 'edit'}
        onOpenChange={(open) => !open && setDialog(null)}
        department={dialog?.kind === 'edit' ? dialog.department : undefined}
        defaultParentId={dialog?.kind === 'edit' ? dialog.parentId : undefined}
        allDepartments={all ?? []}
        onSave={save}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t('departments.delete.title')}
        description={
          deleting
            ? deleteBlocked
              ? t('departments.delete.blocked')
              : t('departments.delete.body', { name: name(deleting) })
            : ''
        }
        confirmLabel={t('departments.delete.confirm')}
        destructive
        pending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success(t('departments.deleted'))
              setDialog(null)
            },
            onError: notifyError,
          })
        }}
      />
    </>
  )
}
