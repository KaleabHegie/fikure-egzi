import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { AppConfigService } from '../config/app-config.service.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { buildMariaDbPoolConfig } from './database-url.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: AppConfigService) {
    const { url, poolSize } = config.database;
    super({
      adapter: new PrismaMariaDb(buildMariaDbPoolConfig(url, poolSize)),
      log: ['warn', 'error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
