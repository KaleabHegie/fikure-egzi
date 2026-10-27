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
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/auth/permissions.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ReqMeta, type RequestMeta } from '../../common/decorators/request-meta.decorator.js';
import {
  anyOf,
  RequirePermissions,
} from '../../common/decorators/require-permissions.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { CreateMemberDto } from './dto/create-member.dto.js';
import {
  MemberEnvelopeDto,
  MemberListEnvelopeDto,
  MemberStatsEnvelopeDto,
} from './dto/member-response.dto.js';
import { QueryMembersDto } from './dto/query-members.dto.js';
import { UpdateMemberDto } from './dto/update-member.dto.js';
import { MAX_PHOTO_BYTES, MembersService } from './members.service.js';

@ApiTags('Members')
@Controller({ path: 'members', version: '1' })
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.MEMBERS_READ)
  @ApiOkResponse({ type: MemberListEnvelopeDto })
  findAll(@Query() query: QueryMembersDto, @CurrentUser() user: AuthenticatedUser) {
    return this.members.findAll(query, user.departmentIds);
  }

  // Declared before :id so "stats" is not parsed as an id.
  @Get('stats')
  @RequirePermissions(PERMISSIONS.MEMBERS_READ)
  @ApiOkResponse({ type: MemberStatsEnvelopeDto })
  stats(@CurrentUser() user: AuthenticatedUser) {
    return this.members.stats(user.departmentIds);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.MEMBERS_READ)
  @ApiOkResponse({ type: MemberEnvelopeDto })
  @ApiNotFoundResponse()
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.members.findOne(id, user.departmentIds);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.MEMBERS_CREATE)
  @ApiCreatedResponse({ type: MemberEnvelopeDto })
  @ApiUnprocessableEntityResponse({
    description: 'Validation failed — see `details`',
  })
  create(
    @Body() dto: CreateMemberDto,
    @CurrentUser() user: AuthenticatedUser,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.members.create(dto, user.id, meta.ipAddress);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.MEMBERS_UPDATE)
  @ApiOkResponse({ type: MemberEnvelopeDto })
  @ApiNotFoundResponse()
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMemberDto,
    @CurrentUser() user: AuthenticatedUser,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.members.update(id, dto, user.id, meta.ipAddress);
  }

  @Get(':id/history')
  @RequirePermissions(PERMISSIONS.MEMBERS_READ)
  @ApiOkResponse({ description: 'Class placements and department service periods, newest first' })
  @ApiNotFoundResponse()
  history(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.members.history(id, user.departmentIds);
  }

  // Attendance staff see photos on the roster (still limited to their own members).
  @Get(':id/photo')
  @RequirePermissions(anyOf(PERMISSIONS.MEMBERS_READ, PERMISSIONS.ATTENDANCE_READ))
  @ApiProduces('image/jpeg', 'image/png', 'image/webp')
  @ApiOkResponse({ description: 'The photo bytes' })
  @ApiNotFoundResponse({ description: 'Member or photo not found' })
  async photo(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StreamableFile> {
    const { stream, size, mime } = await this.members.openPhoto(id, user.departmentIds);
    // Private: these can be children's photos. URLs carry a version, so caching is safe.
    return new StreamableFile(stream, {
      type: mime,
      length: size,
      disposition: 'inline',
    });
  }

  @Put(':id/photo')
  @RequirePermissions(PERMISSIONS.MEMBERS_UPDATE)
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: MAX_PHOTO_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['photo'],
      properties: { photo: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOkResponse({ type: MemberEnvelopeDto })
  @ApiUnprocessableEntityResponse({ description: 'Not a JPEG/PNG/WebP image, or larger than 2 MB' })
  setPhoto(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.members.setPhoto(id, file, user.id, meta.ipAddress);
  }

  @Delete(':id/photo')
  @RequirePermissions(PERMISSIONS.MEMBERS_UPDATE)
  @ApiOkResponse({ type: MemberEnvelopeDto })
  removePhoto(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.members.removePhoto(id, user.id, meta.ipAddress);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.MEMBERS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.members.remove(id, user.id, meta.ipAddress);
  }
}
