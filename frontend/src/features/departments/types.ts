import type { Option } from '@/components/form/form-fields'

export const DEPARTMENT_ROLES = ['HEAD', 'DEPUTY', 'SECRETARY', 'MEMBER'] as const
export type DepartmentRole = (typeof DEPARTMENT_ROLES)[number]

/** Minimal member card used inside department views. */
export interface MemberSummary {
  id: number
  memberCode: string
  firstName: string
  fatherName: string
  grandfatherName: string | null
  christianName: string | null
  phone: string | null
  hasPhoto: boolean
  updatedAt: string
}

/** Mirrors GET /departments (flat; build the tree from parentId). */
export interface Department {
  id: number
  code: string
  nameEn: string
  nameAm: string
  descriptionEn: string | null
  descriptionAm: string | null
  parentId: number | null
  sortOrder: number
  isActive: boolean
  memberCount: number
  head: MemberSummary | null
}

export interface DepartmentDetail extends Omit<Department, 'memberCount' | 'head'> {
  parent: Pick<Department, 'id' | 'code' | 'nameEn' | 'nameAm'> | null
}

export interface DepartmentMembership {
  id: number
  role: DepartmentRole
  joinedAt: string
  member: MemberSummary
}

/** An ended service period (GET /departments/:id/history). */
export interface FormerService {
  id: number
  role: DepartmentRole
  startedAt: string
  endedAt: string
  member: MemberSummary
}

/** A member's department, as embedded in the Member payload. */
export interface MemberDepartment {
  id: number
  role: DepartmentRole
  joinedAt: string
  department: Pick<Department, 'id' | 'code' | 'nameEn' | 'nameAm' | 'isActive'>
}

export interface DepartmentInput {
  code: string
  nameEn: string
  nameAm: string
  descriptionEn: string | null
  descriptionAm: string | null
  parentId: number | null
  isActive: boolean
}

export interface DepartmentTreeNode extends Department {
  children: DepartmentTreeNode[]
}

/** Builds the tree from the flat, already-ordered list. Orphans (hidden parent) become roots. */
export function buildDepartmentTree(departments: Department[]): DepartmentTreeNode[] {
  const nodes = new Map(departments.map((d) => [d.id, { ...d, children: [] as DepartmentTreeNode[] }]))
  const roots: DepartmentTreeNode[] = []
  for (const node of nodes.values()) {
    const parent = node.parentId !== null ? nodes.get(node.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

/** A department placed in tree order, with how deep it sits and whether it has sub-departments here. */
export interface DepartmentTreeEntry<T> {
  department: T
  depth: number
  hasChildren: boolean
}

/**
 * Departments in tree order — each one followed by its own sub-departments —
 * for dropdowns. Works on any subset: a department whose parent is not in the
 * list starts its own branch at depth 0. Siblings keep the list's order.
 */
export function departmentTreeOrder<T extends Pick<Department, 'id' | 'parentId'>>(
  departments: T[],
): DepartmentTreeEntry<T>[] {
  const ids = new Set(departments.map((d) => d.id))
  const children = new Map<number, T[]>()
  const roots: T[] = []
  for (const d of departments) {
    if (d.parentId !== null && d.parentId !== d.id && ids.has(d.parentId)) {
      children.set(d.parentId, [...(children.get(d.parentId) ?? []), d])
    } else {
      roots.push(d)
    }
  }
  const out: DepartmentTreeEntry<T>[] = []
  const seen = new Set<number>()
  const visit = (d: T, depth: number) => {
    if (seen.has(d.id)) return
    seen.add(d.id)
    const kids = children.get(d.id) ?? []
    out.push({ department: d, depth, hasChildren: kids.length > 0 })
    for (const child of kids) visit(child, depth + 1)
  }
  for (const root of roots) visit(root, 0)
  return out
}

/** Select options for departments, nested under their parents. */
export function departmentOptions<T extends Pick<Department, 'id' | 'parentId'>>(
  departments: T[],
  label: (d: T) => string,
): Option[] {
  return departmentTreeOrder(departments).map(({ department, depth, hasChildren }) => ({
    value: String(department.id),
    label: label(department),
    depth,
    strong: hasChildren,
  }))
}

/**
 * The main departments: those directly under the top office (ፅህፈት ቤት). For a
 * department admin, whose list starts at their own departments, those are the
 * main ones. Forms that choose a department offer only these; ids in `keep`
 * (a record's current department) stay listed even if they sit lower.
 */
export function mainDepartments<T extends Pick<Department, 'id' | 'parentId'>>(
  departments: T[],
  keep: (number | null | undefined)[] = [],
): T[] {
  const byId = new Map(departments.map((d) => [d.id, d]))
  return departments.filter((d) => {
    if (keep.includes(d.id)) return true
    if (d.parentId === null) return false
    const parent = byId.get(d.parentId)
    return !parent || parent.parentId === null
  })
}
