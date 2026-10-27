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
import { ApiBody, ApiConsumes, ApiProduces, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/auth/permissions.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { AssetsService, MAX_ASSET_PHOTO_BYTES } from './assets.service.js';
import { CreateAssetDto, QueryAssetsDto, UpdateAssetDto } from './dto/asset.dto.js';

@ApiTags('Assets')
@Controller({ path: 'assets', version: '1' })
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ASSETS_READ)
  list(@Query() q: QueryAssetsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.assets.list(q, user.departmentIds);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ASSETS_READ)
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.assets.findOne(id, user.departmentIds);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ASSETS_MANAGE)
  create(@Body() dto: CreateAssetDto, @CurrentUser() user: AuthenticatedUser) {
    return this.assets.create(dto, user.id, user.departmentIds);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ASSETS_MANAGE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAssetDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assets.update(id, dto, user.id, user.departmentIds);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.ASSETS_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.assets.remove(id, user.id, user.departmentIds);
  }

  @Get(':id/photo')
  @RequirePermissions(PERMISSIONS.ASSETS_READ)
  @ApiProduces('image/jpeg', 'image/png', 'image/webp')
  async photo(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    const { stream, size, mime } = await this.assets.openPhoto(id, user.departmentIds);
    return new StreamableFile(stream, { type: mime, length: size, disposition: 'inline' });
  }

  @Put(':id/photo')
  @RequirePermissions(PERMISSIONS.ASSETS_MANAGE)
  @UseInterceptors(
    FileInterceptor('photo', { limits: { fileSize: MAX_ASSET_PHOTO_BYTES, files: 1 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['photo'],
      properties: { photo: { type: 'string', format: 'binary' } },
    },
  })
  setPhoto(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assets.setPhoto(id, file, user.id, user.departmentIds);
  }

  @Delete(':id/photo')
  @RequirePermissions(PERMISSIONS.ASSETS_MANAGE)
  removePhoto(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.assets.removePhoto(id, user.id, user.departmentIds);
  }
}
