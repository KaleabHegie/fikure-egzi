import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Trim, TrimToNull } from '../../../common/transforms/string.transforms.js';

const DATE_MESSAGE = 'heldOn must be a date in YYYY-MM-DD format';

export class QueryExamsDto {
  @ApiPropertyOptional({ description: 'Part of the name' })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;
}

export class ExamPartDto {
  @ApiPropertyOptional({ description: 'Existing part id; omit for a new part' })
  @IsOptional()
  @IsInt()
  @Min(1)
  id?: number;

  @ApiProperty({ example: 'ዜማ', maxLength: 100 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 60, description: 'Weight in %; marks are given out of it' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.5)
  @Max(100)
  weight: number;
}

export class CreateExamDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  departmentId: number;

  @ApiProperty({ example: 'የቅዱስ ዮሐንስ ወረብ መመዘኛ', maxLength: 150 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nameAm: string;

  @ApiPropertyOptional({ example: 'St. John Wereb Assessment', maxLength: 150 })
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  nameEn?: string | null;

  @ApiPropertyOptional({ maxLength: 1000 })
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiPropertyOptional({ example: '2026-11-15', format: 'date' })
  @TrimToNull()
  @IsOptional()
  @IsISO8601({ strict: true }, { message: DATE_MESSAGE })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: DATE_MESSAGE })
  heldOn?: string | null;

  @ApiPropertyOptional({ default: 50, description: 'Lowest total (out of 100) that passes' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  passMark?: number;

  @ApiPropertyOptional({ type: [ExamPartDto], description: 'Parts and weights, in order' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ExamPartDto)
  parts?: ExamPartDto[];
}

export class UpdateExamDto extends PartialType(OmitType(CreateExamDto, ['parts'] as const)) {}

export class SetExamPartsDto {
  @ApiProperty({ type: [ExamPartDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ExamPartDto)
  parts: ExamPartDto[];
}

export class AddCandidatesDto {
  @ApiPropertyOptional({ type: [Number], description: 'Individual members' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  memberIds?: number[];

  @ApiPropertyOptional({ description: 'Everyone now in this class grade (e.g. Mezmur · Geez)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  classGradeId?: number;

  @ApiPropertyOptional({ description: "Everyone on this department's roster" })
  @IsOptional()
  @IsInt()
  @Min(1)
  departmentId?: number;
}

export class QueryCandidateSearchDto {
  @ApiProperty({ description: 'Name, member code or phone' })
  @Trim()
  @IsString()
  @MaxLength(100)
  search: string;
}

export class ExamMarkDto {
  @ApiProperty()
  @IsInt()
  partId: number;

  @ApiProperty()
  @IsInt()
  memberId: number;

  @ApiProperty({ nullable: true, description: 'null clears the mark' })
  @ValidateIf((_, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  score: number | null;
}

export class SetExamMarksDto {
  @ApiProperty({ type: [ExamMarkDto] })
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => ExamMarkDto)
  marks: ExamMarkDto[];
}
