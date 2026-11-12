import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Trim, TrimLines, TrimToNull } from '../../../common/transforms/string.transforms.js';

const CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const CODE_MESSAGE = 'code must be UPPERCASE letters, digits or _ (e.g. MEZMUR)';
const upper = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  );

export class CreateClassTypeDto {
  @ApiProperty({ example: 'MEZMUR', description: 'Stable code, unique' })
  @upper()
  @IsString()
  @Matches(CODE_PATTERN, { message: CODE_MESSAGE })
  @MaxLength(40)
  code: string;

  @ApiProperty({ example: 'Mezmur Class' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nameEn: string;

  @ApiProperty({ example: 'የመዝሙር ክፍል' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nameAm: string;

  @ApiPropertyOptional()
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  descriptionEn?: string | null;

  @ApiPropertyOptional()
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  descriptionAm?: string | null;

  @ApiPropertyOptional({ description: 'Display order (ascending). Defaults to last.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({
    description:
      "Department that runs this class (required); its admins and attendance takers handle the class's attendance",
  })
  @IsInt()
  @Min(1)
  departmentId: number;
}

export class UpdateClassTypeDto extends PartialType(CreateClassTypeDto) {}

export class CreateClassGradeDto {
  @ApiProperty({ example: 'GEEZ', description: 'Unique within its class type' })
  @upper()
  @IsString()
  @Matches(CODE_PATTERN, { message: CODE_MESSAGE })
  @MaxLength(40)
  code: string;

  @ApiProperty({ example: "Ge'ez" })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nameEn: string;

  @ApiProperty({ example: 'ግዕዝ' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nameAm: string;

  @ApiPropertyOptional({ example: 'ሐ', description: 'Compact badge label' })
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(10)
  shortLabel?: string | null;

  @ApiPropertyOptional({ description: 'Display order (ascending). Defaults to last.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateClassGradeDto extends PartialType(CreateClassGradeDto) {}

export class ReorderDto {
  @ApiProperty({ type: [Number], description: 'Every id, in the new display order' })
  @IsInt({ each: true })
  ids: number[];
}

/** A class's agreement (e.g. the Mezmur class's code of conduct). Rules: one per line. */
export class ClassAgreementDto {
  @ApiProperty({ example: 'የዲሲፕሊን እና የሥነ-ምግባር ስምምነት', maxLength: 200 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  titleAm: string;

  @ApiProperty({ example: 'Discipline and Code of Conduct Agreement', maxLength: 200 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  titleEn: string;

  @ApiProperty({ description: 'One rule per line', maxLength: 5000 })
  @TrimLines()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  rulesAm: string;

  @ApiProperty({ description: 'One rule per line', maxLength: 5000 })
  @TrimLines()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  rulesEn: string;

  @ApiPropertyOptional({ description: 'Closing statement the member makes', maxLength: 2000 })
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  pledgeAm?: string | null;

  @ApiPropertyOptional({ description: 'Closing statement the member makes', maxLength: 2000 })
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  pledgeEn?: string | null;
}
