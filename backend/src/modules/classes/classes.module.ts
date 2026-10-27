import { Module } from '@nestjs/common';
import { ClassGradesController, ClassTypesController } from './classes.controller.js';
import { ClassesService } from './classes.service.js';

@Module({
  controllers: [ClassTypesController, ClassGradesController],
  providers: [ClassesService],
  exports: [ClassesService],
})
export class ClassesModule {}
