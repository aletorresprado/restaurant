import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { validateEnvironment } from './environment';
import { BranchesModule } from './branches/branches.module';
import { OperationsModule } from './operations/operations.module';
import { ReservationsModule } from './reservations/reservations.module';

@Module({
  imports: [
    // ConfigModule carga las variables de entorno desde .env
    // isGlobal: true las hace disponibles en todos los módulos sin re-importar
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnvironment,
    }),
    DatabaseModule,
    AuthModule,
    BranchesModule,
    OperationsModule,
    ReservationsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
