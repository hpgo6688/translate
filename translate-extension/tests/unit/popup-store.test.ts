import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePopupStore } from '@/stores/popup';

describe('popup store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const query = vi.fn().mockResolvedValue([{ id: 123 }]);
    const set = vi.fn().mockResolvedValue(undefined);
    (globalThis as { chrome?: unknown }).chrome = {
      tabs: { sendMessage, query },
      storage: {
        sync: {
          set,
          get: vi.fn().mockResolvedValue({}),
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
    };
  });

  it('toggle on dispatches translation start within 500ms', async () => {
    await usePopupStore.getState().setEnabled(true);
    await vi.advanceTimersByTimeAsync(500);
    await Promise.resolve();
    const chromeMock = (globalThis as unknown as {
      chrome: { tabs: { sendMessage: ReturnType<typeof vi.fn> } };
    }).chrome;
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(123, {
      type: 'POPUP_TRANSLATE_START',
    });
  });
});
