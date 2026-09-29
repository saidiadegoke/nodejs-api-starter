import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class SearchAliasMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    if (req.query && !req.query.q) {
      const alias = req.query.search || req.query.query;
      if (alias) {
        req.query.q = alias as string;
      }
    }
    next();
  }
}
