import { FileSpreadsheet, QrCode, UserPlus, Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { PaginationBar } from '@/components/common/pagination-bar'
import { EmptyState, ErrorState } from '@/components/common/states'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Can } from '@/features/auth/guards'
import { getErrorMessage } from '@/lib/api/errors'
import { PERMISSIONS } from '@/lib/permissions'
import { useDeleteMember, useMembers } from '../api'
import { MemberFilters } from '../components/member-filters'
import { MemberImportDialog } from '../components/member-import-dialog'
import { MembersTable } from '../components/members-table'
import { AddToDepartmentDialog } from '@/features/departments/components/add-to-department-dialog'
import type { Member } from '../types'
import { useMemberListParams } from '../use-member-list-params'
import { memberFullName } from '../utils'

export function MembersListPage() {
  const { t } = useTranslation()
  const { search } = useLocation()
  const { params, update, reset, hasFilters } = useMemberListParams()
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useMembers(params)
  const [toDelete, setToDelete] = useState<Member | null>(null)
  const [toAssign, setToAssign] = useState<Member | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const deleteMember = useDeleteMember()

  const confirmDelete = () => {
    if (!toDelete) return
    deleteMember.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success(t('members.delete.done', { name: memberFullName(toDelete) }))
        setToDelete(null)
      },
      onError: (e) => toast.error(getErrorMessage(e)),
    })
  }

  const printCardsButton = (
    <Button asChild size="lg" variant="outline">
      {/* Same filters as the list: print exactly the members being viewed. */}
      <Link to={`/members/cards${search}`} target="_blank" rel="noopener">
        <QrCode />
        {t('members.qr.printCards')}
      </Link>
    </Button>
  )

  const registerButton = (
    <Can permission={PERMISSIONS.MEMBERS_CREATE}>
      <Button size="lg" variant="outline" onClick={() => setImportOpen(true)}>
        <FileSpreadsheet />
        {t('members.import.button')}
      </Button>
      <Button asChild size="lg">
        <Link to="/members/new">
          <UserPlus />
          {t('members.register')}
        </Link>
      </Button>
    </Can>
  )

  return (
    <>
      <PageHeader
        title={t('members.title')}
        description={data ? t('members.count', { count: data.meta.total.toLocaleString() }) : t('members.description')}
        actions={
          <>
            {printCardsButton}
            {registerButton}
          </>
        }
      />

      <div className="rounded-xl border bg-card">
        <div className="border-b p-3">
          <MemberFilters params={params} onChange={update} onReset={reset} hasFilters={hasFilters} />
        </div>

        {isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : !isPending && data.data.length === 0 ? (
          hasFilters ? (
            <EmptyState
              icon={Users}
              title={t('members.empty.filteredTitle')}
              description={t('members.empty.filteredBody')}
              action={
                <Button variant="outline" onClick={reset}>
                  {t('members.empty.clearFilters')}
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Users}
              title={t('members.empty.title')}
              description={t('members.empty.body')}
              action={registerButton}
            />
          )
        ) : (
          <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
            <MembersTable
              members={data?.data ?? []}
              loading={isPending}
              onDelete={setToDelete}
              onAddToDepartment={setToAssign}
            />
          </div>
        )}

        {data && data.meta.total > 0 && (
          <div className="border-t px-3">
            <PaginationBar
              meta={data.meta}
              onPageChange={(page) => update({ page })}
              onPageSizeChange={(pageSize) => update({ pageSize })}
            />
          </div>
        )}
      </div>

      <MemberImportDialog open={importOpen} onOpenChange={setImportOpen} />

      {toAssign && (
        <AddToDepartmentDialog
          open
          onOpenChange={(open) => !open && setToAssign(null)}
          member={toAssign}
          currentDepartmentIds={toAssign.departments.map((d) => d.department.id)}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={t('members.delete.title')}
        description={toDelete ? t('members.delete.body', { name: memberFullName(toDelete), code: toDelete.memberCode }) : ''}
        confirmLabel={t('members.delete.confirm')}
        destructive
        pending={deleteMember.isPending}
        onConfirm={confirmDelete}
      />
    </>
  )
}
