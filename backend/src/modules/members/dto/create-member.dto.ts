import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  Min,
  IsEmail,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  EducationLevel,
  Gender,
  MaritalStatus,
  MembershipStatus,
} from '../../../generated/prisma/enums.js';
import {
  ETHIOPIAN_PHONE_REGEX,
  LowerCase,
  NormalizePhone,
  Trim,
  TrimToNull,
} from '../../../common/transforms/string.transforms.js';

const PHONE_MESSAGE = 'must be an Ethiopian mobile number, e.g. 0911223344 or +251911223344';
const DATE_MESSAGE = 'must be a date in YYYY-MM-DD format';

export class CreateMemberDto {
  // ── Identity ──────────────────────────────────────────────────────────────
  @ApiProperty({ example: 'Abebe', maxLength: 100 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ example: 'Kebede', maxLength: 100 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fatherName: string;

  @ApiPropertyOptional({ example: 'Tesfaye', maxLength: 100 })
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  grandfatherName?: string | null;

  @ApiPropertyOptional({
    example: 'Wolde Mariam',
    description: 'Baptismal name',
    maxLength: 100,
  })
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  christianName?: string | null;

  @ApiProperty({ enum: Gender })
  @IsEnum(Gender)
  gender: Gender;

  @ApiPropertyOptional({ example: '2005-09-11', format: 'date' })
  @TrimToNull()
  @IsOptional()
  @IsISO8601({ strict: true }, { message: `dateOfBirth ${DATE_MESSAGE}` })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: `dateOfBirth ${DATE_MESSAGE}` })
  dateOfBirth?: string | null;

  @ApiPropertyOptional({ example: 'Addis Ababa', maxLength: 100 })
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  placeOfBirth?: string | null;

  @ApiPropertyOptional({ enum: MaritalStatus })
  @TrimToNull()
  @IsOptional()
  @IsEnum(MaritalStatus)
  maritalStatus?: MaritalStatus | null;

  // ── Contact ───────────────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: '0911223344' })
  @NormalizePhone()
  @IsOptional()
  @Matches(ETHIOPIAN_PHONE_REGEX, { message: `phone ${PHONE_MESSAGE}` })
  phone?: string | null;

  @ApiPropertyOptional({ example: '0722334455' })
  @NormalizePhone()
  @IsOptional()
  @Matches(ETHIOPIAN_PHONE_REGEX, {
    message: `alternatePhone ${PHONE_MESSAGE}`,
  })
  alternatePhone?: string | null;

  @ApiPropertyOptional({ example: 'abebe@example.com' })
  @TrimToNull()
  @LowerCase()
  @IsOptional()
  @IsEmail()
  @MaxLength(191)
  email?: string | null;

  // ── Address ───────────────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: 'Addis Ababa' })
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string | null;

  @ApiPropertyOptional({ example: 'Bole' })
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  subCity?: string | null;

  @ApiPropertyOptional({ example: '03' })
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  woreda?: string | null;

  @ApiPropertyOptional({ example: '12' })
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  kebele?: string | null;

  @ApiPropertyOptional({ example: '1234' })
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  houseNumber?: string | null;

  // ── Education & work ──────────────────────────────────────────────────────
  @ApiPropertyOptional({ enum: EducationLevel })
  @TrimToNull()
  @IsOptional()
  @IsEnum(EducationLevel)
  educationLevel?: EducationLevel | null;

  @ApiPropertyOptional({ example: 'Teacher' })
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  occupation?: string | null;

  // ── Church ────────────────────────────────────────────────────────────────
  @ApiPropertyOptional({
    example: 'Aba Gebre Mariam',
    description: 'Confession (spiritual) father',
  })
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  spiritualFatherName?: string | null;

  @ApiPropertyOptional({
    enum: MembershipStatus,
    default: MembershipStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(MembershipStatus)
  status?: MembershipStatus;

  @ApiPropertyOptional({
    example: '2024-01-07',
    format: 'date',
    description: 'Date the member joined. Defaults to today.',
  })
  @TrimToNull()
  @IsOptional()
  @IsISO8601({ strict: true }, { message: `joinedAt ${DATE_MESSAGE}` })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: `joinedAt ${DATE_MESSAGE}` })
  joinedAt?: string;

  // ── Emergency contact ────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: 'Almaz Bekele' })
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  emergencyContactName?: string | null;

  @ApiPropertyOptional({ example: '0911556677' })
  @NormalizePhone()
  @IsOptional()
  @Matches(ETHIOPIAN_PHONE_REGEX, {
    message: `emergencyContactPhone ${PHONE_MESSAGE}`,
  })
  emergencyContactPhone?: string | null;

  @ApiPropertyOptional({ example: 'Mother' })
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  emergencyContactRelation?: string | null;

  // ── Classes ─────────────────────────────────────────────────────────────
  @ApiPropertyOptional({
    type: [Number],
    example: [1, 7],
    description:
      'Class grade ids, at most one per class type. On update, replaces the current set.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsInt({ each: true })
  @Min(1, { each: true })
  classGradeIds?: number[];

  // ── Other (photo is uploaded separately: PUT /members/:id/photo) ─────────
  @ApiPropertyOptional({ maxLength: 2000 })
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
