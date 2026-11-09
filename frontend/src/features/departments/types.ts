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
