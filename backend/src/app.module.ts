import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { PermissionsGuard } from './common/guards/permissions.guard.js';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor.js';
import { RateLimitGuard } from './common/rate-limit/rate-limit.guard.js';
import { AppConfigModule } from './config/config.module.js';
import { AttendanceModule } from './modules/attendance/attendance.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { ClassesModule } from './modules/classes/classes.module.js';
import { DepartmentsModule } from './modules/departments/departments.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { MembersModule } from './modules/members/members.module.js';
import { StorageModule } from './modules/storage/storage.module.js';
import { ServiceGroupsModule } from './modules/service-groups/service-groups.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { AssetsModule } from './modules/assets/assets.module.js';
import { CoursesModule } from './modules/courses/courses.module.js';
import { TelegramModule } from './modules/telegram/telegram.module.js';
import { MemberPortalModule } from './modules/member-portal/member-portal.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

/**
 * Modular monolith root. Infrastructure modules first, then one module per
 * business domain. Future domains (attendance, education, finance, hr,
 * inventory, assets, events) plug in here the same way MembersModule does.
 */
@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    AuditModule,
    StorageModule,
    AuthModule,
    HealthModule,
    MembersModule,
    ClassesModule,
    DepartmentsModule,
    AttendanceModule,
    ServiceGroupsModule,
    UsersModule,
    AssetsModule,
    CoursesModule,
    TelegramModule,
    MemberPortalModule,
  ],
  providers: [
    // Guard order matters: rate limit → authenticate → authorize.
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
