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
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/auth/permissions.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { AssetCategoriesService } from './asset-categories.service.js';
import { CreateAssetCategoryDto, UpdateAssetCategoryDto } from './dto/asset-category.dto.js';

@ApiTags('Assets')
@Controller({ path: 'asset-categories', version: '1' })
export class AssetCategoriesController {
  constructor(private readonly categories: AssetCategoriesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ASSETS_READ)
  list() {
    return this.categories.list();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ASSETS_MANAGE)
  create(@Body() dto: CreateAssetCategoryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.categories.create(dto, user.id, user.departmentIds);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ASSETS_MANAGE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAssetCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.categories.update(id, dto, user.id, user.departmentIds);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.ASSETS_MANAGE)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.categories.remove(id, user.id, user.departmentIds);
  }
}
