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
import {
  AddCandidatesDto,
  CreateExamDto,
  QueryCandidateSearchDto,
  QueryExamsDto,
  SetExamMarksDto,
  SetExamPartsDto,
  UpdateExamDto,
} from './dto/exam.dto.js';
import { ExamsService } from './exams.service.js';

@ApiTags('Exams')
@Controller({ path: 'exams', version: '1' })
export class ExamsController {
  constructor(private readonly exams: ExamsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.EXAMS_READ)
  list(@Query() q: QueryExamsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.exams.list(q, user);
  }

  // Declared before :id routes.
  @Get('member/:memberId')
  @RequirePermissions(PERMISSIONS.EXAMS_READ, PERMISSIONS.MEMBERS_READ)
  memberExams(
    @Param('memberId', ParseIntPipe) memberId: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.exams.memberExams(memberId, user.departmentIds);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.EXAMS_MANAGE)
  create(@Body() dto: CreateExamDto, @CurrentUser() user: AuthenticatedUser) {
    return this.exams.create(dto, user);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.EXAMS_READ)
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.exams.findOne(id, user);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.EXAMS_MANAGE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExamDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.exams.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.EXAMS_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.exams.remove(id, user);
  }

  @Put(':id/parts')
  @RequirePermissions(PERMISSIONS.EXAMS_MANAGE)
  setParts(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetExamPartsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.exams.setParts(id, dto, user);
  }

  @Get(':id/sheet')
  @RequirePermissions(PERMISSIONS.EXAMS_READ)
  sheet(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.exams.sheet(id, user);
  }

  @Get(':id/candidate-search')
  @RequirePermissions(PERMISSIONS.EXAMS_MANAGE)
  candidateSearch(
    @Param('id', ParseIntPipe) id: number,
    @Query() q: QueryCandidateSearchDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.exams.candidateSearch(id, q.search, user);
  }

  @Post(':id/candidates')
  @RequirePermissions(PERMISSIONS.EXAMS_MANAGE)
  addCandidates(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddCandidatesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.exams.addCandidates(id, dto, user);
  }

  @Delete(':id/candidates/:memberId')
  @RequirePermissions(PERMISSIONS.EXAMS_MANAGE)
  removeCandidate(
    @Param('id', ParseIntPipe) id: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.exams.removeCandidate(id, memberId, user);
  }

  @Put(':id/marks')
  @RequirePermissions(PERMISSIONS.EXAMS_MANAGE)
  setMarks(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetExamMarksDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.exams.setMarks(id, dto, user);
  }
}
