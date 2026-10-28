import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { LowerCase, Trim, TrimToNull } from '../../../common/transforms/string.transforms.js';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Hanna Girma' })
  @Trim()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  fullName?: string;

  @ApiPropertyOptional({ description: 'Changing it requires currentPassword' })
  @Trim()
  @LowerCase()
  @IsOptional()
  @IsEmail()
  @MaxLength(191)
  email?: string;

  @ApiPropertyOptional({ example: '0911223344' })
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string | null;

  @ApiPropertyOptional({ description: 'Required when changing the email' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  currentPassword?: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword: string;

  @ApiPropertyOptional({ description: "This device's refresh token, kept signed in" })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  refreshToken?: string;
}
