import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { SkipRateLimit } from '../../common/rate-limit/rate-limit.decorator.js';
import { PrismaService } from '../../prisma/prisma.service.js';

@ApiTags('Health')
@SkipRateLimit()
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOkResponse({ description: 'API and database are reachable' })
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('Database unreachable');
    }
    return {
      status: 'ok',
      database: 'up',
      timestamp: new Date().toISOString(),
    };
  }
}
