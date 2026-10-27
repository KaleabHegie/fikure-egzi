import { buildDepartmentTree, type Department } from './types'

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
