import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { LowerCase, Trim } from '../../../common/transforms/string.transforms.js';

export class LoginDto {
  @ApiProperty({ example: 'admin@fikureegzi.local' })
  @Trim()
  @LowerCase()
  @IsEmail()
  @MaxLength(191)
  email: string;

  @ApiProperty({ example: 'ChangeMe!2026' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}
