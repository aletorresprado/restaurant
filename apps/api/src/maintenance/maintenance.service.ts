import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';

export type CleanupResult = { sessions: number; links: number; batches: number; capped: boolean };

@Injectable()
export class MaintenanceService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MaintenanceService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<CleanupResult>;
  private stopping = false;
  constructor(private readonly db: PrismaService, private readonly config: ConfigService) {}

  onApplicationBootstrap() {
    if (this.config.get<boolean>('MAINTENANCE_ENABLED') === false) return;
    const interval = (this.config.get<number>('MAINTENANCE_INTERVAL_SECONDS') ?? 900) * 1000;
    void this.scheduled();
    this.timer = setInterval(() => { void this.scheduled(); }, interval);
    this.timer.unref();
  }

  private async scheduled() {
    if (this.stopping || this.running) return;
    try {
      const result = await this.run();
      this.logger.log(`cleanup completed sessions=${result.sessions} links=${result.links} batches=${result.batches} capped=${result.capped}`);
    } catch {
      // Never log SQL, connection strings, user identifiers or token values.
      this.logger.warn('cleanup failed; next scheduled run will retry');
    }
  }

  run(): Promise<CleanupResult> {
    if (this.running) return this.running;
    if (this.stopping) return Promise.reject(new Error('Maintenance is stopping'));
    this.running = this.cleanup().finally(() => { this.running = undefined; });
    return this.running;
  }

  private async cleanup(): Promise<CleanupResult> {
    const cutoff = new Date();
    const limit = this.config.get<number>('MAINTENANCE_BATCH_SIZE') ?? 500;
    const result: CleanupResult = { sessions: 0, links: 0, batches: 0, capped: false };
    for (let batch = 0; batch < 10 && !this.stopping; batch++) {
      const counts = await this.db.$transaction(async tx => {
        const sessions = await tx.$executeRaw`WITH expired AS (
          SELECT id FROM "Session" WHERE "expiresAt" <= (${cutoff}::timestamptz AT TIME ZONE 'UTC')
          ORDER BY "expiresAt", id LIMIT ${limit} FOR UPDATE SKIP LOCKED
        ) DELETE FROM "Session" USING expired WHERE "Session".id = expired.id`;
        const links = await tx.$executeRaw`WITH expired AS (
          SELECT id FROM "AccountActionToken" WHERE "expiresAt" <= (${cutoff}::timestamptz AT TIME ZONE 'UTC')
          ORDER BY "expiresAt", id LIMIT ${limit} FOR UPDATE SKIP LOCKED
        ) DELETE FROM "AccountActionToken" USING expired WHERE "AccountActionToken".id = expired.id`;
        return { sessions, links };
      }, { maxWait: 2000, timeout: 5000 });
      result.sessions += counts.sessions;
      result.links += counts.links;
      result.batches++;
      if (counts.sessions < limit && counts.links < limit) return result;
      if (batch === 9) result.capped = true;
    }
    return result;
  }

  async onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.running?.catch(() => {});
  }
}
