import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { z } from 'zod';

export const generalSchema = z.object({
  defaultSourceLang: z.string().min(2),
  defaultTargetLang: z.string().min(2),
  defaultProviderId: z.string().min(2),
  masterEnabled: z.boolean(),
});

export const displaySchema = z.object({
  displayMode: z.enum(['below', 'side-by-side', 'replace']),
  color: z.string().min(4),
  backgroundColor: z.string().transform((value) => {
    const normalized = value.trim();
    return normalized === '' ? 'transparent' : normalized;
  }),
  fontScale: z.number().min(50).max(150),
  decoration: z.enum(['none', 'underline', 'dashed-underline', 'wavy-underline', 'dashed-box']),
  blurPx: z.number().min(0).max(20),
});

export const shortcutsSchema = z.object({
  toggleTranslation: z.string().min(1),
  hoverTranslateHotkey: z.string().min(1),
});

export const cacheSchema = z.object({
  ttlDays: z.number().min(1).max(365),
  maxRecords: z.number().min(1000).max(1_000_000),
});

export const providerItemSchema = z.object({
  enabled: z.boolean(),
  requiresKey: z.boolean(),
  apiKey: z.string().optional(),
});

export const settingsSchema = z.object({
  general: generalSchema,
  display: displaySchema,
  shortcuts: shortcutsSchema,
  providers: z.record(z.string(), providerItemSchema),
  cache: cacheSchema,
  localeOverride: z.string().nullable(),
});

export type SettingsState = z.infer<typeof settingsSchema>;

type SettingsStore = SettingsState & {
  update: (partial: Partial<SettingsState>) => Promise<boolean>;
};

type ExtensionChrome = {
  storage: {
    sync: {
      set: (items: Record<string, unknown>) => Promise<void>;
    };
    onChanged: {
      addListener: (listener: (changes: Record<string, { newValue?: unknown }>, area: string) => void) => void;
      removeListener: (listener: (changes: Record<string, { newValue?: unknown }>, area: string) => void) => void;
    };
  };
};

function getChrome(): ExtensionChrome {
  const extensionChrome = (globalThis as { chrome?: ExtensionChrome }).chrome;
  if (!extensionChrome) {
    throw new Error('Chrome extension API unavailable');
  }
  return extensionChrome;
}

const initialSettings: SettingsState = {
  general: {
    defaultSourceLang: 'auto',
    defaultTargetLang: 'zh-CN',
    defaultProviderId: 'deepseek',
    masterEnabled: true,
  },
  display: {
    displayMode: 'below',
    color: '#334155',
    backgroundColor: 'transparent',
    fontScale: 100,
    decoration: 'none',
    blurPx: 0,
  },
  shortcuts: {
    toggleTranslation: 'Alt+A',
    hoverTranslateHotkey: 'Option',
  },
  providers: {
    deepseek: { enabled: true, requiresKey: true, apiKey: '' },
  },
  cache: {
    ttlDays: 30,
    maxRecords: 50_000,
  },
  localeOverride: null,
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      ...initialSettings,
      async update(partial) {
        const merged = { ...get(), ...partial };
        const parsed = settingsSchema.safeParse({
          general: merged.general,
          display: merged.display,
          shortcuts: merged.shortcuts,
          providers: merged.providers,
          cache: merged.cache,
          localeOverride: merged.localeOverride,
        });
        if (!parsed.success) {
          return false;
        }
        set(parsed.data);
        await getChrome().storage.sync.set({
          settings: parsed.data,
          providerConfigs: parsed.data.providers,
          translationStyle: parsed.data.display,
        });
        return true;
      },
    }),
    { name: 'settings-store' },
  ),
);

let stopSync: (() => void) | null = null;
export function startSettingsSync(): () => void {
  if (stopSync) {
    return stopSync;
  }
  const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area !== 'sync' || !changes.settings?.newValue) {
      return;
    }
    const parsed = settingsSchema.safeParse(changes.settings.newValue);
    if (parsed.success) {
      useSettingsStore.setState(parsed.data);
    }
  };
  getChrome().storage.onChanged.addListener(listener);
  stopSync = () => {
    getChrome().storage.onChanged.removeListener(listener);
    stopSync = null;
  };
  return stopSync;
}
