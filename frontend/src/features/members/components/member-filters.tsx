import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useClassTypes } from '@/features/classes/api'
import { useDepartments } from '@/features/departments/api'
import { useGradeLabel, useLocalizedName } from '@/features/classes/use-localized'
import { useMemberLabels } from '../labels'
import type { MemberListParams } from '../types'

type FilterKey = 'status' | 'gender'
const ALL = '__all__'
const SEARCH_DEBOUNCE_MS = 300


export function MemberFilters({
  params,
  onChange,
  onReset,
  hasFilters,
}: {
  params: MemberListParams
  onChange: (changes: Partial<Record<keyof MemberListParams, string | undefined>>) => void
  onReset: () => void
  hasFilters: boolean
}) {
  const { t } = useTranslation()
  const labels = useMemberLabels()
  const localName = useLocalizedName()
  const gradeLabel = useGradeLabel()
  // Include inactive grades: old placements should stay findable.
  const { data: classTypes } = useClassTypes(true)
  const { data: departments } = useDepartments(true)
  const filters: { key: FilterKey; label: string; options: { value: string; label: string }[] }[] = [
    { key: 'status', label: t('members.filters.allStatuses'), options: labels.statusOptions },
    { key: 'gender', label: t('members.filters.allGenders'), options: labels.genderOptions },
  ]
  const urlSearch = params.search ?? ''
  const [search, setSearch] = useState(urlSearch)
  const [syncedFrom, setSyncedFrom] = useState(urlSearch)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // URL changed elsewhere (Clear, back button): adopt it. Adjusting state
  // during render is React's recommended alternative to a syncing effect.
  if (urlSearch !== syncedFrom) {
    setSyncedFrom(urlSearch)
    setSearch(urlSearch)
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  const onSearchChange = (value: string) => {
    setSearch(value)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => onChange({ search: value.trim() || undefined }), SEARCH_DEBOUNCE_MS)
  }

  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center">
      <div className="relative md:max-w-xs md:flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('members.searchPlaceholder')}
          aria-label={t('members.searchLabel')}
          className="pl-8"
        />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:flex md:flex-wrap">
        {filters.map(({ key, label, options }) => (
          <Select
            key={key}
            value={params[key] ?? ALL}
            onValueChange={(v) => onChange({ [key]: v === ALL ? undefined : v })}
          >
            <SelectTrigger className="w-full md:w-36" aria-label={label}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{label}</SelectItem>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
        {classTypes && classTypes.length > 0 && (
          <Select
            value={params.classGradeId ? String(params.classGradeId) : ALL}
            onValueChange={(v) => onChange({ classGradeId: v === ALL ? undefined : v })}
          >
            <SelectTrigger className="w-full md:w-44" aria-label={t('members.filters.allClasses')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('members.filters.allClasses')}</SelectItem>
              {classTypes.map((type) => (
                <SelectGroup key={type.id}>
                  <SelectLabel>{localName(type)}</SelectLabel>
                  {type.grades.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {gradeLabel(g)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        )}
        {departments && departments.length > 0 && (
          <Select
            value={params.departmentId ? String(params.departmentId) : ALL}
            onValueChange={(v) => onChange({ departmentId: v === ALL ? undefined : v })}
          >
            <SelectTrigger className="w-full md:w-48" aria-label={t('members.filters.allDepartments')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('members.filters.allDepartments')}</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={String(d.id)}>
                  {d.parentId !== null && '— '}
                  {localName(d)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            clearTimeout(timer.current)
            onReset()
          }}
          className="self-start md:self-auto"
        >
          <X />
          {t('common.clear')}
        </Button>
      )}
    </div>
  )
}
