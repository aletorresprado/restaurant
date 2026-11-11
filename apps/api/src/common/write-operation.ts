import { BadRequestException, ConflictException, createParamDecorator, ExecutionContext, GoneException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { z } from 'zod';
import { PrismaService } from '../database/prisma.service';
import { UserRequest } from '../auth/access.guard';
import { ApiHeader } from '@nestjs/swagger';

export type WriteIdentity = { actorId: string; operationId: string };
export const WriteHeader = () => ApiHeader({ name: 'Idempotency-Key', required: false,
  description: 'UUID por alta. Reutilizar con los mismos datos y cuenta para recuperar el resultado sin duplicarlo.', schema: { type: 'string', format: 'uuid' } });
export const WriteKey = createParamDecorator((_value: unknown, context: ExecutionContext): WriteIdentity | undefined => {
  const request = context.switchToHttp().getRequest<UserRequest>();
  const key = request.headers['idempotency-key'];
  if (key === undefined) return undefined;
  const parsed = z.string().uuid().safeParse(key);
  if (!parsed.success) throw new BadRequestException('Idempotency-Key debe ser un UUID');
  return { actorId: request.userId, operationId: parsed.data.toLowerCase() };
});
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) :
  value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => [key, canonical(v)])) : value;

export function writeOperation<T>(db: PrismaService, operation: WriteIdentity | undefined,
  kind: string, scope: string, payload: unknown, create: (tx: Prisma.TransactionClient) => Promise<T>,
  recover?: (tx: Prisma.TransactionClient, id: string) => Promise<T | null>): Promise<T> {
  return db.$transaction(async tx => {
    let hash = '';
    if (operation) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`write:${operation.actorId}:${operation.operationId.toLowerCase()}`}, 0))`;
      hash = createHash('sha256').update(JSON.stringify(canonical(payload))).digest('hex');
      const previous = await tx.writeOperation.findUnique({ where: { actorId_operationId: operation } });
      if (previous) {
        if (previous.kind !== kind || previous.scope !== scope || previous.requestHash !== hash)
          throw new ConflictException({ message: 'La operación ya se utilizó con otros datos o destino', code: 'OPERATION_MISMATCH' });
        const result = await recover?.(tx, previous.resultId);
        if (!result) throw new GoneException('El alta ya fue registrada y luego eliminada. No se volverá a crear.');
        return result;
      }
    }
    const result = await create(tx);
    if (operation) {
      const resultId = (result as { id: string }).id;
      if (!resultId || !recover) throw new Error('Alta sin identificador recuperable');
      await tx.writeOperation.create({ data: { ...operation, kind, scope, requestHash: hash, resultId } });
    }
    return result;
  }, { timeout: 15000 });
}
