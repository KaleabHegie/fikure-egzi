import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator.js';
import { ReqMeta, type RequestMeta } from '../../common/decorators/request-meta.decorator.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator.js';
import { MemberPortalGuard, type PortalRequest } from './member-portal.guard.js';
import { MemberPortalService } from './member-portal.service.js';

class PortalLoginDto {
  @ApiProperty({ example: 'FE-00042', description: 'Member ID, typed or read from the QR code' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  code: string;

  @ApiProperty({ example: '0911223344', description: 'The phone number on the member record' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone: string;
}

const valid = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined);

/** A member's own page. Not part of staff sign-in: these routes use member tokens only. */
@ApiTags('Member portal')
@Controller({ path: 'portal', version: '1' })
@Public()
export class MemberPortalController {
  constructor(private readonly portal: MemberPortalService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  // Strict: an ID + phone guess shouldn't be repeatable.
  @RateLimit({ limit: 8, windowMs: 10 * 60_000 })
  login(@Body() dto: PortalLoginDto, @ReqMeta() meta: RequestMeta) {
    return this.portal.login(dto.code, dto.phone, meta.ipAddress);
  }

  @Get('me')
  @UseGuards(MemberPortalGuard)
  @ApiBearerAuth()
  me(@Req() req: PortalRequest) {
    return this.portal.me(req.portalMemberId!);
  }

  @Get('me/attendance')
  @UseGuards(MemberPortalGuard)
  @ApiBearerAuth()
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  attendance(@Req() req: PortalRequest, @Query('from') from?: string, @Query('to') to?: string) {
    return this.portal.attendance(req.portalMemberId!, valid(from), valid(to));
  }

  @Get('me/photo')
  @UseGuards(MemberPortalGuard)
  @ApiBearerAuth()
  async photo(@Req() req: PortalRequest): Promise<StreamableFile> {
    const { stream, size, mime } = await this.portal.photo(req.portalMemberId!);
    return new StreamableFile(stream, { type: mime, length: size, disposition: 'inline' });
  }
}
