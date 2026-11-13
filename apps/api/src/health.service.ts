import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './database/prisma.service';

@Injectable()
export class HealthService {
  private pending?: Promise<boolean>;
  private cached?: { ok: boolean; at: number };
  constructor(private readonly db: PrismaService) {}

  async ready() {
    let ok: boolean;
    if (this.cached && Date.now() - this.cached.at < 1000) ok = this.cached.ok;
    else {
      // Keep the underlying probe until it settles, even after an HTTP timeout.
      // Repeated requests cannot pile up database probes if PostgreSQL hangs.
      if (!this.pending) {
        this.pending = Promise.resolve().then(() => this.db.$queryRaw`SELECT 1`).then(() => true, () => false).then(value => {
          this.cached = { ok: value, at: Date.now() };
          return value;
        }).finally(() => { this.pending = undefined; });
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        ok = await Promise.race([this.pending, new Promise<boolean>(resolve => {
          timer = setTimeout(() => resolve(false), 2000);
        })]);
      } finally { if (timer) clearTimeout(timer); }
      this.cached = { ok, at: Date.now() };
    }
    const body = { status: ok ? 'ok' : 'error', service: 'App Resto API', checks: { database: ok ? 'up' : 'down' } };
    if (!ok) throw new ServiceUnavailableException(body);
    return body;
  }
}
