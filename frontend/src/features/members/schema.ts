import { z } from 'zod'
import { msg } from '@/i18n'
import { todayIso } from '@/lib/ethiopian-calendar'
import { normalizeEthiopianPhone, PHONE_PATTERN } from '@/lib/phone'
import {
  EDUCATION_LEVELS,
  GENDERS,
  MARITAL_STATUSES,
  type Member,
} from './types'

/*
 * Form values are plain strings ('' = not provided) because that is what
 * inputs produce. toMemberPayload() converts them for the API. Rules mirror
 * backend CreateMemberDto; the API re-validates everything regardless.
 */

/*
 * Messages are i18n keys (see msg()); form fields translate them at render
 * time, so they follow the UI language.
 */
const tooLong = (max: number) => msg('validation.tooLong', { max })
const optionalText = (max: number) => z.string().trim().max(max, tooLong(max))
const requiredText = (max: number, requiredKey: string) =>
  z.string().trim().min(1, msg(requiredKey)).max(max, tooLong(max))

const optionalPhone = z
  .string()
  .trim()
  .refine((v) => v === '' || PHONE_PATTERN.test(normalizeEthiopianPhone(v)), {
    message: msg('validation.phone'),
  })

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const today = () => todayIso()

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) => z.union([z.enum(values), z.literal('')])

const memberFields = z.object({
  firstName: requiredText(100, 'validation.firstNameRequired'),
  fatherName: requiredText(100, 'validation.fatherNameRequired'),
  grandfatherName: optionalText(100),
  christianName: optionalText(100),
  gender: z.union([z.enum(GENDERS), z.literal('')]).refine((v) => v.length > 0, msg('validation.genderRequired')),
  // Required: the API assigns the Sunday school section from age.
  dateOfBirth: z
    .string()
    .min(1, msg('validation.dateOfBirthRequired'))
    .regex(ISO_DATE, msg('validation.date'))
    .refine((v) => v <= today(), msg('validation.dateOfBirthFuture')),
  placeOfBirth: optionalText(100),
  joinedAt: z.string().min(1, msg('validation.joinedAtRequired')).regex(ISO_DATE, msg('validation.date')),
  maritalStatus: optionalEnum(MARITAL_STATUSES),

  phone: optionalPhone,
  alternatePhone: optionalPhone,
  email: z.union([z.literal(''), z.email(msg('validation.email')).max(191, tooLong(191))]),

  city: optionalText(100),
  subCity: optionalText(100),
  woreda: optionalText(50),
  kebele: optionalText(50),
  houseNumber: optionalText(30),

  educationLevel: optionalEnum(EDUCATION_LEVELS),
  occupation: optionalText(100),

  emergencyContactName: optionalText(150),
  emergencyContactPhone: optionalPhone,
  emergencyContactRelation: optionalText(50),

  notes: optionalText(2000),

  /** classTypeId → classGradeId ('' or missing = not assigned). */
  classGrades: z.record(z.string(), z.string().optional()),
})

export const memberFormSchema = memberFields.refine(
  (v) => v.dateOfBirth === '' || v.joinedAt === '' || v.joinedAt >= v.dateOfBirth,
  { path: ['joinedAt'], message: msg('validation.joinedBeforeBirth') },
)

export type MemberFormValues = z.infer<typeof memberFormSchema>
export const MEMBER_FORM_FIELDS = Object.keys(memberFields.shape) as (keyof MemberFormValues)[]

export const emptyMemberForm = (): MemberFormValues => ({
  firstName: '',
  fatherName: '',
  grandfatherName: '',
  christianName: '',
  gender: '',
  dateOfBirth: '',
  placeOfBirth: '',
  joinedAt: today(),
  maritalStatus: '',
  phone: '',
  alternatePhone: '',
  email: '',
  city: 'Addis Ababa',
  subCity: '',
  woreda: '',
  kebele: '',
  houseNumber: '',
  educationLevel: '',
  occupation: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  emergencyContactRelation: '',
  notes: '',
  classGrades: {},
})

export function memberToForm(m: Member): MemberFormValues {
  const s = (v: string | null) => v ?? ''
  return {
    firstName: m.firstName,
    fatherName: m.fatherName,
    grandfatherName: s(m.grandfatherName),
    christianName: s(m.christianName),
    gender: m.gender,
    dateOfBirth: m.dateOfBirth?.slice(0, 10) ?? '',
    placeOfBirth: s(m.placeOfBirth),
    joinedAt: m.joinedAt.slice(0, 10),
    maritalStatus: m.maritalStatus ?? '',
    phone: s(m.phone),
    alternatePhone: s(m.alternatePhone),
    email: s(m.email),
    city: s(m.city),
    subCity: s(m.subCity),
    woreda: s(m.woreda),
    kebele: s(m.kebele),
    houseNumber: s(m.houseNumber),
    educationLevel: m.educationLevel ?? '',
    occupation: s(m.occupation),
    emergencyContactName: s(m.emergencyContactName),
    emergencyContactPhone: s(m.emergencyContactPhone),
    emergencyContactRelation: s(m.emergencyContactRelation),
    notes: s(m.notes),
    classGrades: Object.fromEntries(m.classes.map((c) => [String(c.classType.id), String(c.classGrade.id)])),
  }
}

type TextFields = Omit<MemberFormValues, 'classGrades'>
export type MemberPayload = { [K in keyof TextFields]: TextFields[K] | null } & { classGradeIds: number[] }

/** '' → null, so a cleared field clears the stored value; class picks → grade ids. */
export function toMemberPayload(values: MemberFormValues): MemberPayload {
  const { classGrades, ...text } = values
  const fields = Object.fromEntries(
    Object.entries(text).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? null : v]),
  ) as { [K in keyof TextFields]: TextFields[K] | null }
  return {
    ...fields,
    classGradeIds: Object.values(classGrades)
      .filter((v): v is string => Boolean(v))
      .map(Number),
  }
}
