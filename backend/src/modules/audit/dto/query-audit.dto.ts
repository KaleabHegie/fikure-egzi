import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class QueryAuditDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Only actions by this user' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;

  @ApiPropertyOptional({ example: 'Member' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  entity?: string;

  @ApiPropertyOptional({ enum: ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT'] })
  @IsOptional()
  @IsIn(['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT'])
  action?: string;

  @ApiPropertyOptional({ format: 'date', description: 'From this day (Addis Ababa)' })
  @IsOptional()
  @Matches(DATE, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ format: 'date', description: 'Up to and including this day' })
  @IsOptional()
  @Matches(DATE, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}
