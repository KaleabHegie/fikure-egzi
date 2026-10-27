import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiConflictResponse, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/auth/permissions.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { CreateUserDto, QueryUsersDto, SetPasswordDto, UpdateUserDto } from './dto/users.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('Users')
@Controller({ path: 'users', version: '1' })
@RequirePermissions(PERMISSIONS.USERS_MANAGE)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Query() q: QueryUsersDto, @CurrentUser() user: AuthenticatedUser) {
    return this.users.list(q, user);
  }

  @Get('roles')
  roles(@CurrentUser() user: AuthenticatedUser) {
    return this.users.roles(user);
  }

  @Get('member-candidates')
  memberCandidates(@Query() q: QueryUsersDto) {
    return this.users.memberCandidates(q.search ?? '');
  }

  @Post()
  @ApiConflictResponse({ description: 'Email already in use' })
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthenticatedUser) {
    return this.users.create(dto, user);
  }

  @Patch(':id')
  @ApiConflictResponse({ description: 'Email in use, or the last office administrator' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.users.update(id, dto, user);
  }

  @Put(':id/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  setPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetPasswordDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.users.setPassword(id, dto.password, user);
  }
}
