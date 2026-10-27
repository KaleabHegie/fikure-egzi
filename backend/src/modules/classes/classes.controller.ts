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
import { ClassesService } from './classes.service.js';
import {
  CreateClassGradeDto,
  CreateClassTypeDto,
  ReorderDto,
  UpdateClassGradeDto,
  UpdateClassTypeDto,
} from './dto/class-type.dto.js';

@ApiTags('Classes')
@Controller({ path: 'class-types', version: '1' })
export class ClassTypesController {
  constructor(private readonly classes: ClassesService) {}

  // Attendance staff need the class list to set up class sessions.
  @Get()
  @RequirePermissions(anyOf(PERMISSIONS.CLASSES_READ, PERMISSIONS.ATTENDANCE_MANAGE))
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('includeInactive', new ParseBoolPipe({ optional: true })) includeInactive?: boolean,
  ) {
    return this.classes.list(includeInactive ?? false, user.departmentIds);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CLASSES_MANAGE)
  create(@Body() dto: CreateClassTypeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.classes.createType(dto, user.id, user.departmentIds);
  }

  // Declared before :id routes.
  @Put('order')
  @RequirePermissions(PERMISSIONS.CLASSES_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  reorder(@Body() dto: ReorderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.classes.reorderTypes(dto.ids, user.id, user.departmentIds);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CLASSES_MANAGE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateClassTypeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.classes.updateType(id, dto, user.id, user.departmentIds);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CLASSES_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiConflictResponse({ description: 'Type still has grades or members' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.classes.removeType(id, user.id, user.departmentIds);
  }

  @Post(':id/grades')
  @RequirePermissions(PERMISSIONS.CLASSES_MANAGE)
  createGrade(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateClassGradeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.classes.createGrade(id, dto, user.id, user.departmentIds);
  }

  @Put(':id/grades/order')
  @RequirePermissions(PERMISSIONS.CLASSES_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  reorderGrades(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReorderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.classes.reorderGrades(id, dto.ids, user.id, user.departmentIds);
  }
}

@ApiTags('Classes')
@Controller({ path: 'class-grades', version: '1' })
export class ClassGradesController {
  constructor(private readonly classes: ClassesService) {}

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CLASSES_MANAGE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateClassGradeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.classes.updateGrade(id, dto, user.id, user.departmentIds);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CLASSES_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiConflictResponse({ description: 'Grade still has members' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.classes.removeGrade(id, user.id, user.departmentIds);
  }
}
