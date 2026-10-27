import { INestApplication, VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { createValidationPipe } from './common/pipes/validation.pipe.js';
import { AppConfigService } from './config/app-config.service.js';

/**
 * Applies global HTTP configuration. Shared by main.ts and e2e tests so the
 * test app behaves exactly like production.
 */
export function setupApp(app: NestExpressApplication): AppConfigService {
  const config = app.get(AppConfigService);

  // cPanel/Passenger sits behind Apache, so trust the first proxy hop for req.ip.
  app.set('trust proxy', 1);
  app.use(helmet());
  app.enableCors({
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  });
  app.setGlobalPrefix(config.apiPrefix);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(createValidationPipe());
  app.enableShutdownHooks();

  if (config.swaggerEnabled) {
    setupSwagger(app, config.apiPrefix);
  }
  return config;
}

function setupSwagger(app: INestApplication, prefix: string): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Fikure Egzi Sunday School API')
      .setDescription(
        'REST API for the Fikure Egzi Sunday School Management System. ' +
          'Authenticate via POST /auth/login, then click **Authorize** and paste the access token.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup(`${prefix}/docs`, app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
}
