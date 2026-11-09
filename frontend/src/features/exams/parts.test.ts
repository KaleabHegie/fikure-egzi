import { blankPart, partsProblem, partsTotal, toPartInputs, toPartRows } from './parts'

describe('exam parts', () => {
  it('adds up the weights, ignoring ones still being typed', () => {
    expect(partsTotal([blankPart('እንቅስቃሴ', '40'), blankPart('ዜማ', '60')])).toBe(100)
    expect(partsTotal([blankPart('እንቅስቃሴ', '33.33'), blankPart('ዜማ', '')])).toBe(33.33)
  })

  it('accepts a split like Movement 40 / Melody 60, and a partial one under 100', () => {
    expect(partsProblem([blankPart('እንቅስቃሴ', '40'), blankPart('ዜማ', '60')])).toBeNull()
    expect(partsProblem([blankPart('እንቅስቃሴ', '40')])).toBeNull()
  })

  it('names the first problem', () => {
    expect(partsProblem([blankPart('', '40')])?.key).toBe('exams.parts.nameRequired')
    expect(partsProblem([blankPart('ዜማ', '0')])?.key).toBe('exams.parts.weightInvalid')
    expect(partsProblem([blankPart('ዜማ', '40'), blankPart('ዜማ ', '60')])?.key).toBe('exams.duplicatePart')
    expect(partsProblem([blankPart('ሀ', '70'), blankPart('ለ', '40')])).toEqual({
      key: 'exams.totalOver',
      params: { total: 110 },
    })
  })

  it('keeps existing part ids so their marks survive an edit', () => {
    const rows = toPartRows([{ id: 7, name: 'ዜማ', weight: 60, sortOrder: 0 }])
    expect(toPartInputs([...rows, blankPart(' እንቅስቃሴ ', '40')])).toEqual([
      { id: 7, name: 'ዜማ', weight: 60 },
      { name: 'እንቅስቃሴ', weight: 40 },
    ])
  })
})
