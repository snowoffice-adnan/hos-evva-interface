export interface ApiEnvelope<T = any> {
    error: boolean;
    message: string;
    statusCode: number;
    mediumId?: string | null;
    raw?: T;
}

export function ok<T = any>(message: string, raw?: T, statusCode = 200): ApiEnvelope<T> {
    return { error: false, message, statusCode, raw };
}

export function fail<T = any>(message: string, statusCode = 400, raw?: T): ApiEnvelope<T> {
    return { error: true, message, statusCode, raw };
}