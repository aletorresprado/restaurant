import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { AccountMail } from './account-mail';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));
describe('account mail transport', () => {
  it('requires STARTTLS or direct TLS and never enables message logging or remote attachments', async () => {
    const nodemailer = require('nodemailer');
    const sendMail = jest.fn<() => Promise<unknown>>().mockResolvedValue({});
    nodemailer.createTransport.mockReturnValue({ sendMail });
    for (const port of [587, 465]) {
      const mail = new AccountMail(new ConfigService({ MAIL_MODE: 'smtp', SMTP_PORT: port,
        SMTP_HOST: 'smtp.example.invalid', SMTP_USER: 'fixture', SMTP_PASSWORD: 'fixture-only', MAIL_FROM: 'resto@example.invalid' }));
      await mail.send('user@example.invalid', 'Fixture', 'No real mail is sent');
      expect(nodemailer.createTransport).toHaveBeenLastCalledWith(expect.objectContaining({
        secure: port === 465, requireTLS: port !== 465, disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false,
      }));
    }
  });
  it('refuses local file delivery in production even without environment validation', async () => {
    const mail = new AccountMail({ get: (name: string) => ({ MAIL_MODE: 'file', NODE_ENV: 'production' } as Record<string, string>)[name] } as ConfigService);
    await expect(mail.send('user@example.invalid', 'Fixture', 'fixture')).rejects.toThrow('forbidden');
  });
});
