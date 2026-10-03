import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { CommodLogger } from '../../logger/commod-logger.service';

export interface StandardErrorResponse {
  success: false;
  message: string;
  error_code?: string;
  details?: any;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: CommodLogger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal Server Error';
    let details: any = undefined;
    let errorCode: string | undefined = undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();
      const anyErr = exception as any;

      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const errorObj = res as Record<string, any>;
        message = errorObj.message || exception.message || 'An error occurred';
        if (errorObj.error_code) {
          errorCode = errorObj.error_code;
        }
        // Handle class-validator validation errors where message is an array
        if (Array.isArray(errorObj.message)) {
          message = 'Validation failed';
          details = errorObj.message;
        } else if (errorObj.details) {
          details = errorObj.details;
          if (!errorCode && typeof errorObj.details === 'object' && errorObj.details?.error_code) {
            errorCode = errorObj.details.error_code;
          }
        } else if (errorObj.error_code) {
          details = { error_code: errorObj.error_code };
        }
      }

      if (details === undefined || details === null) {
        if (anyErr.details) {
          details = anyErr.details;
          if (!errorCode && typeof anyErr.details === 'object' && anyErr.details?.error_code) {
            errorCode = anyErr.details.error_code;
          }
        } else if (anyErr.error_code) {
          details = { error_code: anyErr.error_code };
          errorCode = anyErr.error_code;
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message || 'Internal Server Error';
      const anyErr = exception as any;
      if (anyErr.statusCode && typeof anyErr.statusCode === 'number') {
        statusCode = anyErr.statusCode;
      } else if (anyErr.status && typeof anyErr.status === 'number') {
        statusCode = anyErr.status;
      }
      if (anyErr.error_code) {
        errorCode = anyErr.error_code;
      }
      if (anyErr.details) {
        details = anyErr.details;
        if (!errorCode && typeof anyErr.details === 'object' && anyErr.details?.error_code) {
          errorCode = anyErr.details.error_code;
        }
      } else if (anyErr.error_code) {
        details = { error_code: anyErr.error_code };
      }
    }

    // Map 404 not found route if generic Nest 404 message
    if (statusCode === HttpStatus.NOT_FOUND && message.startsWith('Cannot ')) {
      message = `Route ${request.method} ${request.path} not found`;
    }

    // Log structured error for dashboards
    this.logger.error('Error occurred:', {
      message: (exception as any)?.message || message,
      stack: (exception as any)?.stack,
      path: request?.path,
      method: request?.method,
      requestId: request?.id,
      statusCode,
    });

    const errorPayload: StandardErrorResponse = {
      success: false,
      message: Array.isArray(message) ? 'Validation failed' : message,
    };

    if (errorCode) {
      errorPayload.error_code = errorCode;
    }

    if (details !== undefined && details !== null) {
      errorPayload.details = details;
    }

    if (!response.headersSent) {
      response.status(statusCode).json(errorPayload);
    }
  }
}
