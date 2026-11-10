import { ListFilter, Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FilterChip } from '@/components/common/filter-chip'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { useClassTypes } from '@/features/classes/api'
import { useDepartments } from '@/features/departments/api'
import { useGradeLabel, useLocalizedName } from '@/features/classes/use-localized'
import { useMemberLabels } from '../labels'
import type { MemberListParams } from '../types'
import { TreeMark } from '@/components/common/tree-mark'
import { departmentTreeOrder } from '@/features/departments/types'
import { cn } from '@/lib/utils'

const ALL = '__all__'
const SEARCH_DEBOUNCE_MS = 300

/** One active filter, shown as a removable chip. */
interface Chip {
  param: keyof MemberListParams
  category: string
  value: string
}

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

  const grade = classTypes?.flatMap((type) => type.grades).find((g) => String(g.id) === String(params.classGradeId))
  const department = departments?.find((d) => String(d.id) === String(params.departmentId))
  const chips: Chip[] = []
  if (params.status) chips.push({ param: 'status', category: t('members.table.status'), value: labels.status(params.status) })
  if (params.gender) chips.push({ param: 'gender', category: t('members.table.gender'), value: labels.gender(params.gender) })
  if (params.educationLevel) {
    chips.push({ param: 'educationLevel', category: t('members.fields.educationLevel'), value: labels.education(params.educationLevel) })
  }
  if (grade) chips.push({ param: 'classGradeId', category: t('members.table.classes'), value: gradeLabel(grade) })
  if (department) chips.push({ param: 'departmentId', category: t('nav.departments'), value: localName(department) })
  if (params.selfRegistered) {
    chips.push({ param: 'selfRegistered', category: t('members.filters.source'), value: t('members.filters.selfRegistered') })
  }

  const set = (param: keyof MemberListParams, v: string | undefined) =>
    onChange({ [param]: v } as Partial<Record<keyof MemberListParams, string | undefined>>)
  const radio = (param: keyof MemberListParams) => ({
    value: params[param] ? String(params[param]) : ALL,
    onValueChange: (v: string) => set(param, v === ALL ? undefined : v),
  })

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-56 flex-1">
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

      {chips.map((chip) => (
        <FilterChip
          key={chip.param}
          category={chip.category}
          value={chip.value}
          onClear={() => set(chip.param, undefined)}
        />
      ))}

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            clearTimeout(timer.current)
            onReset()
          }}
        >
          <X />
          {t('common.clear')}
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            <ListFilter />
            {t('common.filter')}
            {chips.length > 0 && (
              <span className="tabular grid size-5 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                {chips.length}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>{t('members.table.status')}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup {...radio('status')}>
                <DropdownMenuRadioItem value={ALL}>{t('members.filters.allStatuses')}</DropdownMenuRadioItem>
                {labels.statusOptions.map((o) => (
                  <DropdownMenuRadioItem key={o.value} value={o.value}>
                    {o.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>{t('members.table.gender')}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup {...radio('gender')}>
                <DropdownMenuRadioItem value={ALL}>{t('members.filters.allGenders')}</DropdownMenuRadioItem>
                {labels.genderOptions.map((o) => (
                  <DropdownMenuRadioItem key={o.value} value={o.value}>
                    {o.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>{t('members.fields.educationLevel')}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup {...radio('educationLevel')}>
                <DropdownMenuRadioItem value={ALL}>{t('members.filters.allEducation')}</DropdownMenuRadioItem>
                {labels.educationOptions.map((o) => (
                  <DropdownMenuRadioItem key={o.value} value={o.value}>
                    {o.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {classTypes && classTypes.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>{t('members.table.classes')}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
                <DropdownMenuRadioGroup {...radio('classGradeId')}>
                  <DropdownMenuRadioItem value={ALL}>{t('members.filters.allClasses')}</DropdownMenuRadioItem>
                  {classTypes.map((type) => (
                    <div key={type.id}>
                      <DropdownMenuLabel>{localName(type)}</DropdownMenuLabel>
                      {type.grades.map((g) => (
                        <DropdownMenuRadioItem key={g.id} value={String(g.id)}>
                          {gradeLabel(g)}
                        </DropdownMenuRadioItem>
                      ))}
                    </div>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          {departments && departments.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>{t('nav.departments')}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
                <DropdownMenuRadioGroup {...radio('departmentId')}>
                  <DropdownMenuRadioItem value={ALL}>{t('members.filters.allDepartments')}</DropdownMenuRadioItem>
                  {departmentTreeOrder(departments).map(({ department: d, depth, hasChildren }) => (
                    <DropdownMenuRadioItem key={d.id} value={String(d.id)} className={cn(hasChildren && 'font-medium')}>
                      <TreeMark depth={depth} />
                      {localName(d)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>{t('members.filters.source')}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup {...radio('selfRegistered')}>
                <DropdownMenuRadioItem value={ALL}>{t('members.filters.allSources')}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="true">{t('members.filters.selfRegistered')}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
