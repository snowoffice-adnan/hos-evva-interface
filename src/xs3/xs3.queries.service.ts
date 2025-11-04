import { Injectable } from '@nestjs/common';
import { Xs3Client } from './xs3.client';

type AnyPage = any;

@Injectable()
export class Xs3QueriesService {

  constructor(private readonly client: Xs3Client) {}

  private get io() {
    return this.client.io;
  }

  private extractItems(res: AnyPage): any[] {
    if (Array.isArray(res)) {
      for (const part of res) {
        const items = part?.items ?? part?.response?.data ?? part?.data;
        if (Array.isArray(items) && items.length) return items;
      }
      return [];
    }
    const items = res?.items ?? res?.response?.data ?? res?.data;
    return Array.isArray(items) ? items : [];
  }

  private async querySimple(res: string, offset = 0, limit = 200) {
    return this.io.queryPaged({ res, offset, limit, filters: [] } as any);
  }

  listAuthorizationProfiles(o = 0, l = 200) {
    return this.querySimple('authorization-profiles', o, l);
  }

  listIdentificationMedia(o = 0, l = 200) {
    return this.querySimple('identification-media', o, l);
  }

  listEvvaComponents(o = 0, l = 200) {
    return this.querySimple('evva-components', o, l);
  }

  async getIdentificationMediumById(id: string) {
    const pageLimit = 500;
    const res = await this.io.queryPaged({
      res: 'identification-media',
      offset: 0,
      limit: pageLimit,
      filters: [],
    } as any);

    const items = this.extractItems(res);
    return (items as any[]).find((m) => m?.id === id) ?? null;
  }

  async findMediumIdByHardwareId(hardwareId: string): Promise<string | null> {
    if (!hardwareId) return null;

    const res = await this.io.queryPaged({
      res: 'identification-media',
      offset: 0,
      limit: 1,
      filters: [{ field: 'hardwareId', type: 'eq', op: 'eq', value: hardwareId }],
    } as any);

    const items = this.extractItems(res);
    return items?.[0]?.id ?? null;
  }
}
