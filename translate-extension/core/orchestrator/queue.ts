import PQueue from 'p-queue';

export class LocalRateLimitedError extends Error {
  constructor(message = 'Too many local queued requests') {
    super(message);
    this.name = 'LocalRateLimitedError';
  }
}

export class OrchestratorQueue {
  private readonly queue: PQueue;

  constructor(
    concurrency = 4,
    private readonly queueLimit = 50,
    qps = 10,
  ) {
    this.queue = new PQueue({
      concurrency,
      interval: 1000,
      intervalCap: qps,
      carryoverConcurrencyCount: true,
    });
  }

  get size(): number {
    return this.queue.size;
  }

  async add<T>(job: () => Promise<T>): Promise<T> {
    if (this.queue.size + this.queue.pending >= this.queueLimit) {
      throw new LocalRateLimitedError('RATE_LIMITED_LOCAL');
    }
    return this.queue.add(job);
  }
}
