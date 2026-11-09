import { Module } from '@nestjs/common';
import { ExamsController } from './exams.controller.js';
import { ExamsService } from './exams.service.js';

/** A department's own exams and assessments (not tied to a course). */
@Module({
  controllers: [ExamsController],
  providers: [ExamsService],
  exports: [ExamsService],
})
export class ExamsModule {}
