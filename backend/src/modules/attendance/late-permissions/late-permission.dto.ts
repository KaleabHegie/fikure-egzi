import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Trim, TrimToNull } from '../../../common/transforms/string.transforms.js';
import { PermissionDecision, PermissionType } from '../../../generated/prisma/enums.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The permission request form (ቅጽ 2), as entered by the department. */
export class CreateLatePermissionDto {
  @ApiProperty({ description: 'The member it is for' })
  @IsInt()
  @Min(1)
  memberId: number;

  @ApiProperty({ description: 'The issuing department: it applies only to the classes it runs' })
  @IsInt()
  @Min(1)
  departmentId: number;

  @ApiProperty({ enum: PermissionType })
  @IsEnum(PermissionType)
  type: PermissionType;

  @ApiPropertyOptional({ description: 'What the permission is for, when the type is OTHER' })
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  typeOther?: string | null;

  @ApiPropertyOptional({
    description: 'LATE_ARRIVAL: minutes after the start the member may arrive and count as Present',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(240)
  graceMinutes?: number | null;

  @ApiPropertyOptional({
    type: [Number],
    description:
      'LATE_ARRIVAL: weekdays it applies on (0 = Sunday … 6 = Saturday). Others: every day.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekdays?: number[];

  @ApiProperty({ example: '2026-11-15', description: 'First day it applies (Gregorian)' })
  @Matches(DATE)
  startsOn: string;

  @ApiProperty({ example: '2026-11-15', description: 'Last day it applies (Gregorian)' })
  @Matches(DATE)
  endsOn: string;

  @ApiPropertyOptional({ example: '08:00', description: 'From this time (Addis, HH:mm)' })
  @IsOptional()
  @Matches(TIME)
  fromTime?: string | null;

  @ApiPropertyOptional({ example: '10:00', description: 'Until this time (Addis, HH:mm)' })
  @IsOptional()
  @Matches(TIME)
  toTime?: string | null;

  @ApiProperty({ example: 'Works a Sunday morning shift until 8:30' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;

  @ApiProperty({ example: '2026-11-11', description: 'When the form was filled in' })
  @Matches(DATE)
  requestedOn: string;

  @ApiPropertyOptional({ description: 'The phone number written on the form' })
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  contactPhone?: string | null;

  @ApiPropertyOptional({ description: 'The member signed the confirmation' })
  @IsOptional()
  @IsBoolean()
  memberConfirmed?: boolean;

  @ApiPropertyOptional({ example: '2026-11-11' })
  @IsOptional()
  @Matches(DATE)
  memberConfirmedOn?: string | null;

  @ApiProperty({ enum: PermissionDecision, description: 'Only APPROVED changes attendance' })
  @IsEnum(PermissionDecision)
  decision: PermissionDecision;

  @ApiPropertyOptional({ example: '2026-11-12' })
  @IsOptional()
  @Matches(DATE)
  decidedOn?: string | null;

  @ApiPropertyOptional({ description: 'Sub-department representative (የንዑስ ክፍል ተጠሪ)' })
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  representativeName?: string | null;

  @ApiPropertyOptional({ description: 'Department head who signed the decision' })
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  headName?: string | null;
}

export class UpdateLatePermissionDto extends PartialType(CreateLatePermissionDto) {}

export const PERMISSION_STATES = [
  'active',
  'upcoming',
  'pending',
  'ended',
  'rejected',
  'all',
] as const;
export type PermissionStateFilter = (typeof PERMISSION_STATES)[number];

export class QueryLatePermissionsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  departmentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  memberId?: number;

  @ApiPropertyOptional({ enum: PERMISSION_STATES, default: 'all' })
  @IsOptional()
  @IsIn(PERMISSION_STATES)
  state?: PermissionStateFilter;

  @ApiPropertyOptional({ enum: PermissionType })
  @IsOptional()
  @IsEnum(PermissionType)
  type?: PermissionType;

  @ApiPropertyOptional({ description: 'Member name or ID, or the form number' })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class CandidateQueryDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  departmentId: number;

  @ApiPropertyOptional()
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
