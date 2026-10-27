import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiConflictResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/auth/permissions.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import {
  anyOf,
  RequirePermissions,
} from '../../common/decorators/require-permissions.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { DepartmentsService } from './departments.service.js';
import {
  AddDepartmentMemberDto,
  CreateDepartmentDto,
  CreateSubDepartmentDto,
  ReorderDepartmentsDto,
  UpdateDepartmentDto,
  UpdateDepartmentMembershipDto,
} from './dto/department.dto.js';

@ApiTags('Departments')
@Controller({ path: 'departments', version: '1' })
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  // Attendance staff need the list to pick who runs or attends a session.
  @Get()
  @RequirePermissions(anyOf(PERMISSIONS.DEPARTMENTS_READ, PERMISSIONS.ATTENDANCE_MANAGE))
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('includeInactive', new ParseBoolPipe({ optional: true })) includeInactive?: boolean,
  ) {
    return this.departments.list(includeInactive ?? false, user.departmentIds);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.DEPARTMENTS_MANAGE)
  create(@Body() dto: CreateDepartmentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.departments.create(dto, user.id);
  }

  @Post(':id/sub-departments')
  @RequirePermissions(anyOf(PERMISSIONS.DEPARTMENTS_MANAGE, PERMISSIONS.DEPARTMENTS_ROSTER))
  createSubDepartment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateSubDepartmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.departments.createSubDepartment(id, dto, user.id, user.departmentIds);
  }

  // Declared before :id routes.
  @Put('order')
  @RequirePermissions(PERMISSIONS.DEPARTMENTS_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  reorder(@Body() dto: ReorderDepartmentsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.departments.reorder(dto.parentId ?? null, dto.ids, user.id);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.DEPARTMENTS_READ)
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.departments.findOne(id, user.departmentIds);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.DEPARTMENTS_MANAGE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDepartmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.departments.update(id, dto, user.id);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.DEPARTMENTS_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiConflictResponse({ description: 'Has sub-departments or members' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.departments.remove(id, user.id);
  }

  @Get(':id/members')
  @RequirePermissions(PERMISSIONS.DEPARTMENTS_READ, PERMISSIONS.MEMBERS_READ)
  members(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.departments.listMembers(id, user.departmentIds);
  }

  /** Anyone who could be added to this department's roster (any member, matched by name or ID). */
  @Get(':id/candidates')
  @RequirePermissions(PERMISSIONS.DEPARTMENTS_ROSTER)
  @ApiQuery({ name: 'search', required: false })
  candidates(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
  ) {
    return this.departments.candidates(id, search ?? '', user.departmentIds);
  }

  @Get(':id/history')
  @RequirePermissions(PERMISSIONS.DEPARTMENTS_READ, PERMISSIONS.MEMBERS_READ)
  history(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.departments.history(id, user.departmentIds);
  }

  @Post(':id/members')
  @RequirePermissions(PERMISSIONS.DEPARTMENTS_ROSTER)
  @ApiConflictResponse({ description: 'Already serving here, or the head/deputy seat is taken' })
  addMember(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddDepartmentMemberDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.departments.addMember(id, dto, user.id, user.departmentIds);
  }
}

@ApiTags('Departments')
@Controller({ path: 'department-memberships', version: '1' })
export class DepartmentMembershipsController {
  constructor(private readonly departments: DepartmentsService) {}

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.DEPARTMENTS_ROSTER)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDepartmentMembershipDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.departments.updateMembership(id, dto, user.id, user.departmentIds);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.DEPARTMENTS_ROSTER)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.departments.removeMembership(id, user.id, user.departmentIds);
  }
}
