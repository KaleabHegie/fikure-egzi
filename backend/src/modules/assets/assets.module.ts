import { Module } from '@nestjs/common';
import { AssetCategoriesController } from './asset-categories.controller.js';
import { AssetCategoriesService } from './asset-categories.service.js';
import { AssetsController } from './assets.controller.js';
import { AssetsService } from './assets.service.js';

@Module({
  controllers: [AssetsController, AssetCategoriesController],
  providers: [AssetsService, AssetCategoriesService],
})
export class AssetsModule {}
