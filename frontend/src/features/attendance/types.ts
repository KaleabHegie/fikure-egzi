export const SESSION_KINDS = ['CLASS', 'SERVICE_GROUP', 'OTHER'] as const
export type SessionKind = (typeof SESSION_KINDS)[number]
export const ATTENDANCE_STATUSES = ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'] as const
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number]
export type SessionStatus = 'OPEN' | 'CLOSED'

export interface StatusCounts {
  present: number
  late: number
  absent: number
  excused: number
}

/** Mirrors the API's session payload (list and detail). */
export interface AttendanceSession {
  id: number
  kind: SessionKind
  title: string
  startsAt: string
  endsAt: string
  lateAfterMinutes: number
  /** Class and service-group sessions: check-ins after this are Absent and the session closes. */
  absentAfterMinutes: number | null
  classGradeId: number | null
  departmentId: number | null
  serviceGroupId: number | null
  /** More groups of the same grade taking this attendance together. */
  extraServiceGroupIds: number[] | null
  organiserId: number | null
  location: string | null
  notes: string | null
  status: SessionStatus
  closedAt: string | null
  /** Closes itself (marking the unmarked Absent) when its end time passes. */
  autoClose: boolean
  classGrade: {
    id: number
    nameEn: string
    nameAm: string
    shortLabel: string | null
    classType: { id: number; nameEn: string; nameAm: string }
  } | null
  department: { id: number; nameEn: string; nameAm: string } | null
  serviceGroup: {
    id: number
    nameEn: string
    nameAm: string
    term: { id: number; nameEn: string; nameAm: string }
  } | null
  organiser: { id: number; nameEn: string; nameAm: string } | null
  /** Department whose admins and attendance takers handle this session (null = office only). */
  ownerDepartmentId: number | null
  /** When an open session will close itself (held open for late permissions); null if it won't. */
  closesAt: string | null
  rosterSize: number
  counts: StatusCounts
  unmarked: number
  rate: number | null
}

export interface SessionInput {
  kind: SessionKind
  title: string
  date: string
  startTime: string
  endTime: string
  lateAfterMinutes: number
  absentAfterMinutes: number | null
  classGradeId: number | null
  departmentId: number | null
  serviceGroupId: number | null
  extraServiceGroupIds: number[] | null
  organiserId: number | null
  /** Left out of the form; omitted, the session keeps what it had. */
  location?: string | null
  notes?: string | null
}

export interface AttendanceMemberSummary {
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

export interface AttendanceRecord {
  id: number
  status: AttendanceStatus
  checkedInAt: string | null
  method: 'QR' | 'MANUAL'
  note: string | null
  inRoster: boolean
}

export interface RosterRow {
  member: AttendanceMemberSummary
  inRoster: boolean
  record: AttendanceRecord | null
  /** The member's approved permission covering this session, if any. */
  permission: RosterPermission | null
}

export interface RosterPermission {
  /** Late-arrival grace minutes. */
  graceMinutes: number | null
  /** Away on permission: closing marks them Excused. */
  excuse: { code: string; type: string } | null
  leaveEarly: { code: string; fromTime: string | null } | null
}

export interface ScanResult {
  member: AttendanceMemberSummary
  /** null when the member isn't in the session's class or group (nothing recorded). */
  record: AttendanceRecord | null
  alreadyRecorded: boolean
  inRoster: boolean
}

export interface AttendanceDepartmentRef {
  id: number
  nameEn: string
  nameAm: string
}

export interface MemberAttendanceSummary extends StatusCounts {
  sessions: number
  rate: number | null
  minutesAttended: number
  /** Attendance per running department, busiest first (null department = the office). Staff API only. */
  byDepartment?: (StatusCounts & {
    department: AttendanceDepartmentRef | null
    sessions: number
    rate: number | null
    minutesAttended: number
  })[]
  /** Every session in the period, newest first. */
  records: {
    sessionId: number
    kind: SessionKind
    title: string
    startsAt: string
    endsAt: string
    /** The department running the session (staff API only; null = the office). */
    department?: AttendanceDepartmentRef | null
    status: AttendanceStatus
    checkedInAt: string | null
    note: string | null
    minutes: number
  }[]
}

export interface LowAttendanceReport {
  from: string
  to: string
  threshold: number
  minSessions: number
  members: (StatusCounts & {
    member: AttendanceMemberSummary
    rate: number
    minutesAttended: number
    lastAttended: string | null
  })[]
}

/** Who came most to a chosen set of sessions. */
export interface TopAttendanceReport {
  sessions: { id: number; kind: SessionKind; title: string; startsAt: string; endsAt: string; status: SessionStatus }[]
  totalSessions: number
  /** Members who attended at least one of them. */
  attendees: number
  members: (StatusCounts & {
    rank: number
    member: AttendanceMemberSummary
    attended: number
    rate: number | null
    minutesAttended: number
  })[]
}
