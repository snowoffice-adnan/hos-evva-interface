import { Transform } from 'class-transformer';

export function EmptyToUndefined() {
    return Transform(({ value }) => (value === '' ? undefined : value));
}