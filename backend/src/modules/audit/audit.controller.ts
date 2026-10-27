import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/auth/permissions.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { AuditLogService } from './audit-log.service.js';
import { QueryAuditDto } from './dto/query-audit.dto.js';

@ApiTags('Audit')
@Controller({ path: 'audit', version: '1' })
@RequirePermissions(PERMISSIONS.AUDIT_READ)
export class AuditController {
  constructor(private readonly audit: AuditLogService) {}

  @Get()
  list(@Query() q: QueryAuditDto, @CurrentUser() user: AuthenticatedUser) {
    return this.audit.list(q, user);
  }

  @Get('users')
  users(@CurrentUser() user: AuthenticatedUser) {
    return this.audit.users(user);
  }
}
