import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/page-header'
import { getErrorMessage } from '@/lib/api/errors'
import { applyPhotoChange, useCreateMember } from '../api'
import { MemberForm } from '../components/member-form'
import { emptyMemberForm, toMemberPayload } from '../schema'
import { memberFullName } from '../utils'

export function MemberCreatePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const createMember = useCreateMember()

  return (
    <>
      <PageHeader
        back={{ to: '/members', label: t('nav.members') }}
        title={t('members.create.title')}
        description={t('members.create.description')}
      />
      <MemberForm
        defaultValues={emptyMemberForm()}
        submitLabel={t('members.create.submit')}
        onCancel={() => navigate('/members')}
        onSubmit={async (values, photo) => {
          const member = await createMember.mutateAsync(toMemberPayload(values))
          // The record exists now; a failed photo upload must not lose it.
          try {
            await applyPhotoChange(member.id, photo)
          } catch (error) {
            toast.warning(t('members.create.photoFailed', { error: getErrorMessage(error) }))
          }
          toast.success(t('members.create.done', { name: memberFullName(member), code: member.memberCode }))
          navigate(`/members/${member.id}`, { replace: true })
        }}
      />
    </>
  )
}
