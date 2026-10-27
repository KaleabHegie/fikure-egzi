import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiProduces,
  ApiQuery,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { PERMISSIONS } from '../../../common/auth/permissions.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { ReqMeta, type RequestMeta } from '../../../common/decorators/request-meta.decorator.js';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator.js';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user.js';
import { MemberImportService } from './member-import.service.js';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
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
  if (!file || file.size === 0)
    throw new BadRequestException('Attach the filled-in template as "file".');
  return file.buffer;
}

@ApiTags('Members')
@Controller({ path: 'members/import', version: '1' })
export class MemberImportController {
  constructor(private readonly importer: MemberImportService) {}

  @Get('template')
  @RequirePermissions(PERMISSIONS.MEMBERS_CREATE)
  @ApiQuery({ name: 'lang', enum: ['am', 'en'], required: false })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @ApiOkResponse({
    description: 'Excel template with dropdowns for the current classes and departments',
  })
  async template(@Query('lang') lang?: string): Promise<StreamableFile> {
    const buffer = await this.importer.buildTemplate(lang === 'en' ? 'en' : 'am');
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="fikure-egzi-members-template.xlsx"',
      length: buffer.length,
    });
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.MEMBERS_CREATE)
  @fileUpload()
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody)
  @ApiOkResponse({ description: 'Row-by-row check; nothing is saved' })
  preview(@UploadedFile() file: Express.Multer.File | undefined) {
    return this.importer.preview(requireFile(file));
  }

  @Post()
  @RequirePermissions(PERMISSIONS.MEMBERS_CREATE)
  @fileUpload()
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody)
  @ApiUnprocessableEntityResponse({ description: 'Some rows are invalid; nothing was imported' })
  commit(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.importer.commit(requireFile(file), user.id, meta.ipAddress);
  }
}
