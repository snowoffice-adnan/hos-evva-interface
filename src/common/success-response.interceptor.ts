import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { ok, ApiEnvelope } from './responses';

@Injectable()
export class SuccessResponseInterceptor implements NestInterceptor {
    intercept(ctx: ExecutionContext, next: CallHandler): Observable<ApiEnvelope> {
        return next.handle().pipe(
            map((data: any) => {
                if (data && typeof data === 'object' && 'error' in data && 'statusCode' in data) {
                    return data as ApiEnvelope;
                }
                return ok('Success', data, 200);
            }),
        );
    }
}
