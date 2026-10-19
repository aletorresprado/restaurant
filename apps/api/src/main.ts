import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  // Prefijo global para todas las rutas
  app.setGlobalPrefix('api/v1');

  // CORS — en producción restringir a los dominios permitidos
  app.enableCors();

  // Swagger / OpenAPI
  const config = new DocumentBuilder()
    .setTitle('App Resto API')
    .setDescription('Sistema de reservas y fidelización para restaurante multisucursal')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`API corriendo en http://localhost:${port}/api/v1`);
  logger.log(`Documentación en http://localhost:${port}/api/docs`);
}

bootstrap();
