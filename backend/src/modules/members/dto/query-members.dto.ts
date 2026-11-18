import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';
import { Trim } from '../../../common/transforms/string.transforms.js';
import { EducationLevel, Gender, MembershipStatus } from '../../../generated/prisma/enums.js';

/** How complete the record is: everything filled in, or under half (as on the dashboard). */
export const MEMBER_COMPLETION_FILTERS = ['complete', 'underHalf'] as const;
export type MemberCompletionFilter = (typeof MEMBER_COMPLETION_FILTERS)[number];

export const MEMBER_SORT_FIELDS = ['createdAt', 'firstName', 'memberCode', 'joinedAt'] as const;
export type MemberSortField = (typeof MEMBER_SORT_FIELDS)[number];

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class QueryMembersDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Matches any text on the record, choices by name (gender, status, marital status, education), and department or class names. Multiple words must all match.',
    example: 'Abebe Kebede',
  })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: EducationLevel })
  @IsOptional()
  @IsEnum(EducationLevel)
  educationLevel?: EducationLevel;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ enum: MembershipStatus })
  @IsOptional()
  @IsEnum(MembershipStatus)
  status?: MembershipStatus;

  @ApiPropertyOptional({ description: 'Only members currently in this class grade' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  classGradeId?: number;

  @ApiPropertyOptional({ description: 'Only members serving in this department' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  departmentId?: number;

  @ApiPropertyOptional({ description: 'Only members who registered themselves through the bot' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === true || value === 'true')
  @IsBoolean()
  selfRegistered?: boolean;

  @ApiPropertyOptional({
    description: 'true: only members with a photo; false: only those without',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === true || value === 'true'
      ? true
      : value === false || value === 'false'
        ? false
        : value,
  )
  @IsBoolean()
  hasPhoto?: boolean;

  @ApiPropertyOptional({ description: 'Only members in some level of this class' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  classTypeId?: number;

  @ApiPropertyOptional({ description: 'true: placed in at least one class; false: in none' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === true || value === 'true'
      ? true
      : value === false || value === 'false'
        ? false
        : value,
  )
  @IsBoolean()
  placed?: boolean;

  @ApiPropertyOptional({ description: 'true: serving in at least one department; false: in none' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === true || value === 'true'
      ? true
      : value === false || value === 'false'
        ? false
        : value,
  )
  @IsBoolean()
  inDepartment?: boolean;

  @ApiPropertyOptional({ example: '2026-09-11', description: 'Joined on or after this day' })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(DATE, { message: 'joinedFrom must be YYYY-MM-DD' })
  joinedFrom?: string;

  @ApiPropertyOptional({ example: '2026-10-10', description: 'Joined on or before this day' })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(DATE, { message: 'joinedTo must be YYYY-MM-DD' })
  joinedTo?: string;

  @ApiPropertyOptional({
    enum: MEMBER_COMPLETION_FILTERS,
    description: 'complete: every registration field filled in; underHalf: under 50%',
  })
  @IsOptional()
  @IsIn(MEMBER_COMPLETION_FILTERS)
  completion?: MemberCompletionFilter;

  @ApiPropertyOptional({ enum: MEMBER_SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(MEMBER_SORT_FIELDS)
  sortBy: MemberSortField = 'createdAt';
}
