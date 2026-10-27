/** A period (usually a year) for which service groups are organised. */
export interface ServiceTerm {
  id: number
  nameEn: string
  nameAm: string
  startsOn: string
  endsOn: string
  isCurrent: boolean
  groupCount: number
  memberCount: number
}

export interface ServiceTermInput {
  nameEn: string
  nameAm: string
  startsOn: string
  endsOn: string
  isCurrent: boolean
  copyFromTermId?: number
  copyMembers?: boolean
}

export interface GroupMember {
  id: number
  memberCode: string
  firstName: string
  fatherName: string
  grandfatherName: string | null
  christianName: string | null
  hasPhoto: boolean
  updatedAt: string
}

export interface ServiceGroup {
  id: number
  termId: number
  nameEn: string
  nameAm: string
  classGradeId: number | null
  notes: string | null
  sortOrder: number
  classGrade: {
    id: number
    nameEn: string
    nameAm: string
    shortLabel: string | null
    classType: { id: number; nameEn: string; nameAm: string }
  } | null
  sessionCount: number
  members: GroupMember[]
}

export interface ServiceGroupInput {
  nameEn: string
  nameAm: string
  classGradeId: number | null
  notes: string | null
}

export interface GroupCandidate extends GroupMember {
  group: { id: number; nameEn: string; nameAm: string } | null
}

export interface MemberServiceGroup {
  assignedAt: string
  term: Pick<ServiceTerm, 'id' | 'nameEn' | 'nameAm' | 'startsOn' | 'endsOn' | 'isCurrent'>
  group: { id: number; nameEn: string; nameAm: string }
}
