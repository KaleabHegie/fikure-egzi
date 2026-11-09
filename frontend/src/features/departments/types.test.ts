import { buildDepartmentTree, type Department, mainDepartments } from './types'

const dept = (id: number, parentId: number | null): Department => ({
  id,
  parentId,
  code: `D${id}`,
  nameEn: `Dept ${id}`,
  nameAm: `ክፍል ${id}`,
  descriptionEn: null,
  descriptionAm: null,
  sortOrder: id,
  isActive: true,
  memberCount: 0,
  head: null,
})

describe('buildDepartmentTree', () => {
  it('nests departments under the office, keeping order', () => {
    const tree = buildDepartmentTree([dept(1, null), dept(2, 1), dept(3, 1), dept(4, 3)])
    expect(tree).toHaveLength(1)
    expect(tree[0]!.children.map((c) => c.id)).toEqual([2, 3])
    expect(tree[0]!.children[1]!.children.map((c) => c.id)).toEqual([4])
  })

  it('shows a department as a root when its parent is hidden (inactive)', () => {
    expect(buildDepartmentTree([dept(2, 1)]).map((n) => n.id)).toEqual([2])
  })
})

describe('mainDepartments', () => {
  // ፅህፈት ቤት (1) → Mezmur (4) → Choir follow-up (40) → a section (400); Education (2).
  const all = [
    { id: 1, parentId: null },
    { id: 2, parentId: 1 },
    { id: 4, parentId: 1 },
    { id: 40, parentId: 4 },
    { id: 400, parentId: 40 },
  ]

  it('offers only the departments directly under the office', () => {
    expect(mainDepartments(all).map((d) => d.id)).toEqual([2, 4])
  })

  it("keeps a record's current department listed even when it sits lower", () => {
    expect(mainDepartments(all, [40, null]).map((d) => d.id)).toEqual([2, 4, 40])
  })

  it("treats a department admin's own departments as the main ones", () => {
    // They see Mezmur and its sub-departments, but not the office above it.
    expect(mainDepartments(all.filter((d) => d.id >= 4)).map((d) => d.id)).toEqual([4])
  })
})
