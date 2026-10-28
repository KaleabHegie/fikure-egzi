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
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/auth/permissions.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { CoursesService } from './courses.service.js';
import {
  CreateCourseDto,
  CreateOfferingDto,
  QueryCoursesDto,
  QueryOfferingsDto,
  SetAssessmentsDto,
  SetScoresDto,
  UpdateCourseDto,
  UpdateOfferingDto,
} from './dto/course.dto.js';

@ApiTags('Courses')
@Controller({ path: 'courses', version: '1' })
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.COURSES_READ)
  list(@Query() q: QueryCoursesDto, @CurrentUser() user: AuthenticatedUser) {
    return this.courses.listCourses(q, user);
  }

  @Get('teachers')
  @RequirePermissions(PERMISSIONS.COURSES_MANAGE)
  teachers(@CurrentUser() user: AuthenticatedUser) {
    return this.courses.teachers(user);
  }

  @Get('member/:memberId')
  @RequirePermissions(PERMISSIONS.MEMBERS_READ)
  memberResults(@Param('memberId', ParseIntPipe) memberId: number) {
    return this.courses.memberCourses(memberId);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.COURSES_READ)
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.courses.findCourse(id, user);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.COURSES_MANAGE)
  create(@Body() dto: CreateCourseDto, @CurrentUser() user: AuthenticatedUser) {
    return this.courses.createCourse(dto, user);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.COURSES_MANAGE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCourseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.courses.updateCourse(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.COURSES_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.courses.removeCourse(id, user);
  }
}

@ApiTags('Courses')
@Controller({ path: 'course-runs', version: '1' })
export class CourseRunsController {
  constructor(private readonly courses: CoursesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.COURSES_READ)
  list(@Query() q: QueryOfferingsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.courses.listOfferings(q, user);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.COURSES_READ)
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.courses.findOffering(id, user);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.COURSES_MANAGE)
  create(@Body() dto: CreateOfferingDto, @CurrentUser() user: AuthenticatedUser) {
    return this.courses.createOffering(dto, user);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.COURSES_MANAGE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOfferingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.courses.updateOffering(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.COURSES_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.courses.removeOffering(id, user);
  }

  @Put(':id/assessments')
  @RequirePermissions(PERMISSIONS.COURSES_TEACH)
  setAssessments(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetAssessmentsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.courses.setAssessments(id, dto, user);
  }

  @Get(':id/marks')
  @RequirePermissions(PERMISSIONS.COURSES_READ)
  gradebook(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.courses.gradebook(id, user);
  }

  @Put(':id/marks')
  @RequirePermissions(PERMISSIONS.COURSES_TEACH)
  setScores(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetScoresDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.courses.setScores(id, dto, user);
  }
}
