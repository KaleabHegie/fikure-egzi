import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateSettingsDto {
  @ApiPropertyOptional({
    description: 'Let people who are not yet members register themselves through the Telegram bot',
  })
  @IsOptional()
  @IsBoolean()
  selfRegistration?: boolean;
}
