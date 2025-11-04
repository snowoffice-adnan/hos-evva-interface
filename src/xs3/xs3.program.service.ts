import { BadRequestException, Injectable } from '@nestjs/common';
import { Xs3CommandsService } from './xs3.commands.service';
import { Xs3StateService } from './xs3.state.service';
import { ProgramDto } from './dto/program.dto';
import { CommandStatus } from './types';

const ISO_WITH_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?([zZ]|[+\-]\d{2}:\d{2})$/;

@Injectable()
export class Xs3ProgramService {
  constructor(
      private readonly commands: Xs3CommandsService,
      private readonly state: Xs3StateService,
  ) {}

  private parseIso(ts: string, field: string): Date {
    if (!ts || !ISO_WITH_TZ.test(ts)) {
      throw new BadRequestException(`${field} must be ISO 8601 with timezone (e.g. 2025-09-30T12:09:02Z or +02:00)`);
    }
    const d = new Date(ts);
    if (Number.isNaN(d.valueOf())) throw new BadRequestException(`${field} must be a valid ISO timestamp`);
    return d;
  }

  private clampBeginToNow(beginAt: Date): { iso: string; adjusted: boolean } {
    const now = new Date();
    // Allow a small grace window (e.g. 2 minutes)
    const graceMs = 2 * 60 * 1000;
    if (beginAt.getTime() < now.getTime() - graceMs) {
      const nearNow = new Date(now.getTime() - 60 * 1000); // now - 60s
      return { iso: nearNow.toISOString(), adjusted: true };
    }
    return { iso: beginAt.toISOString(), adjusted: false };
  }

  async program(dto: ProgramDto) {
    const mediumId = dto.mediumId ?? this.state.snapshot.mediumId ?? null;
    if (!mediumId) throw new BadRequestException('Card is not on programmer');

    const beginAt = this.parseIso(dto.checkIn, 'checkIn');
    const endAt = this.parseIso(dto.checkOut, 'checkOut');
    if (endAt <= beginAt) throw new BadRequestException('checkOut must be strictly after checkIn');

    const now = new Date();
    if (endAt <= now) throw new BadRequestException('checkOut must be in the future');

    // Defensively avoid EVVA "accessBeginTooLongInPast"
    const { iso: beginIso, adjusted } = this.clampBeginToNow(beginAt);
    const endIso = endAt.toISOString();

    const begin = await this.commands.setAccessBeginAt(mediumId, beginIso);
    const end = await this.commands.setAccessEndAt(mediumId, endIso);
    const assign = await this.commands.assignAuthorizationProfile(mediumId, dto.profileId);

    const statuses = [assign.status, begin.status, end.status] as CommandStatus[];
    const hasError = statuses.includes('error');
    const pending = (assign as any).propagationPending || (begin as any).propagationPending || (end as any).propagationPending
        || (assign as any).ackPending || (begin as any).ackPending || (end as any).ackPending;

    const message = hasError
        ? 'One or more operations failed'
        : pending
            ? 'Program completed (backend propagation pending)'
            : 'Program completed successfully';

    return {
      error: hasError,
      message: adjusted && !hasError
          ? `${message} (checkIn adjusted near now to satisfy EVVA rules)`
          : message,
      statusCode: hasError ? 400 : 200,
      mediumId,
      raw: {
        overallStatus: hasError ? 'error' : 'ok',
        mediumId,
        results: { begin, end, assign },
      },
    };
  }
}
