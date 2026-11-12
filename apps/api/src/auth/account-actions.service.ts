import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountActionPurpose } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { AccountMail } from './account-mail';
import { ResetPasswordDto } from '@repo/validation';
import { AccountLoginLimit } from './account-login-limit';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const accepted = { message: 'Si el correo corresponde a una cuenta habilitada, recibirás las instrucciones. Revisá también spam.' };
@Injectable()
export class AccountActionsService {
  private readonly logger = new Logger(AccountActionsService.name);
  constructor(private readonly db: PrismaService, private readonly config: ConfigService, private readonly mail: AccountMail,
    private readonly loginLimit: AccountLoginLimit) {}

  private dispatch(to: string, subject: string, text: string) {
    // Do not leak recipient/token/provider errors or make response time depend on SMTP delivery.
    void this.mail.send(to, subject, text).catch(() => this.logger.warn('No se pudo entregar un correo de cuenta; revisar transporte.'));
  }
  async request(email: string, purpose: AccountActionPurpose) {
    const started = performance.now();
    try {
      const user = await this.db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
      if (user?.isActive && !(purpose === 'VERIFY_EMAIL' && user.emailVerifiedAt)) {
        const token = randomBytes(32).toString('hex');
        const created = await this.db.$transaction(async tx => {
          await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id}::uuid FOR UPDATE`;
          const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
          if (!current.isActive || current.email !== user.email || (purpose === 'VERIFY_EMAIL' && current.emailVerifiedAt)) return false;
          const prior = await tx.accountActionToken.findUnique({ where: { userId_purpose: { userId: user.id, purpose } } });
          if (prior && prior.createdAt.getTime() > Date.now() - 60000) return false;
          const data = { email: user.email, tokenHash: hash(token), createdAt: new Date(),
            expiresAt: new Date(Date.now() + (purpose === 'RESET_PASSWORD' ? 900000 : 86400000)) };
          await tx.accountActionToken.upsert({ where: { userId_purpose: { userId: user.id, purpose } },
            create: { userId: user.id, purpose, ...data }, update: data });
          return true;
        });
        if (created) {
          const page = purpose === 'RESET_PASSWORD' ? 'restablecer' : 'verificar-correo';
          const url = `${this.config.get<string>('PUBLIC_WEB_URL') ?? 'http://127.0.0.1:5173'}/${page}#token=${token}`;
          this.dispatch(user.email, purpose === 'RESET_PASSWORD' ? 'Restablecer contraseña — App Resto' : 'Verificar correo — App Resto',
            `Abrí este enlace y confirmá la operación:\n${url}\n\nVence en ${purpose === 'RESET_PASSWORD' ? '15 minutos' : '24 horas'}. Si no lo pediste, ignorá este mensaje.`);
        }
      }
    } finally {
      await new Promise(resolve => setTimeout(resolve, Math.max(0, 350 - (performance.now() - started))));
    }
    return accepted;
  }

  async confirm(token: string, purpose: AccountActionPurpose, input?: ResetPasswordDto) {
    const passwordHash = input ? await bcrypt.hash(input.password, 12) : undefined;
    const user = await this.db.$transaction(async tx => {
      const candidate = await tx.accountActionToken.findUnique({ where: { tokenHash: hash(token) } });
      if (!candidate) throw new BadRequestException('El enlace no es válido o venció. Solicitá uno nuevo.');
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${candidate.userId}::uuid FOR UPDATE`;
      const current = await tx.user.findUniqueOrThrow({ where: { id: candidate.userId } });
      const action = await tx.accountActionToken.findUnique({ where: { tokenHash: hash(token) } });
      if (!action || action.purpose !== purpose || action.expiresAt <= new Date() || !current.isActive || action.email !== current.email)
        throw new BadRequestException('El enlace no es válido o venció. Solicitá uno nuevo.');
      await tx.accountActionToken.delete({ where: { id: action.id } });
      if (purpose === 'RESET_PASSWORD') {
        if (!passwordHash) throw new BadRequestException();
        await tx.user.update({ where: { id: current.id }, data: { passwordHash, authVersion: { increment: 1 } } });
        await tx.session.deleteMany({ where: { userId: current.id } });
        await tx.accountActionToken.deleteMany({ where: { userId: current.id } });
      } else await tx.user.update({ where: { id: current.id }, data: { emailVerifiedAt: new Date() } });
      return current;
    });
    if (purpose === 'RESET_PASSWORD') {
      this.loginLimit.reset(user.email);
      this.dispatch(user.email, 'Contraseña actualizada — App Resto',
        'La contraseña de tu cuenta fue restablecida y se cerraron las sesiones anteriores. Si no lo hiciste, contactá al restaurante.');
    }
    return { message: purpose === 'RESET_PASSWORD' ? 'Contraseña actualizada. Ingresá nuevamente.' : 'Correo verificado. Gracias por confirmar.' };
  }
}
