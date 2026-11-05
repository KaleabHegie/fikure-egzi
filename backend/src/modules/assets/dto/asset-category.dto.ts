import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../../common/transforms/string.transforms.js';

export class CreateAssetCategoryDto {
  @ApiProperty({ example: 'Sound equipment' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nameEn: string;

  @ApiProperty({ example: 'የድምፅ መሣሪያ' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nameAm: string;
}

export class UpdateAssetCategoryDto extends PartialType(CreateAssetCategoryDto) {}
