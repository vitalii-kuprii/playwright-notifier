import type { NormalizedSummary } from '../types';

export abstract class BaseChannel {
  abstract readonly name: string;

  abstract send(summary: NormalizedSummary): Promise<void>;
}
