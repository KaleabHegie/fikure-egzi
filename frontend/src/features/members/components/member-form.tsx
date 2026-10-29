import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Save } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { DateField, SelectField, TextareaField, TextField } from '@/components/form/form-fields'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { applyApiFieldErrors, getErrorMessage } from '@/lib/api/errors'
import { useClassTypes } from '@/features/classes/api'
import type { MemberClass } from '@/features/classes/types'
import { useGradeLabel, useLocalizedName } from '@/features/classes/use-localized'
import type { PhotoChange } from '../api'
import { useMemberLabels } from '../labels'
import { MEMBER_FORM_FIELDS, memberFormSchema, type MemberFormValues } from '../schema'
import { PhotoPicker } from './photo-picker'

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-x-10 gap-y-5 border-b py-8 first:pt-0 last:border-b-0 lg:grid-cols-[16rem_1fr]">
      <div className="space-y-1">
        <h2 className="font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">{children}</div>
    </section>
  )
}

/**
 * One grade picker per class type that is currently offered. Types and grades
 * are admin-managed (Classes page), so this renders whatever exists.
 */
function ClassesSection({
  control,
  currentClasses,
}: {
  control: ReturnType<typeof useForm<MemberFormValues>>['control']
  currentClasses: MemberClass[]
}) {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const gradeLabel = useGradeLabel()
  const { data: types } = useClassTypes()
  if (!types || types.length === 0) return null

  return (
    <Section title={t('members.sections.classes.title')} description={t('members.sections.classes.description')}>
      {types.map((type) => {
        const options = type.grades.map((g) => ({ value: String(g.id), label: gradeLabel(g) }))
        // Keep a deactivated grade the member is still in, so editing doesn't silently drop it.
        const kept = currentClasses.find((c) => c.classType.id === type.id && !c.classGrade.isActive)
        if (kept && !options.some((o) => o.value === String(kept.classGrade.id))) {
          options.push({
            value: String(kept.classGrade.id),
            label: t('classes.inactiveSuffix', { name: gradeLabel(kept.classGrade) }),
          })
        }
        return (
          <SelectField
            key={type.id}
            control={control}
            name={`classGrades.${type.id}`}
            label={name(type)}
            options={options}
            allowEmpty
            emptyLabel={t('members.fields.notAssigned')}
          />
        )
      })}
    </Section>
  )
}

export function MemberForm({
  defaultValues,
  currentPhotoUrl = null,
  currentClasses = [],
  submitLabel,
  onSubmit,
  onCancel,
}: {
  defaultValues: MemberFormValues
  /** Object URL of the saved photo (edit mode). */
  currentPhotoUrl?: string | null
  /** The member's saved placements (edit mode), so a since-deactivated grade still shows. */
  currentClasses?: MemberClass[]
  submitLabel: string
  /** Throw to surface an error; API field errors are mapped onto inputs. */
  onSubmit: (values: MemberFormValues, photo: PhotoChange) => Promise<void>
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const labels = useMemberLabels()
  const [photo, setPhoto] = useState<PhotoChange>({ kind: 'keep' })
  const form = useForm<MemberFormValues>({
    resolver: zodResolver(memberFormSchema),
    defaultValues,
    mode: 'onTouched',
  })
  const { control, formState } = form

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSubmit(values, photo)
    } catch (error) {
      if (!applyApiFieldErrors(error, form.setError, MEMBER_FORM_FIELDS)) {
        form.setError('root.server', { message: getErrorMessage(error) })
      }
    }
  })

  return (
    <form onSubmit={submit} noValidate className="rounded-xl border bg-card p-5 sm:p-8">
      <Section title={t('members.sections.personal.title')} description={t('members.sections.personal.description')}>
        <Field className="sm:col-span-2">
          <FieldLabel>{t('members.fields.photo')}</FieldLabel>
          <PhotoPicker
            currentUrl={currentPhotoUrl}
            change={photo}
            onChange={setPhoto}
            disabled={formState.isSubmitting}
          />
        </Field>
        <TextField control={control} name="firstName" label={t('members.fields.firstName')} required autoComplete="off" />
        <TextField control={control} name="fatherName" label={t('members.fields.fatherName')} required autoComplete="off" />
        <TextField control={control} name="grandfatherName" label={t('members.fields.grandfatherName')} autoComplete="off" />
        <TextField
          control={control}
          name="christianName"
          label={t('members.fields.christianName')}
          description={t('members.fields.christianNameHint')}
          autoComplete="off"
        />
        <TextField control={control} name="spiritualFatherName" label={t('members.fields.spiritualFather')} autoComplete="off" />
        <SelectField control={control} name="gender" label={t('members.fields.gender')} required options={labels.genderOptions} />
        <DateField
          control={control}
          name="dateOfBirth"
          label={t('members.fields.dateOfBirth')}
          required
        />
        <TextField control={control} name="placeOfBirth" label={t('members.fields.placeOfBirth')} />
        <DateField control={control} name="joinedAt" label={t('members.fields.joinedAt')} required />
        <SelectField
          control={control}
          name="maritalStatus"
          label={t('members.fields.maritalStatus')}
          options={labels.maritalStatusOptions}
          allowEmpty
        />
      </Section>

      <ClassesSection control={control} currentClasses={currentClasses} />

      <Section title={t('members.sections.contact.title')} description={t('members.sections.contact.description')}>
        <TextField
          control={control}
          name="phone"
          label={t('members.fields.phone')}
          type="tel"
          inputMode="tel"
          placeholder={t('members.fields.phonePlaceholder')}
        />
        <TextField control={control} name="alternatePhone" label={t('members.fields.alternatePhone')} type="tel" inputMode="tel" />
        <TextField control={control} name="email" label={t('members.fields.email')} type="email" className="sm:col-span-2" />
      </Section>

      <Section title={t('members.sections.address.title')} description={t('members.sections.address.description')}>
        <TextField control={control} name="city" label={t('members.fields.city')} />
        <TextField control={control} name="subCity" label={t('members.fields.subCity')} />
        <TextField control={control} name="woreda" label={t('members.fields.woreda')} />
        <TextField control={control} name="kebele" label={t('members.fields.kebele')} />
        <TextField control={control} name="houseNumber" label={t('members.fields.houseNumber')} />
      </Section>

      <Section title={t('members.sections.education.title')} description={t('members.sections.education.description')}>
        <SelectField
          control={control}
          name="educationLevel"
          label={t('members.fields.educationLevel')}
          options={labels.educationOptions}
          allowEmpty
        />
        <TextField control={control} name="occupation" label={t('members.fields.occupation')} />
      </Section>

      <Section title={t('members.sections.emergency.title')} description={t('members.sections.emergency.description')}>
        <TextField control={control} name="emergencyContactName" label={t('members.fields.emergencyName')} />
        <TextField
          control={control}
          name="emergencyContactRelation"
          label={t('members.fields.emergencyRelation')}
          placeholder={t('members.fields.emergencyRelationPlaceholder')}
        />
        <TextField
          control={control}
          name="emergencyContactPhone"
          label={t('members.fields.emergencyPhone')}
          type="tel"
          inputMode="tel"
        />
      </Section>

      <Section title={t('members.sections.notes.title')} description={t('members.sections.notes.description')}>
        <TextareaField control={control} name="notes" label={t('members.fields.notes')} rows={4} className="sm:col-span-2" />
      </Section>

      {formState.errors.root?.server && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {formState.errors.root.server.message}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" size="lg" onClick={onCancel} disabled={formState.isSubmitting}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" size="lg" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? <Loader2 className="animate-spin" /> : <Save />}
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
