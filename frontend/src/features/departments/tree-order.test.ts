import { describe, expect, it } from 'vitest'
import { departmentOptions, departmentTreeOrder } from './types'

// As the API sends them: ordered by position among siblings, so branches interleave.
const flat = [
  { id: 1, parentId: null, name: 'Office' },
  { id: 2, parentId: 1, name: 'Education' },
  { id: 5, parentId: 2, name: 'Curriculum' },
  { id: 7, parentId: 3, name: 'Choir' },
  { id: 3, parentId: 1, name: 'Mezmur' },
  { id: 6, parentId: 2, name: 'Library' },
  { id: 8, parentId: 7, name: 'Choir A' },
]

describe('departmentTreeOrder', () => {
  it('puts every sub-department right under its own parent, with its depth', () => {
    expect(departmentTreeOrder(flat).map((e) => `${'-'.repeat(e.depth)}${e.department.name}`)).toEqual([
      'Office',
      '-Education',
      '--Curriculum',
      '--Library',
      '-Mezmur',
      '--Choir',
      '---Choir A',
    ])
  })

  it('marks departments that have sub-departments', () => {
    const entries = departmentTreeOrder(flat)
    expect(entries.filter((e) => e.hasChildren).map((e) => e.department.name)).toEqual([
      'Office',
      'Education',
      'Mezmur',
      'Choir',
    ])
  })

  it('starts a new branch when a parent is not in the list', () => {
    const subset = flat.filter((d) => d.id === 2 || d.id === 3 || d.id === 7)
    expect(departmentTreeOrder(subset).map((e) => [e.department.name, e.depth])).toEqual([
      ['Education', 0],
      ['Mezmur', 0],
      ['Choir', 1],
    ])
  })
})

describe('departmentOptions', () => {
  it('turns the tree into select options', () => {
    expect(departmentOptions(flat.slice(0, 3), (d) => d.name)).toEqual([
      { value: '1', label: 'Office', depth: 0, strong: true },
      { value: '2', label: 'Education', depth: 1, strong: true },
      { value: '5', label: 'Curriculum', depth: 2, strong: false },
    ])
  })
})
