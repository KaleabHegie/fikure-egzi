import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
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
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';
import { Trim, TrimToNull } from '../../../common/transforms/string.transforms.js';
import {
  AttendanceSessionKind,
  AttendanceSessionStatus,
  AttendanceStatus,
} from '../../../generated/prisma/enums.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateSessionDto {
  @ApiProperty({ enum: AttendanceSessionKind })
  @IsEnum(AttendanceSessionKind)
  kind: AttendanceSessionKind;

  @ApiProperty({ example: 'Sunday program' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title: string;

  @ApiProperty({
    example: '2026-10-25',
    description: 'Gregorian date (the web app picks it in E.C.)',
  })
  @IsISO8601({ strict: true })
  @Matches(DATE, { message: 'date must be YYYY-MM-DD' })
  date: string;

  @ApiProperty({ example: '08:00', description: 'Addis Ababa time, 24h' })
  @Matches(TIME, { message: 'startTime must be HH:mm (24h)' })
  startTime: string;

  @ApiProperty({ example: '11:00' })
  @Matches(TIME, { message: 'endTime must be HH:mm (24h)' })
  endTime: string;

  @ApiPropertyOptional({ default: 15, description: 'Check-ins after start + this are Late' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  lateAfterMinutes?: number;

  @ApiPropertyOptional({
    description: 'Roster = members in this class grade (required for CLASS, optional for OTHER)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  classGradeId?: number | null;

  @ApiPropertyOptional({ description: 'Roster = people serving in this department (OTHER only)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  departmentId?: number | null;

  @ApiPropertyOptional({
    description: 'Roster = members of this service group (required for SERVICE_GROUP)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  serviceGroupId?: number | null;

  @ApiPropertyOptional({
    description: 'OTHER only: the department running the session (null = the office)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  organiserId?: number | null;

  @ApiPropertyOptional()
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  location?: string | null;

  @ApiPropertyOptional()
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

/** The kind is fixed once created; the rest can be corrected. */
export class UpdateSessionDto extends PartialType(OmitType(CreateSessionDto, ['kind'] as const)) {}

export class QuerySessionsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @Matches(DATE, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @Matches(DATE, { message: 'to must be YYYY-MM-DD' })
  to?: string;

  @ApiPropertyOptional({ enum: AttendanceSessionKind })
  @IsOptional()
  @IsEnum(AttendanceSessionKind)
  kind?: AttendanceSessionKind;

  @ApiPropertyOptional({ enum: AttendanceSessionStatus })
  @IsOptional()
  @IsEnum(AttendanceSessionStatus)
  status?: AttendanceSessionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  classGradeId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  serviceGroupId?: number;
}

export class ScanDto {
  @ApiProperty({
    example: 'FE-00042',
    description: 'The member ID read from the QR code (or typed)',
  })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  code: string;
}

export class MarkDto {
  @ApiProperty({ enum: AttendanceStatus })
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;

  @ApiPropertyOptional({ description: 'Reason for Excused, or a remark' })
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string | null;
}

export class ReportQueryDto {
  @ApiPropertyOptional({ format: 'date', description: 'Defaults to 90 days ago' })
  @IsOptional()
  @Matches(DATE, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ format: 'date', description: 'Defaults to today' })
  @IsOptional()
  @Matches(DATE, { message: 'to must be YYYY-MM-DD' })
  to?: string;

  @ApiPropertyOptional({ default: 50, description: 'Attendance-rate threshold in %' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  threshold: number = 50;

  @ApiPropertyOptional({ default: 3, description: 'Ignore members with fewer counted sessions' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minSessions: number = 3;

  @ApiPropertyOptional({ enum: AttendanceSessionKind })
  @IsOptional()
  @IsEnum(AttendanceSessionKind)
  kind?: AttendanceSessionKind;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  classGradeId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  serviceGroupId?: number;

  @ApiPropertyOptional({ enum: ['rate', 'name'], default: 'rate' })
  @IsOptional()
  @IsIn(['rate', 'name'])
  sort: 'rate' | 'name' = 'rate';
}

/** The sessions (events) a top-attendance ranking counts. */
export class TopAttendanceQueryDto {
  @ApiProperty({ example: '4,5,6', description: 'Comma-separated session ids (at most 500)' })
  @Transform(({ value }: { value: unknown }) =>
    String(value ?? '')
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((n) => Number.isInteger(n) && n > 0),
  )
  @IsArray()
  @ArrayMinSize(1, { message: 'Choose at least one session' })
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  sessionIds: number[];

  @ApiPropertyOptional({ default: 50, description: 'How many members to rank' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit: number = 50;
}
