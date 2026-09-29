import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const headerId = req.get('x-request-id') || req.get('X-Request-ID');
    req.id = headerId || crypto.randomBytes(8).toString('hex');
    res.setHeader('X-Request-ID', req.id);
    next();
  }
}
