import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SYSTEM_ROLES } from '../../../common/auth/permissions.js';
import { Trim, TrimToNull } from '../../../common/transforms/string.transforms.js';

const ROLE_CODES = SYSTEM_ROLES.map((r) => r.code);

export class CreateUserDto {
  @ApiProperty({ example: 'Hanna Girma' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  fullName: string;

  @ApiProperty({ example: 'hanna@fikureegzi.org' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(191)
  email: string;

  @ApiPropertyOptional({ example: '0911223344' })
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string | null;

  @ApiProperty({
    description: 'Initial password; the user can be given a new one later',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @ApiProperty({ enum: ROLE_CODES })
  @IsIn(ROLE_CODES)
  roleCode: string;

  @ApiPropertyOptional({
    type: [Number],
    description: 'Departments the user works in (required for department-scoped roles)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsInt({ each: true })
  departmentIds?: number[];

  @ApiPropertyOptional({ description: 'Teachers: the member record of the teacher' })
  @IsOptional()
  @IsInt()
  memberId?: number | null;
}

export class UpdateUserDto extends PartialType(OmitType(CreateUserDto, ['password'] as const)) {
  @ApiPropertyOptional({ description: 'Inactive users cannot sign in' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SetPasswordDto {
  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}

export class QueryUsersDto {
  @ApiPropertyOptional()
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
