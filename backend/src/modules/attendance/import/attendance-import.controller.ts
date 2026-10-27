import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../../common/auth/permissions.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator.js';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user.js';
import { AttendanceImportService, type Lang } from './attendance-import.service.js';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const fileUpload = () =>
  UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }));
const fileBody = {
  schema: {
    type: 'object',
    required: ['file'],
    properties: { file: { type: 'string', format: 'binary' } },
  },
};
const langOf = (lang?: string): Lang => (lang === 'en' ? 'en' : 'am');

function requireFile(file: Express.Multer.File | undefined): Buffer {
  if (!file || file.size === 0)
    throw new BadRequestException('Attach the filled-in sheet as "file".');
  return file.buffer;
}

const download = (buffer: Buffer, filename: string) =>
  new StreamableFile(buffer, {
    type: XLSX,
    disposition: `attachment; filename="${filename}"`,
    length: buffer.length,
  });

/**
 * Excel for attendance: a session's roster sheet (needs members.read, so not
 * for attendance takers) and a session list for creating many sessions.
 */
@ApiTags('Attendance')
@Controller({ path: 'attendance', version: '1' })
export class AttendanceImportController {
  constructor(private readonly importer: AttendanceImportService) {}

  // ── One session ──

  @Get('sessions/:id/sheet')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_TAKE, PERMISSIONS.MEMBERS_READ)
  @ApiQuery({ name: 'lang', enum: ['am', 'en'], required: false })
  @ApiProduces(XLSX)
  async sheet(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
    @Query('lang') lang?: string,
  ) {
    const buffer = await this.importer.buildSessionSheet(id, langOf(lang), user.departmentIds);
    return download(buffer, `attendance-session-${id}.xlsx`);
  }

  @Post('sessions/:id/sheet/preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.ATTENDANCE_TAKE, PERMISSIONS.MEMBERS_READ)
  @fileUpload()
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody)
  previewSheet(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.importer.previewSessionSheet(id, requireFile(file), user.departmentIds);
  }

  @Put('sessions/:id/sheet')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_TAKE, PERMISSIONS.MEMBERS_READ)
  @fileUpload()
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody)
  importSheet(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.importer.importSessionSheet(
      id,
      requireFile(file),
      user.id,
      user.departmentIds,
      user.permissions.includes(PERMISSIONS.ATTENDANCE_ANY_DAY),
    );
  }

  // ── Session list (many sessions at once, like the New session form) ──

  @Get('import/template')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_MANAGE, PERMISSIONS.ATTENDANCE_ANY_DAY)
  @ApiQuery({ name: 'lang', enum: ['am', 'en'], required: false })
  @ApiProduces(XLSX)
  async template(@CurrentUser() user: AuthenticatedUser, @Query('lang') lang?: string) {
    const buffer = await this.importer.buildImportTemplate(langOf(lang), user.departmentIds);
    return download(buffer, 'fikure-egzi-attendance-template.xlsx');
  }

  @Post('import/preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.ATTENDANCE_MANAGE, PERMISSIONS.ATTENDANCE_ANY_DAY)
  @fileUpload()
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody)
  @ApiQuery({
    name: 'lang',
    enum: ['am', 'en'],
    required: false,
    description: 'Language for default titles',
  })
  preview(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Query('lang') lang?: string,
  ) {
    return this.importer.previewImport(requireFile(file), langOf(lang), user.departmentIds);
  }

  @Post('import')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_MANAGE, PERMISSIONS.ATTENDANCE_ANY_DAY)
  @fileUpload()
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody)
  @ApiQuery({
    name: 'lang',
    enum: ['am', 'en'],
    required: false,
    description: 'Language for default titles',
  })
  commit(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Query('lang') lang?: string,
  ) {
    return this.importer.commitImport(requireFile(file), langOf(lang), user.id, user.departmentIds);
  }
}
