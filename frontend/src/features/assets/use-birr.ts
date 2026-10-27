import { useTranslation } from 'react-i18next'

/** "12,500 ብር" / "12,500 Birr". */
export function useBirr() {
  const { t } = useTranslation()
  return (value: number) => t('assets.birr', { value: value.toLocaleString(undefined, { maximumFractionDigits: 2 }) })
}
