import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator.js';
import { ReqMeta, type RequestMeta } from '../../common/decorators/request-meta.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { AuthService } from './auth.service.js';
import { AuthTokensDto, AuthUserDto } from './dto/auth-response.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';

@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @RateLimit({ limit: 10, windowMs: 60_000 })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthTokensDto })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  login(@Body() dto: LoginDto, @ReqMeta() meta: RequestMeta): Promise<AuthTokensDto> {
    return this.auth.login(dto.email, dto.password, meta);
  }

  @Public()
  @RateLimit({ limit: 30, windowMs: 60_000 })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthTokensDto })
  refresh(@Body() dto: RefreshTokenDto, @ReqMeta() meta: RequestMeta): Promise<AuthTokensDto> {
    return this.auth.refresh(dto.refreshToken, meta);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(
    @Body() dto: RefreshTokenDto,
    @CurrentUser() user: AuthenticatedUser,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    return this.auth.logout(dto.refreshToken, user, meta);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOkResponse({ type: AuthUserDto })
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
