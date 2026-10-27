import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';
import { Trim } from '../../../common/transforms/string.transforms.js';
import { Gender, MembershipStatus } from '../../../generated/prisma/enums.js';

export const MEMBER_SORT_FIELDS = ['createdAt', 'firstName', 'memberCode', 'joinedAt'] as const;
export type MemberSortField = (typeof MEMBER_SORT_FIELDS)[number];

export class QueryMembersDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Matches name parts, Christian name, member code or phone. Multiple words must all match.',
    example: 'Abebe Kebede',
  })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

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

  @ApiPropertyOptional({ enum: MEMBER_SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(MEMBER_SORT_FIELDS)
  sortBy: MemberSortField = 'createdAt';
}
