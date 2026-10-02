import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Response } from 'express';
import { BYPASS_ENVELOPE_KEY } from '../decorators/bypass-envelope.decorator';

export interface StandardSuccessResponse<T = any> {
  success: true;
  message?: string;
  data: T;
}

export interface StandardPaginatedResponse<T = any> {
  success: true;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const isBypass = this.reflector.getAllAndOverride<boolean>(BYPASS_ENVELOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isBypass) {
      return next.handle();
    }

    const httpContext = context.switchToHttp();
    const response = httpContext.getResponse<Response>();

    return next.handle().pipe(
      map((resData) => {
        // Bypass if headers sent, streamable file, or raw buffer
        if (
          !response ||
          response.headersSent ||
          resData instanceof StreamableFile ||
          Buffer.isBuffer(resData)
        ) {
          return resData;
        }

        // If the route explicitly returned null/undefined (e.g. 204 No Content)
        if (resData === undefined || resData === null) {
          if (response.statusCode === 204) {
            return resData;
          }
          return {
            success: true,
            message: 'Success',
            data: null,
          };
        }

        // If resData is already structured as an envelope (e.g., legacy port or custom object with success boolean)
        if (typeof resData === 'object' && resData !== null && 'success' in resData) {
          return resData;
        }

        // Paginated result shape check: { data, pagination: { page, limit, total } } or { rows, total, page, limit }
        if (
          typeof resData === 'object' &&
          resData !== null &&
          (Array.isArray(resData.data) || Array.isArray(resData.rows)) &&
          (resData.pagination || ('total' in resData && 'page' in resData && 'limit' in resData))
        ) {
          const list = Array.isArray(resData.data) ? resData.data : resData.rows;
          const page = parseInt(resData.pagination?.page ?? resData.page, 10) || 1;
          const limit = parseInt(resData.pagination?.limit ?? resData.limit, 10) || 10;
          const total = parseInt(resData.pagination?.total ?? resData.total, 10) || 0;
          const totalPages =
            resData.pagination?.totalPages ?? (limit > 0 ? Math.ceil(total / limit) : 1);

          return {
            success: true,
            message: resData.message || 'Success',
            data: list,
            rows: list,
            total,
            page,
            limit,
            pagination: {
              page,
              limit,
              total,
              totalPages,
            },
          };
        }

        // Standard object / array / primitive payload
        let message = 'Success';
        let data = resData;

        // If controller returns { message, data }
        if (
          typeof resData === 'object' &&
          resData !== null &&
          'message' in resData &&
          'data' in resData &&
          Object.keys(resData).length === 2
        ) {
          message = resData.message;
          data = resData.data;
        }

        return {
          success: true,
          message,
          data,
        };
      }),
    );
  }
}
