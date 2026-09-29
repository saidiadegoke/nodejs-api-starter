import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { Request } from 'express';
import { AllConfigType } from '../../config/config.type';

export interface AuthenticatedUser {
  user_id: string;
  roles: string[];
  session_id?: string;
  type?: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService<AllConfigType>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authentication required');
    }

    const token = authHeader.split(' ')[1];
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
