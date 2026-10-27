import { Global, Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service.js';
import { AuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';

@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditLogService],
  exports: [AuditService],
})
export class AuditModule {}
