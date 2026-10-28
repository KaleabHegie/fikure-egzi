import { Module } from '@nestjs/common';
import { CourseMarksImportController } from './course-marks-import.controller.js';
import { CourseMarksImportService } from './course-marks-import.service.js';
import { CourseRunsController, CoursesController } from './courses.controller.js';
import { CoursesService } from './courses.service.js';

@Module({
  controllers: [CoursesController, CourseRunsController, CourseMarksImportController],
  providers: [CoursesService, CourseMarksImportService],
  exports: [CoursesService],
})
export class CoursesModule {}
