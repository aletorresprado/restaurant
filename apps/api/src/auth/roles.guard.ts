import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@repo/shared-types';
import { UserRequest } from './access.guard';

const ROLES_KEY = 'allowedRoles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    const request = context.switchToHttp().getRequest<UserRequest>();
    if (!request.userRole || (roles && !roles.includes(request.userRole))) {
      throw new ForbiddenException('No tenés permisos para esta operación');
    }
    return true;
  }
}
