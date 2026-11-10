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
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../../common/auth/permissions.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator.js';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user.js';
import {
  CandidateQueryDto,
  CreateLatePermissionDto,
  QueryLatePermissionsDto,
  UpdateLatePermissionDto,
} from './late-permission.dto.js';
import { LatePermissionsService, MAX_EVIDENCE_BYTES } from './late-permissions.service.js';

@ApiTags('Attendance · late permissions')
@Controller({ path: 'attendance/late-permissions', version: '1' })
@RequirePermissions(PERMISSIONS.ATTENDANCE_PERMISSIONS)
export class LatePermissionsController {
  constructor(private readonly permissions: LatePermissionsService) {}

  @Get()
  list(@Query() q: QueryLatePermissionsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.permissions.list(q, user.departmentIds);
  }

  /** Departments the user may issue permissions for (their own that run classes). */
  @Get('departments')
  departments(@CurrentUser() user: AuthenticatedUser) {
    return this.permissions.departments(user.departmentIds);
  }

  /** Members of a department's classes and service groups, by name or ID. */
  @Get('candidates')
  candidates(@Query() q: CandidateQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.permissions.candidates(q.departmentId, q.search, user.departmentIds);
  }

  @Post()
  create(@Body() dto: CreateLatePermissionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.permissions.create(dto, user.id, user.departmentIds);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLatePermissionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.permissions.update(id, dto, user.id, user.departmentIds);
  }

  /** Ends the permission today, keeping it on record. */
  @Post(':id/end')
  end(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.permissions.end(id, user.id, user.departmentIds);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.permissions.remove(id, user.id, user.departmentIds);
  }

  @Get(':id/evidence')
  async evidence(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StreamableFile> {
    const { stream, size, mime, name } = await this.permissions.openEvidence(
      id,
      user.departmentIds,
    );
    return new StreamableFile(stream, {
      type: mime,
      length: size,
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
    });
  }

  @Put(':id/evidence')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_EVIDENCE_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  setEvidence(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.permissions.setEvidence(id, file, user.id, user.departmentIds);
  }

  @Delete(':id/evidence')
  removeEvidence(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.permissions.removeEvidence(id, user.id, user.departmentIds);
  }
}
