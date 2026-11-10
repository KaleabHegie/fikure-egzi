import { Module } from '@nestjs/common';
import { AttendanceController, MemberAttendanceController } from './attendance.controller.js';
import { AttendanceService } from './attendance.service.js';
import { AttendanceImportController } from './import/attendance-import.controller.js';
import { AttendanceImportService } from './import/attendance-import.service.js';
import { LatePermissionsController } from './late-permissions/late-permissions.controller.js';
import { LatePermissionsService } from './late-permissions/late-permissions.service.js';

@Module({
  controllers: [
    LatePermissionsController,
    AttendanceController,
    AttendanceImportController,
    MemberAttendanceController,
  ],
  providers: [AttendanceService, AttendanceImportService, LatePermissionsService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
