import { useAuth } from '@/features/auth/use-auth'
import { useClassTypes } from '@/features/classes/api'
import { useGradeLabel, useLocalizedName } from '@/features/classes/use-localized'

/**
 * Every active class grade as a select option ("Mezmur Class · Araray (ሀ)") —
 * for department-scoped users, only the classes their department runs.
 */
export function useGradeOptions() {
  const { inDepartment } = useAuth()
  const classTypes = useClassTypes().data?.filter((type) => inDepartment(type.departmentId))
  const name = useLocalizedName()
  const gradeLabel = useGradeLabel()
  const options = (classTypes ?? []).flatMap((type) =>
    type.grades
      .filter((g) => g.isActive)
      .map((g) => ({ value: String(g.id), label: `${name(type)} · ${gradeLabel(g)}` })),
  )
  // Service groups are mostly drawn from Mezmur · Araray, so it is the default suggestion.
  const araray = classTypes
    ?.find((type) => type.code === 'MEZMUR')
    ?.grades.find((g) => g.code === 'ARARAY' && g.isActive)
  return { options, defaultGradeId: araray ? String(araray.id) : (options[0]?.value ?? '') }
}
