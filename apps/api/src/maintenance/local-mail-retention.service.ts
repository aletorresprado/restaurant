import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lstat, opendir, unlink } from 'fs/promises';
import { join, resolve } from 'path';

@Injectable()
export class LocalMailRetentionService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(LocalMailRetentionService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<{ removed: number; scanned: number; capped: boolean }>;
  private stopping = false;
  constructor(private readonly config: ConfigService) {}

  private enabled() {
    return this.config.get('NODE_ENV') !== 'production' &&
      (this.config.get('MAIL_MODE') ?? 'file') === 'file' &&
      this.config.get('MAINTENANCE_ENABLED') !== false;
  }

  onApplicationBootstrap() {
    if (!this.enabled()) return;
    void this.scheduled();
    this.timer = setInterval(() => { void this.scheduled(); },
      (this.config.get<number>('MAINTENANCE_INTERVAL_SECONDS') ?? 900) * 1000);
    this.timer.unref();
  }

  private async scheduled() {
    if (this.stopping || this.running) return;
    try {
      const result = await this.run();
      this.logger.log(`local mail cleanup removed=${result.removed} scanned=${result.scanned} capped=${result.capped}`);
    } catch {
      this.logger.warn('local mail cleanup failed; next scheduled run will retry');
    }
  }

  run() {
    if (this.running) return this.running;
    if (this.stopping) return Promise.reject(new Error('Maintenance is stopping'));
    this.running = this.cleanup().finally(() => { this.running = undefined; });
    return this.running;
  }

  private async cleanup() {
    const result = { removed: 0, scanned: 0, capped: false };
    if (!this.enabled()) return result;
    const directory = resolve(this.config.get<string>('MAIL_OUTBOX_DIR') ?? '.local/mail');
    const cutoff = Date.now() - (this.config.get<number>('MAIL_LOCAL_RETENTION_DAYS') ?? 7) * 86400000;
    try {
      const root = await lstat(directory);
      if (root.isSymbolicLink() || !root.isDirectory()) throw new Error('Invalid local mailbox directory');
      const entries = await opendir(directory);
      for await (const entry of entries) {
        if (this.stopping) break;
        result.scanned++;
        // Only names written by AccountMail; never recurse, read bodies or follow links.
        const match = /^(\d{13})-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/.exec(entry.name);
        if (entry.isFile() && match && Number(match[1]) <= cutoff) {
          const path = join(directory, entry.name);
          try {
            const file = await lstat(path);
            if (file.isFile() && file.mtimeMs <= cutoff) {
              await unlink(path);
              result.removed++;
            }
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          }
        }
        if (result.removed >= 500 || result.scanned >= 10000) {
          result.capped = true;
          break;
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return result;
  }

  async onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.running?.catch(() => {});
  }
}
