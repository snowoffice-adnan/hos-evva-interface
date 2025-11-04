import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Xs3Client } from './xs3.client';
import { Xs3QueriesService } from './xs3.queries.service';
import { Xs3StateService } from './xs3.state.service';
import { v4 as uuidv4 } from 'uuid';
import { CommandOutcome } from './types';

/* ===================== Helpers ===================== */

function delay(ms: number) { return new Promise(res => setTimeout(res, ms)); }

// Ako string nema Z/offset, tretira lokalno vrijeme i pretvara u UTC ISO (sa Z)
function toIsoUtc(s: string): string {
  if (/[zZ]|[+\-]\d{2}:\d{2}$/.test(s)) return s;
  return new Date(s).toISOString();
}

// Floor/Ceil na 5 minuta u UTC (vrati ISO s "Z")
function floorTo5MinUtc(iso: string): string {
  const d = new Date(iso);
  const ms = d.getTime();
  const five = 5 * 60 * 1000;
  const floored = Math.floor(ms / five) * five;
  return new Date(floored).toISOString().replace(/\.\d{3}Z$/, 'Z');
}
function ceilTo5MinUtc(iso: string): string {
  const d = new Date(iso);
  const ms = d.getTime();
  const five = 5 * 60 * 1000;
  const ceiled = Math.ceil(ms / five) * five;
  return new Date(ceiled).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// Poređenje na nivou minute (XS3 “grid”)
function sameMinute(a?: string, b?: string) {
  if (!a || !b) return false;
  const toMin = (t: number) => Math.floor(t / 60000);
  const A = toMin(new Date(a).getTime());
  const B = toMin(new Date(b).getTime());
  return Number.isFinite(A) && Number.isFinite(B) && A === B;
}

// Ekstrakcija trenutnih vrijednosti iz read-modela
function currentBegin(curr: any): string | undefined {
  return curr?.accessBeginAt ?? curr?.checkIn ?? curr?.validFrom;
}
function currentEnd(curr: any): string | undefined {
  return curr?.accessEndAt ?? curr?.checkOut ?? curr?.validUntil;
}

// “Meki” ACK timeout: ne baca grešku kad istekne, samo signalizira ok:false
async function awaitWithAckTimeout<T>(p: Promise<T>, ms: number): Promise<{ ok: boolean; value?: T }> {
  let timer: any;
  try {
    const value = await Promise.race<T>([
      p,
      new Promise<T>((_, rej) => { timer = setTimeout(() => rej(new Error('ACK_TIMEOUT')), ms); }),
    ]);
    clearTimeout(timer);
    return { ok: true, value };
  } catch (e: any) {
    if (e?.message === 'ACK_TIMEOUT') return { ok: false };
    throw e;
  }
}

/* ===================== Config ===================== */

// Kratki timeout za begin/end, duži za assign/withdraw (po potrebi)
const ACK_TIMEOUT_BEGIN_MS = Number(process.env.XS3_ACK_TIMEOUT_BEGIN_MS ?? 750);
const ACK_TIMEOUT_END_MS   = Number(process.env.XS3_ACK_TIMEOUT_END_MS ?? 750);
const ACK_TIMEOUT_DEFAULT  = Number(process.env.XS3_ACK_TIMEOUT_MS ?? 10000);

const CONFIRM_TRIES    = Number(process.env.XS3_CONFIRM_TRIES ?? 5);
const CONFIRM_SLEEP_MS = Number(process.env.XS3_CONFIRM_SLEEP_MS ?? 200);

/* ===================== Service ===================== */

@Injectable()
export class Xs3CommandsService {
  private readonly logger = new Logger(Xs3CommandsService.name);

  constructor(
      private readonly client: Xs3Client,
      private readonly queries: Xs3QueriesService,
      private readonly state: Xs3StateService,
  ) {}

  private get io() { return this.client.io; }

  private resolveMediumId(mediumId?: string): string {
    const id = mediumId ?? this.state.snapshot.mediumId ?? null;
    if (!id) throw new ServiceUnavailableException('No mediumId provided and no current medium is set.');
    return id;
  }

  private isEvvaError(result: any): result is { error: number; reason?: string } {
    return result && typeof result === 'object' && typeof result.error === 'number';
  }

  private async confirmState(mediumId: string, predicate: (curr: any) => boolean) {
    for (let i = 0; i < CONFIRM_TRIES; i++) {
      const curr = await this.queries.getIdentificationMediumById(mediumId);
      if (predicate(curr)) return true;
      await delay(CONFIRM_SLEEP_MS);
    }
    return false;
  }

  async withdrawAuthorizationProfile(mediumId: string | undefined, profileId: string): Promise<CommandOutcome> {
    const id = this.resolveMediumId(mediumId);
    const current = await this.queries.getIdentificationMediumById(id);

    if (!current?.authorizationProfileId) {
      return { status: 'ok', mediumId: id, profileId, message: 'No authorization profile assigned (noop).' };
    }

    const cmd = this.io.commandCQRS('WithdrawAuthorizationProfileFromMediumMapi', {
      id, authorizationProfileId: profileId, commandId: uuidv4(),
    }) as Promise<any>;

    const ack = await awaitWithAckTimeout(cmd, ACK_TIMEOUT_DEFAULT);

    if (ack.ok && this.isEvvaError(ack.value)) {
      return { status: 'error', mediumId: id, profileId, errorCode: ack.value.error, reason: ack.value.reason, result: ack.value };
    }

    if (!ack.ok) {
      this.logger.warn(`WithdrawAuthorizationProfile ACK timed out. mediumId=${id}`);
      return { status: 'ok', mediumId: id, profileId, ackPending: true, propagationPending: true };
    }

    const confirmed = await this.confirmState(id, (c) => !c?.authorizationProfileId);
    return { status: 'ok', mediumId: id, profileId, result: ack.value, propagationPending: !confirmed };
  }

  async assignAuthorizationProfile(mediumId: string | undefined, profileId: string): Promise<CommandOutcome> {
    const id = this.resolveMediumId(mediumId);
    const current = await this.queries.getIdentificationMediumById(id);

    if (current?.authorizationProfileId === profileId) {
      return { status: 'ok', mediumId: id, profileId, message: 'Authorization profile already assigned (noop).' };
    }

    const cmd = this.io.commandCQRS('AssignAuthorizationProfileToMediumMapi', {
      id, authorizationProfileId: profileId, commandId: uuidv4(),
    }) as Promise<any>;

    const ack = await awaitWithAckTimeout(cmd, ACK_TIMEOUT_DEFAULT);

    if (ack.ok && this.isEvvaError(ack.value)) {
      return { status: 'error', mediumId: id, profileId, errorCode: ack.value.error, reason: ack.value.reason, result: ack.value };
    }

    if (!ack.ok) {
      this.logger.warn(`AssignAuthorizationProfile ACK timed out. mediumId=${id}`);
      return { status: 'ok', mediumId: id, profileId, ackPending: true, propagationPending: true };
    }

    const targetIdFromEvent = ack.value?.event?.authorizationProfileId ?? profileId;
    const confirmed = await this.confirmState(id, (c) => c?.authorizationProfileId === targetIdFromEvent);
    return { status: 'ok', mediumId: id, profileId: targetIdFromEvent, result: ack.value, propagationPending: !confirmed };
  }

  async setAccessBeginAt(mediumId: string | undefined, checkIn: string): Promise<CommandOutcome> {
    const id = this.resolveMediumId(mediumId);
    const current = await this.queries.getIdentificationMediumById(id);

    // 1) Normalizuj: UTC + floor na 5 min (XS3 praksa)
    const wanted = floorTo5MinUtc(toIsoUtc(checkIn));
    const have = currentBegin(current);

    // 2) NOOP prije slanja
    if (have && sameMinute(have, wanted)) {
      return { status: 'ok', mediumId: id, checkIn: have, message: 'Access begin already set (noop).' };
    }

    // 3) Pošalji komandu
    const cmd = this.io.commandCQRS('SetAccessBeginAtMapi', {
      id, accessBeginAt: wanted, commandId: uuidv4(),
    }) as Promise<any>;

    // 4) Kratki ACK timeout (nema 10s čekanja)
    const ack = await awaitWithAckTimeout(cmd, ACK_TIMEOUT_BEGIN_MS);

    if (ack.ok && this.isEvvaError(ack.value)) {
      return { status: 'error', mediumId: id, checkIn: wanted, errorCode: ack.value.error, reason: ack.value.reason, result: ack.value };
    }

    if (!ack.ok) {
      this.logger.warn(`SetAccessBeginAt ACK timed out (publish ok). mediumId=${id}`);
      return { status: 'ok', mediumId: id, checkIn: wanted, ackPending: true, propagationPending: true };
    }

    // 5) Brza potvrda (best-effort)
    const normalized = ack.value?.event?.accessBeginAt ?? wanted;
    const confirmed = await this.confirmState(id, (c) => sameMinute(currentBegin(c), normalized));
    return { status: 'ok', mediumId: id, checkIn: normalized, result: ack.value, propagationPending: !confirmed };
  }

  async setAccessEndAt(mediumId: string | undefined, checkOut: string): Promise<CommandOutcome> {
    const id = this.resolveMediumId(mediumId);
    const current = await this.queries.getIdentificationMediumById(id);

    // 1) Normalizuj: UTC + ceil na 5 min (XS3 praksa)
    const wanted = ceilTo5MinUtc(toIsoUtc(checkOut));
    const have = currentEnd(current);

    // 2) NOOP prije slanja
    if (have && sameMinute(have, wanted)) {
      return { status: 'ok', mediumId: id, checkOut: have, message: 'Access end already set (noop).' };
    }

    // 3) Pošalji komandu
    const cmd = this.io.commandCQRS('SetAccessEndAtMapi', {
      id, accessEndAt: wanted, commandId: uuidv4(),
    }) as Promise<any>;

    // 4) Kratki ACK timeout
    const ack = await awaitWithAckTimeout(cmd, ACK_TIMEOUT_END_MS);

    if (ack.ok && this.isEvvaError(ack.value)) {
      return { status: 'error', mediumId: id, checkOut: wanted, errorCode: ack.value.error, reason: ack.value.reason, result: ack.value };
    }

    if (!ack.ok) {
      this.logger.warn(`SetAccessEndAt ACK timed out (publish ok). mediumId=${id}`);
      return { status: 'ok', mediumId: id, checkOut: wanted, ackPending: true, propagationPending: true };
    }

    // 5) Brza potvrda (best-effort)
    const normalized = ack.value?.event?.accessEndAt ?? wanted;
    const confirmed = await this.confirmState(id, (c) => sameMinute(currentEnd(c), normalized));
    return { status: 'ok', mediumId: id, checkOut: normalized, result: ack.value, propagationPending: !confirmed };
  }
}
