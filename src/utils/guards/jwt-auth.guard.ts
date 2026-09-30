import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { Request } from 'express';
import { AllConfigType } from '../../config/config.type';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

export interface AuthenticatedUser {
  user_id: string;
  roles: string[];
  session_id?: string;
  type?: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService<AllConfigType>,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const authHeader = request.headers.authorization;

    let token: string | undefined;

    if (authHeader) {
      const match = authHeader.match(/^Bearer\s+(.*)$/i);
      if (match) {
        token = match[1].trim();
      }
    }

    if (!token && typeof request.headers['x-access-token'] === 'string') {
      token = request.headers['x-access-token'].trim();
    }

    if (!token && typeof (request as any).cookies?.access_token === 'string') {
      token = (request as any).cookies.access_token.trim();
    }

    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    const jwtSecret =
      this.configService.get('jwt.secret', { infer: true }) ||
      process.env.JWT_SECRET ||
      'dev-secret-key-change-in-production-12345678';

    try {
      const payload = jwt.verify(token, jwtSecret) as any;
      const rawRoles = payload.roles || [];
      const roles = Array.isArray(rawRoles)
        ? rawRoles.map((r: any) => (typeof r === 'string' ? r : r.name)).filter(Boolean)
        : [];

      request.user = {
        user_id: payload.user_id,
        roles,
        session_id: payload.session_id,
        type: payload.type,
      };

      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
