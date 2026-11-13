import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class AppController {
  constructor(private readonly healthService: HealthService) {}
  @Get()
  @ApiOperation({ summary: 'Liveness: el proceso responde; no consulta PostgreSQL' })
  health() {
    return {
      status: 'ok',
      service: 'App Resto API',
      version: '0.0.1',
    };
  }
  @Get('ready')
  @ApiOperation({ summary: 'Readiness: consulta PostgreSQL, con cache de 1 segundo y espera maxima de 2 segundos' })
  @ApiResponse({ status: 200, description: 'PostgreSQL responde' })
  @ApiResponse({ status: 503, description: 'PostgreSQL no responde o se agota el plazo; sin datos internos' })
  ready() { return this.healthService.ready(); }
}
