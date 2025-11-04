import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { fail } from './responses';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    catch(exception: any, host: ArgumentsHost) {
        const res = host.switchToHttp().getResponse<Response>();
        let status = HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'Internal server error';
        let raw: any;

        if (exception instanceof HttpException) {
            status = exception.getStatus();
            const rsp = exception.getResponse();
            if (typeof rsp === 'string') message = rsp;
            else if (rsp && typeof rsp === 'object') {
                message = (rsp as any).message ?? message;
                raw = rsp;
            }
        } else if (exception?.message) {
            message = exception.message;
            raw = exception;
        }

        res.status(status).json(fail(message, status, raw));
    }
}
