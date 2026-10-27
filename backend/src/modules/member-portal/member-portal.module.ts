import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AttendanceModule } from '../attendance/attendance.module.js';
import { MembersModule } from '../members/members.module.js';
import { MemberPortalController } from './member-portal.controller.js';
import { MemberPortalGuard } from './member-portal.guard.js';
import { MemberPortalService } from './member-portal.service.js';

@Module({
  // Secrets are passed per call (the member key differs from the staff key).
  imports: [JwtModule.register({}), MembersModule, AttendanceModule],
  controllers: [MemberPortalController],
  providers: [MemberPortalService, MemberPortalGuard],
})
export class MemberPortalModule {}
