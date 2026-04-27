import { type FormEventHandler, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { cacheDb } from '@/core/cache/db';
import { masterPasswordManager } from '@/core/keystore/master-password';
import { providerKeyStore } from '@/core/keystore/provider-keys';
import {
  cacheSchema,
  displaySchema,
  generalSchema,
  shortcutsSchema,
  useSettingsStore,
} from '@/stores/settings';
import { setupI18n } from '@/utils/i18n';
import { onMessage, sendMessage } from '@/utils/messaging';

type Route = 'general' | 'display' | 'shortcuts' | 'providers' | 'cache' | 'about';

type ExtensionChrome = {
  runtime: {
    getManifest: () => { version: string };
  };
};

function getChrome(): ExtensionChrome {
  const extensionChrome = (globalThis as { chrome?: ExtensionChrome }).chrome;
  if (!extensionChrome) {
    throw new Error('Chrome extension API unavailable');
  }
  return extensionChrome;
}

export default function App() {
  const [route, setRoute] = useState<Route>('general');
  const [shortcutWarning, setShortcutWarning] = useState<string | null>(null);
  const [unlockBannerVisible, setUnlockBannerVisible] = useState(false);
  const settings = useSettingsStore();

  const nav = useMemo(
    () =>
      ([
        ['general', 'General'],
        ['display', 'Display'],
        ['shortcuts', 'Shortcuts'],
        ['providers', 'Providers'],
        ['cache', 'Cache'],
        ['about', 'About'],
      ] satisfies Array<[Route, string]>),
    [],
  );

  const generalForm = useForm({
    resolver: zodResolver(generalSchema),
    defaultValues: settings.general,
  });
  const displayForm = useForm({
    resolver: zodResolver(displaySchema),
    defaultValues: settings.display,
  });
  const shortcutsForm = useForm({
    resolver: zodResolver(shortcutsSchema),
    defaultValues: settings.shortcuts,
  });
  const cacheForm = useForm({
    resolver: zodResolver(cacheSchema),
    defaultValues: settings.cache,
  });

  const enabledProviders = Object.entries(settings.providers).filter(([, config]) => config.enabled);
  const runAsync = (task: () => Promise<void>): void => {
    void task();
  };
  useEffect(() => {
    return onMessage('NEEDS_UNLOCK', () => {
      setUnlockBannerVisible(true);
    });
  }, []);
  const submitGeneral: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    void generalForm.handleSubmit((values) => {
      runAsync(async () => {
        await settings.update({ general: values });
      });
    })(event);
  };
  const submitDisplay: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    void displayForm.handleSubmit((values) => {
      runAsync(async () => {
        await settings.update({ display: values });
      });
    })(event);
  };
  const submitShortcuts: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    void shortcutsForm.handleSubmit((values) => {
      runAsync(async () => {
        const commandApi = (globalThis as { chrome?: { commands?: { getAll: () => Promise<Array<{ shortcut?: string }> > } } }).chrome?.commands;
        if (commandApi) {
          const commands = await commandApi.getAll();
          const conflict = commands.some(
            (command) =>
              command.shortcut &&
              command.shortcut === values.toggleTranslation &&
              values.toggleTranslation !== 'Alt+A',
          );
          if (conflict) {
            setShortcutWarning('Shortcut conflict detected, fallback to Alt+A');
            values.toggleTranslation = 'Alt+A';
          } else {
            setShortcutWarning(null);
          }
        }
        await settings.update({ shortcuts: values });
      });
    })(event);
  };
  const submitCache: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    void cacheForm.handleSubmit((values) => {
      runAsync(async () => {
        await settings.update({ cache: values });
      });
    })(event);
  };

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-900">
      {unlockBannerVisible && (
        <div className="mb-3 rounded border border-amber-300 bg-amber-50 p-2 text-sm">
          Unlock required for encrypted provider keys.
          <button
            className="ml-2 rounded border px-2 py-0.5"
            onClick={() => {
              void (async () => {
                const password = window.prompt('Unlock master password');
                if (!password) {
                  return;
                }
                try {
                  await masterPasswordManager.unlock(password);
                  await sendMessage('UNLOCK_RESULT', { ok: true, password });
                  setUnlockBannerVisible(false);
                  setRoute('providers');
                } catch {
                  await sendMessage('UNLOCK_RESULT', {
                    ok: false,
                    error: 'Incorrect password',
                  });
                }
              })();
            }}
          >
            Unlock
          </button>
        </div>
      )}
      <h1 className="mb-4 text-xl font-semibold">Options</h1>
      <div className="mb-4 flex gap-2">
        {nav.map(([id, label]) => (
          <button
            key={id}
            className={`rounded px-3 py-1 text-sm ${route === id ? 'bg-slate-900 text-white' : 'bg-white'}`}
            onClick={() => setRoute(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {route === 'general' && (
        <form className="space-y-2" onSubmit={submitGeneral}>
          <input {...generalForm.register('defaultSourceLang')} placeholder="default source (auto)" className="w-full rounded border p-2" />
          <input {...generalForm.register('defaultTargetLang')} placeholder="default target" className="w-full rounded border p-2" />
          <select {...generalForm.register('defaultProviderId')} className="w-full rounded border p-2">
            <option value="google">Google</option>
            <option value="deepl">DeepL</option>
          </select>
          <label className="flex items-center gap-2">
            <input type="checkbox" {...generalForm.register('masterEnabled')} /> master enable
          </label>
          <button className="rounded bg-slate-900 px-3 py-1 text-white">Save General</button>
        </form>
      )}

      {route === 'display' && (
        <form className="space-y-2" onSubmit={submitDisplay}>
          <select {...displayForm.register('displayMode')} className="w-full rounded border p-2">
            <option value="below">below</option>
            <option value="side-by-side">side-by-side</option>
            <option value="replace">replace</option>
          </select>
          <input {...displayForm.register('color')} placeholder="#334155" className="w-full rounded border p-2" />
          <input type="number" {...displayForm.register('fontScale', { valueAsNumber: true })} className="w-full rounded border p-2" />
          <select {...displayForm.register('decoration')} className="w-full rounded border p-2">
            <option value="none">none</option>
            <option value="underline">underline</option>
            <option value="dashed-underline">dashed-underline</option>
            <option value="wavy-underline">wavy-underline</option>
            <option value="dashed-box">dashed-box</option>
          </select>
          <input type="number" {...displayForm.register('blurPx', { valueAsNumber: true })} className="w-full rounded border p-2" />
          <button className="rounded bg-slate-900 px-3 py-1 text-white">Save Display</button>
        </form>
      )}

      {route === 'shortcuts' && (
        <form className="space-y-2" onSubmit={submitShortcuts}>
          <input {...shortcutsForm.register('toggleTranslation')} className="w-full rounded border p-2" />
          {shortcutWarning ? <p className="text-xs text-amber-700">{shortcutWarning}</p> : null}
          <button className="rounded bg-slate-900 px-3 py-1 text-white">Save Shortcuts</button>
        </form>
      )}

      {route === 'providers' && (
        <section className="space-y-3">
          {Object.entries(settings.providers).map(([providerId, config]) => (
            <div key={providerId} className="rounded border bg-white p-3">
              <div className="flex items-center justify-between">
                <span>{providerId}</span>
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(event) => {
                    runAsync(async () => {
                      await settings.update({
                        providers: {
                          ...settings.providers,
                          [providerId]: {
                            ...config,
                            enabled: event.target.checked,
                          },
                        },
                      });
                    });
                  }}
                />
              </div>
              {config.requiresKey && (
                <div className="mt-2 flex gap-2">
                  <input
                    type="password"
                    placeholder={`${providerId} api key`}
                    className="flex-1 rounded border p-2"
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') {
                        return;
                      }
                      runAsync(async () => {
                        const value = (event.target as HTMLInputElement).value.trim();
                        if (!value) {
                          return;
                        }
                        if (!masterPasswordManager.getKey()) {
                          const pwd = window.prompt('Unlock master password');
                          if (!pwd) {
                            return;
                          }
                          await masterPasswordManager.unlock(pwd);
                        }
                        await providerKeyStore.setProviderKey(providerId, value);
                        (event.target as HTMLInputElement).value = '';
                      });
                    }}
                  />
                </div>
              )}
            </div>
          ))}

          <div className="rounded border bg-white p-3">
            <p className="mb-1 text-sm">Default provider</p>
            <select
              className="w-full rounded border p-2"
              value={settings.general.defaultProviderId}
              onChange={(event) => {
                runAsync(async () => {
                  await settings.update({
                    general: {
                      ...settings.general,
                      defaultProviderId: event.target.value,
                    },
                  });
                });
              }}
            >
              {enabledProviders.map(([providerId]) => (
                <option key={providerId} value={providerId}>
                  {providerId}
                </option>
              ))}
            </select>
          </div>
        </section>
      )}

      {route === 'cache' && (
        <form className="space-y-2" onSubmit={submitCache}>
          <input type="number" {...cacheForm.register('ttlDays', { valueAsNumber: true })} className="w-full rounded border p-2" />
          <input type="number" {...cacheForm.register('maxRecords', { valueAsNumber: true })} className="w-full rounded border p-2" />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded border px-3 py-1" onClick={() => void cacheDb.clearByProvider('google')}>
              Clear Google cache
            </button>
            <button type="button" className="rounded border px-3 py-1" onClick={() => void cacheDb.clearByLanguagePair('en', 'zh-CN')}>
              Clear en→zh-CN
            </button>
            <button type="button" className="rounded border px-3 py-1" onClick={() => void cacheDb.clearAll()}>
              Clear all cache
            </button>
          </div>
          <button className="rounded bg-slate-900 px-3 py-1 text-white">Save Cache</button>
        </form>
      )}

      {route === 'about' && (
        <section className="space-y-2 rounded border bg-white p-3">
          <p>Version: {getChrome().runtime.getManifest().version}</p>
          <a href="https://wxt.dev" className="text-blue-600 underline">
            Documentation
          </a>
          <button
            className="rounded border px-3 py-1"
            onClick={() => {
              runAsync(async () => {
                const lng = settings.localeOverride === 'en' ? 'zh-CN' : 'en';
                await setupI18n({ languageOverride: lng });
                await settings.update({ localeOverride: lng });
              });
            }}
          >
            Toggle locale override
          </button>
        </section>
      )}
    </main>
  );
}
