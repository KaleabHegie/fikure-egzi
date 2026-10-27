import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { ErrorState } from '@/components/common/states'
import { PageHeader } from '@/components/layout/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { applyPhotoChange, memberKeys, useMember, useMemberPhoto, useUpdateMember } from '../api'
import { MemberForm } from '../components/member-form'
import { memberToForm, toMemberPayload } from '../schema'
import { memberFullName } from '../utils'

export function MemberEditPage() {
  const { t } = useTranslation()
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: member, isPending, isError, error, refetch } = useMember(id)
  const photoUrl = useMemberPhoto(member)
  const updateMember = useUpdateMember(id)

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />
  if (isPending) return <Skeleton className="h-[36rem] w-full rounded-xl" />

  return (
    <>
      <PageHeader
        back={{ to: `/members/${id}`, label: memberFullName(member) }}
        title={t('members.edit.title')}
        description={t('members.edit.description', { code: member.memberCode })}
      />
      <MemberForm
        // Remount when the record changes so the form never shows stale values.
        key={member.updatedAt}
        defaultValues={memberToForm(member)}
        currentPhotoUrl={photoUrl}
        currentClasses={member.classes}
        submitLabel={t('members.edit.submit')}
        onCancel={() => navigate(`/members/${id}`)}
        onSubmit={async (values, photo) => {
          await updateMember.mutateAsync(toMemberPayload(values))
          const withPhoto = await applyPhotoChange(id, photo)
          if (withPhoto) queryClient.setQueryData(memberKeys.detail(id), withPhoto)
          void queryClient.invalidateQueries({ queryKey: memberKeys.lists() })
          toast.success(t('members.edit.done'))
          navigate(`/members/${id}`, { replace: true })
        }}
      />
    </>
  )
}
