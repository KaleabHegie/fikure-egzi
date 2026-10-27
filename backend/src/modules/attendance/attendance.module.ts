import { Module } from '@nestjs/common';
import { AttendanceController, MemberAttendanceController } from './attendance.controller.js';
import { AttendanceService } from './attendance.service.js';
import { AttendanceImportController } from './import/attendance-import.controller.js';
import { AttendanceImportService } from './import/attendance-import.service.js';

@Module({
  controllers: [AttendanceController, AttendanceImportController, MemberAttendanceController],
  providers: [AttendanceService, AttendanceImportService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
