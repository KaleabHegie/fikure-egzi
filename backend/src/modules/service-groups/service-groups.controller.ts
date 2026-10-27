import {
  Body,
  Controller,
  Delete,
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
import {
  anyOf,
  RequirePermissions,
} from '../../common/decorators/require-permissions.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import {
  AssignMembersDto,
  CandidatesQueryDto,
  CreateGroupDto,
  CreateTermDto,
  DistributeDto,
  UpdateGroupDto,
  UpdateTermDto,
} from './dto/service-groups.dto.js';
import { ServiceGroupsService } from './service-groups.service.js';

/**
 * Reading uses the classes permission; organising needs service_groups.manage
 * (office admins, and department admins for the classes their department runs).
 */
@ApiTags('Service groups')
@Controller({ path: 'service-terms', version: '1' })
export class ServiceTermsController {
  constructor(private readonly groups: ServiceGroupsService) {}

  @Get()
  @RequirePermissions(anyOf(PERMISSIONS.CLASSES_READ, PERMISSIONS.ATTENDANCE_MANAGE))
  list() {
    return this.groups.listTerms();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SERVICE_GROUPS_MANAGE)
  create(@Body() dto: CreateTermDto, @CurrentUser() user: AuthenticatedUser) {
    return this.groups.createTerm(dto, user.id, user.departmentIds);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.SERVICE_GROUPS_MANAGE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTermDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.groups.updateTerm(id, dto, user.id, user.departmentIds);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.SERVICE_GROUPS_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiConflictResponse({ description: 'The term still has groups' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.groups.removeTerm(id, user.id, user.departmentIds);
  }

  @Get(':id/groups')
  @RequirePermissions(anyOf(PERMISSIONS.CLASSES_READ, PERMISSIONS.ATTENDANCE_MANAGE))
  groupsOf(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.groups.listGroups(id, user.departmentIds);
  }

  @Post(':id/groups')
  @RequirePermissions(PERMISSIONS.SERVICE_GROUPS_MANAGE)
  createGroup(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateGroupDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.groups.createGroup(id, dto, user.id, user.departmentIds);
  }

  @Post(':id/distribute')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.SERVICE_GROUPS_MANAGE)
  distribute(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DistributeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.groups.distribute(id, dto, user.id, user.departmentIds);
  }

  @Get(':id/candidates')
  @RequirePermissions(PERMISSIONS.CLASSES_READ, PERMISSIONS.MEMBERS_READ)
  candidates(
    @Param('id', ParseIntPipe) id: number,
    @Query() q: CandidatesQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.groups.candidates(id, q, user.departmentIds);
  }
}

@ApiTags('Service groups')
@Controller({ path: 'service-groups', version: '1' })
export class ServiceGroupsController {
  constructor(private readonly groups: ServiceGroupsService) {}

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.SERVICE_GROUPS_MANAGE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateGroupDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.groups.updateGroup(id, dto, user.id, user.departmentIds);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.SERVICE_GROUPS_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiConflictResponse({ description: 'The group has attendance sessions' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.groups.removeGroup(id, user.id, user.departmentIds);
  }

  @Put(':id/members')
  @RequirePermissions(PERMISSIONS.SERVICE_GROUPS_MANAGE)
  assign(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignMembersDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.groups.assign(id, dto.memberIds, user.id, user.departmentIds);
  }

  @Delete(':id/members/:memberId')
  @RequirePermissions(PERMISSIONS.SERVICE_GROUPS_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  unassign(
    @Param('id', ParseIntPipe) id: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.groups.unassign(id, memberId, user.id, user.departmentIds);
  }
}

@ApiTags('Service groups')
@Controller({ path: 'members/:id/service-groups', version: '1' })
export class MemberServiceGroupsController {
  constructor(private readonly groups: ServiceGroupsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.MEMBERS_READ, PERMISSIONS.CLASSES_READ)
  list(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.groups.forMember(id, user.departmentIds);
  }
}
