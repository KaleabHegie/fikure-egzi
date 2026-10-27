import { Module } from '@nestjs/common';
import {
  MemberServiceGroupsController,
  ServiceGroupsController,
  ServiceTermsController,
} from './service-groups.controller.js';
import { ServiceGroupsService } from './service-groups.service.js';

@Module({
  controllers: [ServiceTermsController, ServiceGroupsController, MemberServiceGroupsController],
  providers: [ServiceGroupsService],
})
export class ServiceGroupsModule {}
