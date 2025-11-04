import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpErrorFormatterFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const res = ctx.getResponse<Response>();

        if (exception instanceof HttpException) {
            const status = exception.getStatus();
            const payload = exception.getResponse() as any;

            // Pass through non-error statuses (e.g. 202 if you ever use it)
            if (status < 400) {
                return res.status(status).json(payload);
            }

            // If the payload already looks like your shape, keep extras and just enforce flags.
            if (payload && typeof payload === 'object' && ('message' in payload || 'statusCode' in payload || 'error' in payload)) {
                return res.status(status).json({
                    ...payload,
                    error: true,
                    statusCode: status,
                });
            }

            // Otherwise, normalize to your shape
            let message: string;
            if (typeof payload === 'string') message = payload;
            else if (Array.isArray(payload?.message)) message = payload.message.join('; ');
            else message = payload?.message ?? exception.message ?? 'Error';

            return res.status(status).json({
                message,
                error: true,
                statusCode: status,
            });
        }

        // Non-HTTP exceptions -> 500 in unified shape
        const message = (exception as any)?.message ?? 'Internal Server Error';
        return res.status(500).json({
            message,
            error: true,
            statusCode: 500,
        });
    }
}
