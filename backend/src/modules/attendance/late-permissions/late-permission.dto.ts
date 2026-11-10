import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
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
import { Trim } from '../../../common/transforms/string.transforms.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateLatePermissionDto {
  @ApiProperty({ description: 'The member it is for' })
  @IsInt()
  @Min(1)
  memberId: number;

  @ApiProperty({ description: 'The issuing department: it applies only to the classes it runs' })
  @IsInt()
  @Min(1)
  departmentId: number;

  @ApiProperty({
    description: 'Minutes after the start the member may arrive and count as Present',
  })
  @IsInt()
  @Min(1)
  @Max(240)
  graceMinutes: number;

  @ApiProperty({ type: [Number], description: 'Weekdays it applies on: 0 = Sunday … 6 = Saturday' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekdays: number[];

  @ApiProperty({ example: '2026-09-11', description: 'First day it applies (Gregorian)' })
  @Matches(DATE)
  startsOn: string;

  @ApiProperty({ example: '2027-01-31', description: 'Last day it applies (Gregorian)' })
  @Matches(DATE)
  endsOn: string;

  @ApiProperty({ example: 'Works a Sunday morning shift until 8:30' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

export class UpdateLatePermissionDto extends PartialType(CreateLatePermissionDto) {}

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

  @ApiPropertyOptional({ enum: ['active', 'upcoming', 'ended', 'all'], default: 'all' })
  @IsOptional()
  @IsIn(['active', 'upcoming', 'ended', 'all'])
  state?: 'active' | 'upcoming' | 'ended' | 'all';

  @ApiPropertyOptional({ description: 'Member name or ID' })
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
