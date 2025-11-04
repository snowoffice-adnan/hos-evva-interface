import { BadRequestException } from '@nestjs/common';
import { validate as uuidValidate, version as uuidVersion } from 'uuid';

export function assertUuid(name: string, v?: string) {
    if (!v || !uuidValidate(v) || uuidVersion(v) !== 4) {
        throw new BadRequestException({
            message: `${name} must be a UUID`,
            error: true,
            statusCode: 400,
        });
    }
}

export function assertIsoInstant(name: string, v?: string) {
    if (!v) {
        throw new BadRequestException({
            message: `${name} is required`,
            error: true,
            statusCode: 400,
        });
    }
    const t = Date.parse(v);
    if (Number.isNaN(t)) {
        throw new BadRequestException({
            message: `${name} must be an ISO datetime`,
            error: true,
            statusCode: 400,
        });
    }
}

export function assertBeginBeforeEnd(begin: string, end: string) {
    if (Date.parse(begin) >= Date.parse(end)) {
        throw new BadRequestException({
            message: `checkIn must be before checkOut`,
            error: true,
            statusCode: 400,
        });
    }
}
