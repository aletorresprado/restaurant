import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { RateLimitMiddleware } from './common/rate-limit';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { validateEnvironment } from './environment';
import { BranchesModule } from './branches/branches.module';
import { OperationsModule } from './operations/operations.module';
import { ReservationsModule } from './reservations/reservations.module';
import { MaintenanceService } from './maintenance/maintenance.service';
import { HealthService } from './health.service';

@Module({
  imports: [
    // ConfigModule carga las variables de entorno desde .env
    // isGlobal: true las hace disponibles en todos los módulos sin re-importar
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      ignoreEnvFile: ['true', '1'].includes(process.env.CI ?? ''),
      validate: validateEnvironment,
    }),
    DatabaseModule,
    AuthModule,
    BranchesModule,
    OperationsModule,
    ReservationsModule,
  ],
  controllers: [AppController],
  providers: [MaintenanceService, HealthService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RateLimitMiddleware).forRoutes('*');
  }
}
