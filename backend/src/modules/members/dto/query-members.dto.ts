import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';
import { Trim } from '../../../common/transforms/string.transforms.js';
import { EducationLevel, Gender, MembershipStatus } from '../../../generated/prisma/enums.js';

export const MEMBER_SORT_FIELDS = ['createdAt', 'firstName', 'memberCode', 'joinedAt'] as const;
export type MemberSortField = (typeof MEMBER_SORT_FIELDS)[number];

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

  @ApiPropertyOptional({ enum: MEMBER_SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(MEMBER_SORT_FIELDS)
  sortBy: MemberSortField = 'createdAt';
}
