import Dexie, { type Table } from 'dexie';

export type UsageCounter = {
  provider: string;
  monthKey: string;
  charsSubmitted: number;
  requestCount: number;
  successCount: number;
  failureCount: number;
};

class UsageDb extends Dexie {
  counters!: Table<UsageCounter, [string, string]>;

  constructor(name = 'usage-meter') {
    super(name);
    this.version(1).stores({
      counters: '[provider+monthKey],provider,monthKey',
    });
  }
}

function currentMonthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export class UsageMeter {
  private db: UsageDb;

  constructor(dbName?: string) {
    this.db = new UsageDb(dbName);
  }

  async increment(input: {
    provider: string;
    charsSubmitted: number;
    success: boolean;
    at?: Date;
  }): Promise<void> {
    const monthKey = currentMonthKey(input.at);
    const existing = await this.db.counters.get([input.provider, monthKey]);
    const next: UsageCounter = {
      provider: input.provider,
      monthKey,
      charsSubmitted: (existing?.charsSubmitted ?? 0) + input.charsSubmitted,
      requestCount: (existing?.requestCount ?? 0) + 1,
      successCount: (existing?.successCount ?? 0) + (input.success ? 1 : 0),
      failureCount: (existing?.failureCount ?? 0) + (input.success ? 0 : 1),
    };
    await this.db.counters.put(next);
  }

  async readCurrentMonth(provider: string, at?: Date): Promise<UsageCounter> {
    const monthKey = currentMonthKey(at);
    return (
      (await this.db.counters.get([provider, monthKey])) ?? {
        provider,
        monthKey,
        charsSubmitted: 0,
        requestCount: 0,
        successCount: 0,
        failureCount: 0,
      }
    );
  }
}

export const usageMeter = new UsageMeter();
