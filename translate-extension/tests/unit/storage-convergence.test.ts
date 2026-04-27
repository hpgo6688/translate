import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listenStyleChanges } from '@/core/dom/style-engine';
import { startPopupStorageSync, usePopupStore } from '@/stores/popup';
import { startSettingsSync, useSettingsStore } from '@/stores/settings';

type ChangeRecord = Record<string, { oldValue?: unknown; newValue?: unknown }>;
type ChangeListener = (changes: ChangeRecord, areaName: string) => void;

function createChromeMock() {
  const listeners = new Set<ChangeListener>();
  const syncState = new Map<string, unknown>();

  const emit = (changes: ChangeRecord) => {
    for (const listener of listeners) {
      listener(changes, 'sync');
    }
  };

  return {
    storage: {
      sync: {
        get() {
          return Object.fromEntries(syncState.entries());
        },
        set(values: Record<string, unknown>) {
          const changes: ChangeRecord = {};
          for (const [key, value] of Object.entries(values)) {
            changes[key] = { oldValue: syncState.get(key), newValue: value };
            syncState.set(key, value);
          }
          emit(changes);
          return Promise.resolve();
        },
      },
      onChanged: {
        addListener(listener: ChangeListener) {
          listeners.add(listener);
        },
        removeListener(listener: ChangeListener) {
          listeners.delete(listener);
        },
      },
    },
  };
}

describe('storage convergence', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.documentElement.innerHTML = '<body><article><p>test</p></article></body>';
    (globalThis as { chrome?: unknown }).chrome = createChromeMock();
    usePopupStore.setState({ enabled: false, targetLang: 'zh-CN', providerId: 'google' });
    useSettingsStore.setState({
      ...useSettingsStore.getState(),
      display: {
        displayMode: 'below',
        color: '#334155',
        backgroundColor: '#ffffff',
        fontScale: 100,
        decoration: 'none',
        blurPx: 0,
      },
    });
  });

  it('converges popup/options/content listeners within 1 second', async () => {
    const stopPopup = startPopupStorageSync();
    const stopSettings = startSettingsSync();
    let updatedColor = '';
    const stopStyle = listenStyleChanges((style) => {
      updatedColor = style.color;
    });

    const startedAt = Date.now();
    await (globalThis as unknown as { chrome: ReturnType<typeof createChromeMock> }).chrome.storage.sync.set({
      popupEnabled: true,
      popupTargetLang: 'ja',
      popupProviderId: 'deepl',
      settings: {
        ...useSettingsStore.getState(),
        display: {
          displayMode: 'side-by-side',
          color: '#0f172a',
          backgroundColor: '#f8fafc',
          fontScale: 95,
          decoration: 'underline',
          blurPx: 0,
        },
      },
      translationStyle: {
        color: '#0f172a',
        backgroundColor: '#f8fafc',
        fontScale: 95,
        decoration: 'underline',
        blurPx: 0,
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    const elapsed = Date.now() - startedAt;

    expect(elapsed).toBeLessThanOrEqual(1000);
    expect(usePopupStore.getState().enabled).toBe(true);
    expect(usePopupStore.getState().targetLang).toBe('ja');
    expect(usePopupStore.getState().providerId).toBe('deepl');
    expect(useSettingsStore.getState().display.displayMode).toBe('side-by-side');
    expect(updatedColor).toBe('#0f172a');

    stopStyle();
    stopSettings();
    stopPopup();
  });
});
