import { emptyMemberForm, memberFormSchema, memberToForm, toMemberPayload } from './schema'
import type { Member } from './types'

const valid = () => ({
  ...emptyMemberForm(),
  firstName: 'Abebe',
  fatherName: 'Kebede',
  gender: 'MALE' as const,
  dateOfBirth: '2005-09-11',
})

const issuesFor = (values: unknown) => {
  const result = memberFormSchema.safeParse(values)
  return result.success ? {} : Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message]))
}

describe('memberFormSchema', () => {
  it('accepts a minimal valid registration', () => {
    expect(memberFormSchema.safeParse(valid()).success).toBe(true)
  })

  it('requires names, gender and date of birth', () => {
    const issues = issuesFor(emptyMemberForm())
    expect(Object.keys(issues)).toEqual(expect.arrayContaining(['firstName', 'fatherName', 'gender', 'dateOfBirth']))
  })

  it('accepts Ethiopian phone formats and rejects others', () => {
    expect(issuesFor({ ...valid(), phone: '+251 911 22 33 44' }).phone).toBeUndefined()
    expect(issuesFor({ ...valid(), phone: '0711223344' }).phone).toBeUndefined()
    expect(issuesFor({ ...valid(), phone: '12345' }).phone).toBe('validation.phone')
  })

  it('rejects a join date before the date of birth', () => {
    expect(issuesFor({ ...valid(), dateOfBirth: '2010-05-01', joinedAt: '2009-01-01' }).joinedAt).toBe('validation.joinedBeforeBirth')
  })

  it('rejects a future date of birth', () => {
    expect(issuesFor({ ...valid(), dateOfBirth: '2999-01-01' }).dateOfBirth).toBe('validation.dateOfBirthFuture')
  })

  it('requires a description when a health condition is reported', () => {
    expect(issuesFor({ ...valid(), hasHealthCondition: 'yes' }).healthConditionNote).toBe('validation.healthNoteRequired')
    expect(issuesFor({ ...valid(), hasHealthCondition: 'yes', healthConditionNote: 'Asthma' }).healthConditionNote).toBeUndefined()
    expect(issuesFor({ ...valid(), hasHealthCondition: 'no' }).healthConditionNote).toBeUndefined()
  })
})

describe('toMemberPayload — health and agreement', () => {
  it('sends the yes/no answer as a boolean and keeps the note only with a yes', () => {
    const yes = toMemberPayload({ ...valid(), hasHealthCondition: 'yes', healthConditionNote: 'Asthma' })
    expect(yes).toMatchObject({ hasHealthCondition: true, healthConditionNote: 'Asthma' })

    const no = toMemberPayload({ ...valid(), hasHealthCondition: 'no', healthConditionNote: 'leftover text' })
    expect(no).toMatchObject({ hasHealthCondition: false, healthConditionNote: null })

    expect(toMemberPayload(valid())).toMatchObject({ hasHealthCondition: null, healthConditionNote: null })
  })

  it('passes the accepted class agreements through', () => {
    expect(toMemberPayload({ ...valid(), agreementIds: [1, 3] }).agreementIds).toEqual([1, 3])
    expect(toMemberPayload(valid()).agreementIds).toEqual([])
  })
})

describe('toMemberPayload', () => {
  it('turns class picks into grade ids, skipping unassigned types', () => {
    expect(toMemberPayload({ ...valid(), classGrades: { '1': '12', '2': '' } }).classGradeIds).toEqual([12])
  })

  it('turns empty strings into null so PATCH clears fields', () => {
    const payload = toMemberPayload({ ...valid(), christianName: '  ', phone: '' })
    expect(payload.christianName).toBeNull()
    expect(payload.phone).toBeNull()
    expect(payload.firstName).toBe('Abebe')
  })
})

describe('memberToForm', () => {
  it('maps API dates and nulls into form strings', () => {
    const form = memberToForm({
      firstName: 'Abebe',
      fatherName: 'Kebede',
      grandfatherName: null,
      gender: 'MALE',
      status: 'ACTIVE',
      dateOfBirth: '1990-03-02T00:00:00.000Z',
      joinedAt: '2024-01-07T00:00:00.000Z',
      maritalStatus: null,
      educationLevel: 'DIPLOMA',
      classes: [
        {
          classType: { id: 1, code: 'MEZMUR', nameEn: 'Mezmur Class', nameAm: 'የመዝሙር ክፍል' },
          classGrade: { id: 12, code: 'EZEL', nameEn: 'Ezel', nameAm: 'ዕዝል', shortLabel: 'ለ', isActive: true },
          assignedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      agreements: [
        {
          agreementId: 4,
          titleAm: 'የዲሲፕሊን እና የሥነ-ምግባር ስምምነት',
          titleEn: 'Discipline and Code of Conduct Agreement',
          classType: { id: 1, nameEn: 'Mezmur Class', nameAm: 'የመዝሙር ክፍል' },
          acceptedAt: '2026-11-09T07:00:00.000Z',
        },
      ],
    } as Member)
    expect(form.agreementIds).toEqual([4])
    expect(form.dateOfBirth).toBe('1990-03-02')
    expect(form.joinedAt).toBe('2024-01-07')
    expect(form.grandfatherName).toBe('')
    expect(form.educationLevel).toBe('DIPLOMA')
    expect(form.classGrades).toEqual({ '1': '12' })
  })
})
