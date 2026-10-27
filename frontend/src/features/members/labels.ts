import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Option } from '@/components/form/form-fields'
import {
  EDUCATION_LEVELS,
  type EducationLevel,
  GENDERS,
  type Gender,
  MARITAL_STATUSES,
  type MaritalStatus,
  MEMBERSHIP_STATUSES,
  type MembershipStatus,
} from './types'

/** Translated labels and select options for member enums, in the current UI language. */
export function useMemberLabels() {
  const { t, i18n } = useTranslation()
  return useMemo(() => {
    const gender = (v: Gender) => t(`enums.gender.${v}`)
    const status = (v: MembershipStatus) => t(`enums.status.${v}`)
    const maritalStatus = (v: MaritalStatus) => t(`enums.maritalStatus.${v}`)
    const education = (v: EducationLevel) => t(`enums.education.${v}`)
    const options = <V extends string>(values: readonly V[], label: (v: V) => string): Option<V>[] =>
      values.map((value) => ({ value, label: label(value) }))
    return {
      gender,
      status,
      maritalStatus,
      education,
      genderOptions: options(GENDERS, gender),
      statusOptions: options(MEMBERSHIP_STATUSES, status),
      maritalStatusOptions: options(MARITAL_STATUSES, maritalStatus),
      educationOptions: options(EDUCATION_LEVELS, education),
    }
    // i18n.language: `t` keeps its identity across language changes in some versions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, i18n.language])
}
