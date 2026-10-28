import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator.js';
import { ReqMeta, type RequestMeta } from '../../common/decorators/request-meta.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { AuthService } from './auth.service.js';
import { AuthTokensDto, AuthUserDto } from './dto/auth-response.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { ChangePasswordDto, UpdateProfileDto } from './dto/profile.dto.js';
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

  /** Own account details (profile page). Any signed-in user. */
  @ApiBearerAuth()
  @Get('profile')
  profile(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.profile(user.id);
  }

  @ApiBearerAuth()
  @RateLimit({ limit: 10, windowMs: 60_000 })
  @Patch('profile')
  updateProfile(
    @Body() dto: UpdateProfileDto,
    @CurrentUser() user: AuthenticatedUser,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.auth.updateProfile(user.id, dto, meta);
  }

  @ApiBearerAuth()
  // Strict: guessing the current password shouldn't be repeatable.
  @RateLimit({ limit: 5, windowMs: 10 * 60_000 })
  @Put('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: AuthenticatedUser,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    return this.auth.changePassword(user.id, dto, meta);
  }
}
