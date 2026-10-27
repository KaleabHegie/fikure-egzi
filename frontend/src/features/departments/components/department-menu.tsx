import { ArrowDown, ArrowUp, MoreHorizontal, Pencil, Plus, Power, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Department } from '../types'

export interface DepartmentActions {
  onEdit: (d: Department) => void
  onAddChild: (d: Department) => void
  onMove: (d: Department, delta: -1 | 1) => void
  onToggle: (d: Department) => void
  onDelete: (d: Department) => void
}

/** Manage-only actions for one department. */
export function DepartmentMenu({
  department,
  isFirst,
  isLast,
  actions,
}: {
  department: Department
  isFirst: boolean
  isLast: boolean
  actions: DepartmentActions
}) {
  const { t } = useTranslation()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('departments.editDepartment')}
          onClick={(e) => e.preventDefault()}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => actions.onEdit(department)}>
          <Pencil />
          {t('common.edit')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.onAddChild(department)}>
          <Plus />
          {t('departments.newDepartment')}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={isFirst} onSelect={() => actions.onMove(department, -1)}>
          <ArrowUp />
          {t('departments.moveUp')}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={isLast} onSelect={() => actions.onMove(department, 1)}>
          <ArrowDown />
          {t('departments.moveDown')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.onToggle(department)}>
          <Power />
          {department.isActive ? t('departments.deactivate') : t('departments.activate')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => actions.onDelete(department)}>
          <Trash2 />
          {t('common.delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
