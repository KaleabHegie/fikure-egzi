import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { Trim, TrimToNull } from '../../../common/transforms/string.transforms.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateTermDto {
  @ApiProperty({ example: '2019 E.C.' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nameEn: string;

  @ApiProperty({ example: '2019 ዓ.ም' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nameAm: string;

  @ApiProperty({ example: '2026-09-11', description: 'Gregorian; the web app picks it in E.C.' })
  @IsISO8601({ strict: true })
  @Matches(DATE, { message: 'startsOn must be YYYY-MM-DD' })
  startsOn: string;

  @ApiProperty({ example: '2027-09-10' })
  @IsISO8601({ strict: true })
  @Matches(DATE, { message: 'endsOn must be YYYY-MM-DD' })
  endsOn: string;

  @ApiPropertyOptional({ default: true, description: 'Make this the current term' })
  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;

  @ApiPropertyOptional({ description: 'Copy the groups (names, class) of this term' })
  @IsOptional()
  @IsInt()
  @Min(1)
  copyFromTermId?: number;

  @ApiPropertyOptional({ default: false, description: "Also copy each group's members" })
  @IsOptional()
  @IsBoolean()
  copyMembers?: boolean;
}

export class UpdateTermDto extends PartialType(CreateTermDto) {}

export class CreateGroupDto {
  @ApiProperty({ example: 'Group 1' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nameEn: string;

  @ApiProperty({ example: 'ምድብ 1' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nameAm: string;

  @ApiPropertyOptional({
    description: 'Class grade the members mostly come from (e.g. Mezmur · Araray)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  classGradeId?: number | null;

  @ApiPropertyOptional()
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class UpdateGroupDto extends PartialType(CreateGroupDto) {}

export class AssignMembersDto {
  @ApiProperty({ type: [Number] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @IsInt({ each: true })
  memberIds: number[];
}

export class DistributeDto {
  @ApiProperty({ description: 'Members of this class grade are spread across the groups' })
  @IsInt()
  @Min(1)
  classGradeId: number;

  @ApiProperty({ type: [Number], description: 'Groups to fill (in this term)' })
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  groupIds: number[];

  @ApiPropertyOptional({
    default: true,
    description: 'Leave members who already have a group where they are',
  })
  @IsOptional()
  @IsBoolean()
  onlyUnassigned?: boolean;
}

export class CandidatesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  classGradeId?: number;

  @ApiPropertyOptional()
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
