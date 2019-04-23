import { createHash } from 'crypto';

export interface LocatedCRO {
  name: string;
  type: 'cro_info';
  website: string;
  country: string;
  descriptions: string[];
}

export class CROIndex {
  private ids: Set<string> =  new Set();
  private entities: {[k: string]: LocatedCRO} = {};

  constructor(entities?: {[k: string]: LocatedCRO}) {
    if (entities) {
      this.ids = new Set(Object.keys(entities));
      this.entities = entities;
    }
  }

  public insert(cro: LocatedCRO): void {
    const hash = createHash('sha256');
    hash.update(JSON.stringify(cro));
    const key = hash.digest('hex');

    if (this.ids.has(key)) {
      throw new Error('Existing key');
    }

    this.ids.add(key);
    this.entities[key] = cro;
  }

  public count(): number {
    return this.ids.size;
  }

  public toJSON() {
    return this.entities;
  }
}
