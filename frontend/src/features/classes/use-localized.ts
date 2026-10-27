import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

interface Named {
  nameEn: string
  nameAm: string
}

/** Picks the Amharic or English name of admin-entered data, following the UI language. */
export function useLocalizedName() {
  const { i18n } = useTranslation()
  const amharic = i18n.language === 'am'
  return useCallback((item: Named) => (amharic ? item.nameAm : item.nameEn), [amharic])
}

/** "ግዕዝ (ሐ)" — the badge letter is appended unless the name already contains it ("Grade 5"). */
export function useGradeLabel() {
  const name = useLocalizedName()
  return useCallback(
    (grade: Named & { shortLabel: string | null }) => {
      const n = name(grade)
      return grade.shortLabel && !n.includes(grade.shortLabel) ? `${n} (${grade.shortLabel})` : n
    },
    [name],
  )
}
