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
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/auth/permissions.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { AttendanceService } from './attendance.service.js';
import {
  CreateSessionDto,
  MarkDto,
  QuerySessionsDto,
  ReportQueryDto,
  TopAttendanceQueryDto,
  ScanDto,
  UpdateSessionDto,
} from './dto/attendance.dto.js';

/** Whether the user may work on sessions of days other than today. */
const anyDay = (user: AuthenticatedUser) =>
  user.permissions.includes(PERMISSIONS.ATTENDANCE_ANY_DAY);

@ApiTags('Attendance')
@Controller({ path: 'attendance', version: '1' })
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('sessions')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_READ)
  list(@Query() query: QuerySessionsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.attendance.list(query, user.departmentIds);
  }

  @Post('sessions')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_MANAGE)
  create(@Body() dto: CreateSessionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.attendance.create(dto, user.id, user.departmentIds, anyDay(user));
  }

  @Get('sessions/:id')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_READ)
  @ApiNotFoundResponse()
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.attendance.findOne(id, user.departmentIds);
  }

  @Patch('sessions/:id')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_MANAGE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attendance.update(id, dto, user.id, user.departmentIds, anyDay(user));
  }

  @Delete('sessions/:id')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.attendance.remove(id, user.id, user.departmentIds, anyDay(user));
  }

  @Post('sessions/:id/close')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.ATTENDANCE_MANAGE)
  @ApiOkResponse({ description: 'Closed; unmarked roster members recorded as Absent' })
  close(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.attendance.close(id, user.id, user.departmentIds, anyDay(user));
  }

  @Post('sessions/:id/reopen')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.ATTENDANCE_MANAGE)
  reopen(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.attendance.reopen(id, user.id, user.departmentIds, anyDay(user));
  }

  // The roster is a member list: attendance takers (scanners) don't get it.
  @Get('sessions/:id/roster')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_READ, PERMISSIONS.MEMBERS_READ)
  roster(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.attendance.roster(id, user.departmentIds);
  }

  @Post('sessions/:id/scan')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.ATTENDANCE_TAKE)
  @ApiNotFoundResponse({ description: 'No member with that ID' })
  @ApiConflictResponse({ description: 'Session is closed' })
  scan(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ScanDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attendance.scan(id, dto.code, user.id, user.departmentIds, anyDay(user));
  }

  // Marking from the roster needs the roster; scanners record by scanning.
  @Put('sessions/:id/records/:memberId')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_TAKE, PERMISSIONS.MEMBERS_READ)
  mark(
    @Param('id', ParseIntPipe) id: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body() dto: MarkDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attendance.mark(id, memberId, dto, user.id, user.departmentIds, anyDay(user));
  }

  @Delete('sessions/:id/records/:memberId')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_TAKE, PERMISSIONS.MEMBERS_READ)
  @HttpCode(HttpStatus.NO_CONTENT)
  unmark(
    @Param('id', ParseIntPipe) id: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attendance.unmark(id, memberId, user.departmentIds, anyDay(user));
  }

  @Get('reports/top-attendance')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_READ, PERMISSIONS.MEMBERS_READ)
  topAttendance(@Query() query: TopAttendanceQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.attendance.topAttendance(query, user.departmentIds);
  }

  @Get('reports/low-attendance')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_READ, PERMISSIONS.MEMBERS_READ)
  lowAttendance(@Query() query: ReportQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.attendance.lowAttendance(query, user.departmentIds);
  }
}

@ApiTags('Attendance')
@Controller({ path: 'members', version: '1' })
export class MemberAttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get(':id/attendance')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_READ, PERMISSIONS.MEMBERS_READ)
  @ApiQuery({ name: 'from', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'to', required: false, description: 'YYYY-MM-DD' })
  @ApiOkResponse({ description: 'Counts, rate, total minutes attended and recent sessions' })
  summary(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const valid = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined);
    return this.attendance.memberSummary(id, user.departmentIds, valid(from), valid(to));
  }
}
