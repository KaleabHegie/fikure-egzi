import { Module } from '@nestjs/common';
import { CourseRunsController, CoursesController } from './courses.controller.js';
import { CoursesService } from './courses.service.js';

@Module({
  controllers: [CoursesController, CourseRunsController],
  providers: [CoursesService],
})
export class CoursesModule {}
