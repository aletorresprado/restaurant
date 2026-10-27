import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';
import { RegisterDto, LoginDto } from '@repo/validation';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';

const publicUser = (user: User) => ({
  id: user.id, email: user.email, firstName: user.firstName,
  lastName: user.lastName, phone: user.phone, role: user.role,
});
const digest = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  constructor(private readonly db: PrismaService, private readonly jwt: JwtService,
    private readonly config: ConfigService) {}

  async register(input: RegisterDto) {
    const passwordHash = await bcrypt.hash(input.password, 12);
    try {
      const user = await this.db.user.create({ data: {
        email: input.email.trim().toLowerCase(), firstName: input.firstName.trim(),
        lastName: input.lastName.trim(), phone: input.phone, passwordHash,
      } });
      return this.issue(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('El correo ya está registrado');
      }
      throw error;
    }
  }

  async login(input: LoginDto) {
    const user = await this.db.user.findUnique({ where: { email: input.email.trim().toLowerCase() } });
    // Always check a password hash to avoid a fast path for unknown accounts.
    const valid = await bcrypt.compare(input.password, user?.passwordHash ?? this.dummyHash);
    if (!user || !valid || !user.isActive) throw new UnauthorizedException('Credenciales inválidas');
    return this.issue(user);
  }

  private readonly dummyHash = bcrypt.hashSync(randomBytes(32).toString('hex'), 12);

  async refresh(token: string) {
    return this.db.$transaction(async tx => {
      const session = await tx.session.findUnique({ where: { refreshTokenHash: digest(token) }, include: { user: true } });
      if (!session || session.expiresAt <= new Date() || !session.user.isActive) {
        throw new UnauthorizedException('Sesión inválida o vencida');
      }
      // Atomic deletion makes simultaneous refreshes single use.
      const consumed = await tx.session.deleteMany({ where: { id: session.id } });
      if (consumed.count !== 1) throw new UnauthorizedException('Sesión ya utilizada');
      return this.issue(session.user, tx);
    });
  }

  async logout(token: string) {
    await this.db.session.deleteMany({ where: { refreshTokenHash: digest(token) } });
    return { success: true };
  }

  async me(id: string) {
    const user = await this.db.user.findUnique({ where: { id } });
    if (!user?.isActive) throw new UnauthorizedException();
    return publicUser(user);
  }

  private async issue(user: User, db: Prisma.TransactionClient = this.db) {
    const refreshToken = randomBytes(48).toString('base64url');
    const duration = this.config.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN');
    const units: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    const expiresAt = new Date(Date.now() + Number(duration.slice(0, -1)) * units[duration.slice(-1)]);
    await db.session.create({ data: { userId: user.id, refreshTokenHash: digest(refreshToken), expiresAt } });
    const accessToken = await this.jwt.signAsync({ sub: user.id, email: user.email, role: user.role });
    return { user: publicUser(user), accessToken, refreshToken };
  }
}
