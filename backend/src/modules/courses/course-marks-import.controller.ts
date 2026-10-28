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
import { PERMISSIONS } from '../../common/auth/permissions.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { CourseMarksImportService } from './course-marks-import.service.js';

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

function requireFile(file: Express.Multer.File | undefined): Buffer {
  if (!file || file.size === 0) {
    throw new BadRequestException('Attach the filled-in sheet as "file".');
  }
  return file.buffer;
}

/** A run's mark sheet in Excel: download, check, save. For the run's teachers and course managers. */
@ApiTags('Courses')
@Controller({ path: 'course-runs', version: '1' })
@RequirePermissions(PERMISSIONS.COURSES_TEACH)
export class CourseMarksImportController {
  constructor(private readonly importer: CourseMarksImportService) {}

  @Get(':id/marks/sheet')
  @ApiQuery({ name: 'lang', enum: ['am', 'en'], required: false })
  @ApiProduces(XLSX)
  async sheet(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
    @Query('lang') lang?: string,
  ) {
    const buffer = await this.importer.buildSheet(id, lang === 'en' ? 'en' : 'am', user);
    return new StreamableFile(buffer, {
      type: XLSX,
      disposition: `attachment; filename="course-run-${id}-marks.xlsx"`,
      length: buffer.length,
    });
  }

  @Post(':id/marks/sheet/preview')
  @HttpCode(HttpStatus.OK)
  @fileUpload()
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody)
  preview(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.importer.preview(id, requireFile(file), user);
  }

  @Put(':id/marks/sheet')
  @fileUpload()
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody)
  commit(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.importer.commit(id, requireFile(file), user);
  }
}
