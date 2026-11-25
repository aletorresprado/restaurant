import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { Prisma, MailJob } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AccountMail } from './account-mail';

type Message = { to: string; subject: string; text: string };

@Injectable()
export class MailQueue implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MailQueue.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopping = false;
  constructor(private readonly db: PrismaService, private readonly config: ConfigService, private readonly mail: AccountMail) {}
  private scope() { return this.config.get<string>('MAIL_QUEUE_SCOPE') ?? 'main'; }

  private key() {
    const secret = this.config.get<string>('MAIL_QUEUE_KEY');
    if (secret) return Buffer.from(secret, 'hex');
    if (this.config.get('NODE_ENV') === 'production') throw new Error('Mail queue key required');
    return createHash('sha256').update(`resto-mail-v1:${this.config.getOrThrow<string>('JWT_ACCESS_SECRET')}`).digest();
  }
  encrypt(message: Message) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    cipher.setAAD(Buffer.from('resto-mail-v1'));
    const body = Buffer.concat([cipher.update(JSON.stringify(message), 'utf8'), cipher.final()]);
    return ['v1', iv.toString('hex'), cipher.getAuthTag().toString('hex'), body.toString('hex')].join('.');
  }
  decrypt(payload: string): Message {
    const [version, iv, tag, body] = payload.split('.');
    if (version !== 'v1') throw new Error('Invalid queued message');
    const cipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(iv, 'hex'));
    cipher.setAAD(Buffer.from('resto-mail-v1'));
    cipher.setAuthTag(Buffer.from(tag, 'hex'));
    return JSON.parse(Buffer.concat([cipher.update(Buffer.from(body, 'hex')), cipher.final()]).toString('utf8'));
  }
  async enqueue(tx: Prisma.TransactionClient, userId: string, message: Message, expiresAt: Date, tokenHash?: string) {
    return tx.mailJob.create({ data: { userId, scope: this.scope(), payload: this.encrypt(message), expiresAt, tokenHash, availableAt: new Date(), createdAt: new Date() } });
  }

  onApplicationBootstrap() {
    if (this.config.get('MAIL_QUEUE_ENABLED') === false) return;
    void this.scheduled();
    this.timer = setInterval(() => { void this.scheduled(); }, 1000);
    this.timer.unref();
  }
  private async scheduled() {
    if (this.stopping || this.running) return;
    try { await this.run(); }
    catch { this.logger.warn('mail queue unavailable; next scheduled run will retry'); }
  }
  run(): Promise<void> {
    if (this.running) return this.running;
    if (this.stopping) return Promise.resolve();
    this.running = this.process().finally(() => { this.running = undefined; });
    return this.running;
  }
  private async finish(job: MailJob, status: string) {
    // A stale worker must never acknowledge a newer lease.
    await this.db.mailJob.updateMany({ where: { id: job.id, status: 'pending', attempts: job.attempts },
      data: { status, payload: null, tokenHash: null, finishedAt: new Date() } });
  }
  private async process() {
    const scope = this.scope();
    // Bounded housekeeping; completed rows carry no message body or destination.
    await this.db.$executeRaw`WITH expired AS (
      SELECT id FROM "MailJob" WHERE scope = ${scope} AND status = 'pending' AND "availableAt" <= (clock_timestamp() AT TIME ZONE 'UTC')
      AND (attempts >= 5 OR "expiresAt" <= (clock_timestamp() AT TIME ZONE 'UTC')) LIMIT 500 FOR UPDATE SKIP LOCKED
    ) UPDATE "MailJob" SET status = 'failed', payload = NULL, "tokenHash" = NULL,
      "finishedAt" = (clock_timestamp() AT TIME ZONE 'UTC') FROM expired WHERE "MailJob".id = expired.id`;
    await this.db.$executeRaw`WITH old AS (
      SELECT id FROM "MailJob" WHERE scope = ${scope} AND "finishedAt" < (clock_timestamp() AT TIME ZONE 'UTC') - interval '7 days'
      LIMIT 500 FOR UPDATE SKIP LOCKED
    ) DELETE FROM "MailJob" USING old WHERE "MailJob".id = old.id`;
    for (let index = 0; index < 10 && !this.stopping; index++) {
      const jobs = await this.db.$queryRaw<MailJob[]>`WITH candidate AS (
        SELECT id FROM "MailJob" WHERE scope = ${scope} AND status = 'pending' AND attempts < 5
        AND "availableAt" <= (clock_timestamp() AT TIME ZONE 'UTC') AND "expiresAt" > (clock_timestamp() AT TIME ZONE 'UTC')
        ORDER BY "availableAt", id LIMIT 1 FOR UPDATE SKIP LOCKED
      ) UPDATE "MailJob" SET attempts = attempts + 1,
        "availableAt" = (clock_timestamp() AT TIME ZONE 'UTC') + interval '120 seconds'
        FROM candidate WHERE "MailJob".id = candidate.id RETURNING "MailJob".*`;
      const job = jobs[0];
      if (!job) return;
      try {
        const user = await this.db.user.findUnique({ where: { id: job.userId } });
        const message = this.decrypt(job.payload!);
        const token = job.tokenHash ? await this.db.accountActionToken.findUnique({ where: { tokenHash: job.tokenHash } }) : null;
        if (!user?.isActive || user.email !== message.to || (job.tokenHash &&
          (!token || token.userId !== job.userId || token.email !== message.to || token.expiresAt <= new Date()))) {
          await this.finish(job, 'cancelled');
          continue;
        }
        await this.mail.send(message.to, message.subject, message.text);
        await this.finish(job, 'sent');
      } catch {
        if (job.attempts >= 5) {
          await this.finish(job, 'failed');
          this.logger.warn('mail delivery exhausted retries');
        } else {
          const delay = [30, 120, 600, 1800][job.attempts - 1];
          await this.db.mailJob.updateMany({ where: { id: job.id, status: 'pending', attempts: job.attempts },
            data: { availableAt: new Date(Date.now() + delay * 1000) } });
          this.logger.warn('mail delivery deferred for retry');
        }
      }
    }
  }
  async onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.running?.catch(() => {});
  }
}
