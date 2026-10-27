import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
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
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';
import { Trim, TrimToNull } from '../../../common/transforms/string.transforms.js';
import {
  AssetAcquisition,
  AssetCategory,
  AssetCondition,
  AssetStatus,
} from '../../../generated/prisma/enums.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateAssetDto {
  @ApiProperty({ example: 'Kebero (drum)' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiProperty({ enum: AssetCategory })
  @IsEnum(AssetCategory)
  category: AssetCategory;

  @ApiProperty({ description: 'The department responsible for the asset' })
  @IsInt()
  @Min(1)
  departmentId: number;

  @ApiPropertyOptional()
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000)
  quantity?: number;

  @ApiPropertyOptional({ enum: AssetCondition, default: AssetCondition.GOOD })
  @IsOptional()
  @IsEnum(AssetCondition)
  condition?: AssetCondition;

  @ApiPropertyOptional({ enum: AssetStatus, default: AssetStatus.IN_USE })
  @IsOptional()
  @IsEnum(AssetStatus)
  status?: AssetStatus;

  @ApiPropertyOptional({ example: 'Mezmur room' })
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  location?: string | null;

  @ApiPropertyOptional()
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  serialNumber?: string | null;

  @ApiPropertyOptional({ enum: AssetAcquisition })
  @IsOptional()
  @IsEnum(AssetAcquisition)
  acquisition?: AssetAcquisition | null;

  @ApiPropertyOptional({ format: 'date', description: 'Gregorian; the web app picks it in E.C.' })
  @TrimToNull()
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(DATE, { message: 'acquiredOn must be YYYY-MM-DD' })
  acquiredOn?: string | null;

  @ApiPropertyOptional({ example: 2500, description: 'Price or estimated value in birr' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9_999_999_999)
  cost?: number | null;

  @ApiPropertyOptional()
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  donorName?: string | null;

  @ApiPropertyOptional()
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class UpdateAssetDto extends PartialType(CreateAssetDto) {}

export class QueryAssetsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Name, code, serial number or location' })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: AssetCategory })
  @IsOptional()
  @IsEnum(AssetCategory)
  category?: AssetCategory;

  @ApiPropertyOptional({ enum: AssetStatus })
  @IsOptional()
  @IsEnum(AssetStatus)
  status?: AssetStatus;

  @ApiPropertyOptional({ enum: AssetCondition })
  @IsOptional()
  @IsEnum(AssetCondition)
  condition?: AssetCondition;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;
}
