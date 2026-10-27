import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { setupApp } from './setup-app.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
  });
  const config = setupApp(app);

  await app.listen(config.port);

  const logger = new Logger('Bootstrap');
  const base = `http://localhost:${config.port}/${config.apiPrefix}`;
  logger.log(`API ready at ${base}/v1`);
  if (config.swaggerEnabled) {
    logger.log(`Swagger docs at ${base}/docs`);
  }
}

void bootstrap();
