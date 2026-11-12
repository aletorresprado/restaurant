import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, writeFile } from 'fs/promises';
import { resolve, join } from 'path';
import { randomUUID } from 'crypto';

@Injectable()
export class AccountMail {
  constructor(private readonly config: ConfigService) {}
  async send(to: string, subject: string, text: string) {
    if ((this.config.get('MAIL_MODE') ?? 'file') === 'file') {
      if (this.config.get('NODE_ENV') === 'production') throw new Error('Local mail forbidden in production');
      const directory = resolve(this.config.get<string>('MAIL_OUTBOX_DIR') ?? '.local/mail');
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(join(directory, `${Date.now()}-${randomUUID()}.json`), JSON.stringify({ to, subject, text }, null, 2),
        { flag: 'wx', mode: 0o600 });
      return;
    }
    const nodemailer = require('nodemailer');
    const port = this.config.get<number>('SMTP_PORT') ?? 587;
    const transport = nodemailer.createTransport({ host: this.config.get('SMTP_HOST'), port,
      secure: port === 465, requireTLS: port !== 465,
      auth: { user: this.config.get('SMTP_USER'), pass: this.config.get('SMTP_PASSWORD') },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
      disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false });
    await transport.sendMail({ from: this.config.get('MAIL_FROM'), to, subject, text });
  }
}
