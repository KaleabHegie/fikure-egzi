import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
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
import { DepartmentRole } from '../../../generated/prisma/enums.js';

export class CreateDepartmentDto {
  @ApiProperty({ example: 'EDUCATION', description: 'Stable code, unique' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]*$/, {
    message: 'code must be UPPERCASE letters, digits or _ (e.g. EDUCATION)',
  })
  @MaxLength(40)
  code: string;

  @ApiProperty({ example: 'Education' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nameEn: string;

  @ApiProperty({ example: 'ትምህርት ክፍል' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nameAm: string;

  @ApiPropertyOptional()
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  descriptionEn?: string | null;

  @ApiPropertyOptional()
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  descriptionAm?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Administering department (e.g. ፅህፈት ቤት). null = top level.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  parentId?: number | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** The code is a stable identifier and cannot change after creation. */
export class UpdateDepartmentDto extends PartialType(
  OmitType(CreateDepartmentDto, ['code'] as const),
) {}

/** A department head creates a child and appoints one of their roster as its first head. */
export class CreateSubDepartmentDto extends OmitType(CreateDepartmentDto, ['parentId'] as const) {
  @ApiProperty({ description: 'A current member of the parent department who will lead the new sub-department' })
  @IsInt()
  @Min(1)
  headMemberId: number;
}

export class ReorderDepartmentsDto {
  @ApiPropertyOptional({ nullable: true, description: 'Parent whose children are reordered' })
  @IsOptional()
  @IsInt()
  parentId?: number | null;

  @ApiProperty({ type: [Number], description: 'Every child id of that parent, in the new order' })
  @IsInt({ each: true })
  ids: number[];
}

export class AddDepartmentMemberDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  memberId: number;

  @ApiPropertyOptional({ enum: DepartmentRole, default: DepartmentRole.MEMBER })
  @IsOptional()
  @IsEnum(DepartmentRole)
  role?: DepartmentRole;

  @ApiPropertyOptional({ format: 'date', description: 'Defaults to today' })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'joinedAt must be YYYY-MM-DD' })
  joinedAt?: string;
}

export class UpdateDepartmentMembershipDto {
  @ApiPropertyOptional({ enum: DepartmentRole })
  @IsOptional()
  @IsEnum(DepartmentRole)
  role?: DepartmentRole;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'joinedAt must be YYYY-MM-DD' })
  joinedAt?: string;
}
