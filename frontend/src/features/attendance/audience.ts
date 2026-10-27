import { useTranslation } from 'react-i18next'
import { useGradeLabel, useLocalizedName } from '@/features/classes/use-localized'
import type { AttendanceSession } from './types'

/** "Course Class · Grade 5 · Youth" — who a session expects, in the UI language. */
export function useAudienceLabel() {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const gradeLabel = useGradeLabel()
  return (s: Pick<AttendanceSession, 'classGrade' | 'department' | 'serviceGroup'>) => {
    const parts = [
      s.classGrade && `${name(s.classGrade.classType)} · ${gradeLabel(s.classGrade)}`,
      s.serviceGroup && `${name(s.serviceGroup)} · ${name(s.serviceGroup.term)}`,
      s.department && name(s.department),
    ].filter(Boolean)
    return parts.length > 0 ? parts.join(' · ') : t('attendance.everyone')
  }
}
