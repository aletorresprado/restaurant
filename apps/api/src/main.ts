import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { securityHeaders } from './common/security-headers';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const logger = new Logger('Bootstrap');

  // Prefijo global para todas las rutas
  app.setGlobalPrefix('api/v1');

  // La SPA usa el mismo origen por proxy; no hay cookies CORS entre orígenes.
  const settings = app.get(ConfigService);
  // Trust only explicitly configured proxy IPs; never trust arbitrary forwarding headers.
  app.getHttpAdapter().getInstance().set('trust proxy', settings.get<string[]>('TRUSTED_PROXY_IPS') ?? false);
  app.enableCors({ origin: settings.get<string[]>('WEB_ORIGINS'), credentials: false });
  app.use(securityHeaders);

  // Swagger / OpenAPI
  const config = new DocumentBuilder()
    .setTitle('App Resto API')
    .setDescription('Sistema de reservas y fidelización para restaurante multisucursal')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { validatorUrl: null, persistAuthorization: false },
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`API corriendo en http://localhost:${port}/api/v1`);
  logger.log(`Documentación en http://localhost:${port}/api/docs`);
}

bootstrap();
