import { Module } from '@nestjs/common';
import {
  DepartmentMembershipsController,
  DepartmentsController,
} from './departments.controller.js';
import { DepartmentsService } from './departments.service.js';

@Module({
  controllers: [DepartmentsController, DepartmentMembershipsController],
  providers: [DepartmentsService],
})
export class DepartmentsModule {}
