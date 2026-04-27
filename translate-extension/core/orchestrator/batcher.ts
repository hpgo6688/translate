import { normalize } from '@/utils/normalize';

export type BatchSegment = {
  id: string;
  text: string;
};

const MAX_SEGMENTS = 50;
const MAX_CHARS = 4000;

export function splitIntoBatches(segments: BatchSegment[]): BatchSegment[][] {
  const batches: BatchSegment[][] = [];
  let current: BatchSegment[] = [];
  let currentChars = 0;

  for (const segment of segments) {
    const chars = normalize(segment.text).length;
    const exceedsCount = current.length >= MAX_SEGMENTS;
    const exceedsChars = currentChars + chars > MAX_CHARS;
    if (current.length > 0 && (exceedsCount || exceedsChars)) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(segment);
    currentChars += chars;
  }

  if (current.length > 0) {
    batches.push(current);
  }
  return batches;
}

export class DebouncedBatcher {
  private queue: BatchSegment[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly flushMs: number,
    private readonly onFlush: (batches: BatchSegment[][]) => void,
  ) {}

  push(segments: BatchSegment[]): void {
    this.queue.push(...segments);
    if (this.timer) {
      return;
    }
    this.timer = setTimeout(() => this.flush(), this.flushMs);
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.queue.length === 0) {
      return;
    }
    const queued = this.queue;
    this.queue = [];
    this.onFlush(splitIntoBatches(queued));
  }
}
