import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    // ConfigModule carga las variables de entorno desde .env
    // isGlobal: true las hace disponibles en todos los módulos sin re-importar
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
  ],
})
export class AppModule {}
