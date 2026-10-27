import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';
import { Trim, TrimToNull } from '../../../common/transforms/string.transforms.js';
import { CourseDuration } from '../../../generated/prisma/enums.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// ── Courses ────────────────────────────────────────────────────────────────

export class CreateCourseDto {
  @ApiProperty({ example: 'ትምህርተ ሃይማኖት' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nameAm: string;

  @ApiProperty({ example: 'Doctrine of the faith' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nameEn: string;

  @ApiProperty({ enum: CourseDuration, description: 'How long one run of the course lasts' })
  @IsEnum(CourseDuration)
  duration: CourseDuration;

  @ApiProperty({ description: 'The department that runs the course' })
  @IsInt()
  @Min(1)
  departmentId: number;

  @ApiPropertyOptional({ default: 50, description: 'Lowest passing total, out of 100' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  passMark?: number;

  @ApiPropertyOptional()
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;
}

export class UpdateCourseDto extends PartialType(CreateCourseDto) {
  @ApiPropertyOptional({ description: 'Inactive courses cannot get new runs' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class QueryCoursesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Name or code' })
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

  @ApiPropertyOptional({ enum: ['active', 'inactive'] })
  @IsOptional()
  @IsIn(['active', 'inactive'])
  state?: 'active' | 'inactive';
}

// ── Runs (offerings) ───────────────────────────────────────────────────────

export class CreateOfferingDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  courseId: number;

  @ApiProperty({ description: 'The class grade that takes the course' })
  @IsInt()
  @Min(1)
  classGradeId: number;

  @ApiProperty({ example: '2026-09-11' })
  @Matches(DATE)
  startDate: string;

  @ApiPropertyOptional({ description: "Defaults to the start date plus the course's duration" })
  @IsOptional()
  @Matches(DATE)
  endDate?: string;

  @ApiProperty({ type: [Number], description: 'Teacher user ids' })
  @IsArray()
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  teacherIds: number[];

  @ApiPropertyOptional()
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}

export class UpdateOfferingDto extends PartialType(CreateOfferingDto) {}

export class QueryOfferingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  courseId?: number;

  @ApiPropertyOptional({ enum: ['upcoming', 'ongoing', 'finished'] })
  @IsOptional()
  @IsIn(['upcoming', 'ongoing', 'finished'])
  phase?: 'upcoming' | 'ongoing' | 'finished';

  @ApiPropertyOptional({ description: 'Only runs the signed-in user teaches' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === true || value === 'true')
  @IsBoolean()
  mine?: boolean;
}

// ── Assessments and marks ──────────────────────────────────────────────────

export class AssessmentInputDto {
  @ApiPropertyOptional({ description: 'Existing assessment id; omit to add a new one' })
  @IsOptional()
  @IsInt()
  id?: number;

  @ApiProperty({ example: 'Mid exam' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 30 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.5)
  @Max(100)
  maxScore: number;
}

export class SetAssessmentsDto {
  @ApiProperty({ type: [AssessmentInputDto], description: 'The full list, in order' })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AssessmentInputDto)
  assessments: AssessmentInputDto[];
}

export class ScoreInputDto {
  @ApiProperty()
  @IsInt()
  assessmentId: number;

  @ApiProperty()
  @IsInt()
  memberId: number;

  @ApiProperty({ nullable: true, description: 'null clears the mark' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  score: number | null;
}

export class SetScoresDto {
  @ApiProperty({ type: [ScoreInputDto] })
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => ScoreInputDto)
  scores: ScoreInputDto[];
}
