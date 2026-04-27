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
const hoverHotkeyOptions = ['Option', 'Control', 'Shift'] as const;
const validRoutes: Route[] = ['general', 'display', 'shortcuts', 'providers', 'cache', 'about'];

function isRoute(value: string): value is Route {
  return validRoutes.some((route) => route === value);
}

function normalizeRouteFromHash(hash: string): Route {
  const normalized = hash.replace(/^#/, '').trim().toLowerCase();
  return isRoute(normalized) ? normalized : 'general';
}

function shellSectionClass(route: Route, activeRoute: Route): string {
  return route === activeRoute ? 'block' : 'hidden';
}

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
  const [route, setRoute] = useState<Route>(() => normalizeRouteFromHash(window.location.hash));
  const [shortcutWarning, setShortcutWarning] = useState<string | null>(null);
  const [unlockBannerVisible, setUnlockBannerVisible] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
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
  const reportSaveResult = (ok: boolean): void => {
    setSaveNotice(ok ? 'Saved.' : 'Save failed: invalid values.');
    setTimeout(() => setSaveNotice(null), 1600);
  };
  useEffect(() => {
    return onMessage('NEEDS_UNLOCK', () => {
      setUnlockBannerVisible(true);
    });
  }, []);
  useEffect(() => {
    const syncFromHash = (): void => {
      setRoute(normalizeRouteFromHash(window.location.hash));
    };
    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => {
      window.removeEventListener('hashchange', syncFromHash);
    };
  }, []);
  const changeRoute = (nextRoute: Route): void => {
    if (window.location.hash !== `#${nextRoute}`) {
      window.location.hash = nextRoute;
    } else {
      setRoute(nextRoute);
    }
  };
  const submitGeneral: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    void generalForm.handleSubmit((values) => {
      runAsync(async () => {
        const ok = await settings.update({ general: values });
        reportSaveResult(ok);
      });
    })(event);
  };
  const submitDisplay: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    void displayForm.handleSubmit((values) => {
      runAsync(async () => {
        const ok = await settings.update({ display: values });
        reportSaveResult(ok);
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
        const ok = await settings.update({ shortcuts: values });
        reportSaveResult(ok);
      });
    })(event);
  };
  const submitCache: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    void cacheForm.handleSubmit((values) => {
      runAsync(async () => {
        const ok = await settings.update({ cache: values });
        reportSaveResult(ok);
      });
    })(event);
  };

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
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
                  changeRoute('providers');
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
      {saveNotice ? (
        <p className="mb-3 rounded border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-800">
          {saveNotice}
        </p>
      ) : null}
      <div className="mx-auto grid w-full max-w-6xl gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Categories</p>
          <nav className="space-y-1">
            {nav.map(([id, label]) => (
              <button
                key={id}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                  route === id
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
                onClick={() => changeRoute(id)}
              >
                {label}
              </button>
            ))}
          </nav>
        </aside>

        <section className="space-y-4">
          <header className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Settings</p>
            <h2 className="mt-1 text-lg font-semibold capitalize">{route}</h2>
          </header>

          <section className={`${shellSectionClass('general', route)} rounded-2xl border border-slate-200 bg-white p-5 shadow-sm`}>
            <h3 className="mb-4 text-base font-semibold">General</h3>
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
          </section>

          <section className={`${shellSectionClass('display', route)} rounded-2xl border border-slate-200 bg-white p-5 shadow-sm`}>
            <h3 className="mb-4 text-base font-semibold">Display</h3>
            <form className="space-y-2" onSubmit={submitDisplay}>
              <select {...displayForm.register('displayMode')} className="w-full rounded border p-2">
                <option value="below">below</option>
                <option value="side-by-side">side-by-side</option>
                <option value="replace">replace</option>
              </select>
              <input {...displayForm.register('color')} placeholder="#334155" className="w-full rounded border p-2" />
              <input
                {...displayForm.register('backgroundColor')}
                placeholder="transparent (leave empty)"
                className="w-full rounded border p-2"
              />
              <input
                type="number"
                min={50}
                max={150}
                step={1}
                {...displayForm.register('fontScale', { valueAsNumber: true })}
                className="w-full rounded border p-2"
                placeholder="Font scale 50-150"
              />
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
          </section>

          <section className={`${shellSectionClass('shortcuts', route)} rounded-2xl border border-slate-200 bg-white p-5 shadow-sm`}>
            <h3 className="mb-4 text-base font-semibold">Shortcuts</h3>
            <form className="space-y-2" onSubmit={submitShortcuts}>
              <input {...shortcutsForm.register('toggleTranslation')} className="w-full rounded border p-2" />
              <label className="block text-sm font-medium">Hover translate hotkey</label>
              <select {...shortcutsForm.register('hoverTranslateHotkey')} className="w-full rounded border p-2">
                {hoverHotkeyOptions.map((keyName) => (
                  <option key={keyName} value={keyName}>
                    {keyName}
                  </option>
                ))}
              </select>
              {shortcutWarning ? <p className="text-xs text-amber-700">{shortcutWarning}</p> : null}
              <button className="rounded bg-slate-900 px-3 py-1 text-white">Save Shortcuts</button>
            </form>
          </section>

          <section className={`${shellSectionClass('providers', route)} rounded-2xl border border-slate-200 bg-white p-5 shadow-sm`}>
            <h3 className="mb-4 text-base font-semibold">Providers</h3>
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
          </section>

          <section className={`${shellSectionClass('cache', route)} rounded-2xl border border-slate-200 bg-white p-5 shadow-sm`}>
            <h3 className="mb-4 text-base font-semibold">Cache</h3>
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
          </section>

          <section className={`${shellSectionClass('about', route)} rounded-2xl border border-slate-200 bg-white p-5 shadow-sm`}>
            <h3 className="mb-4 text-base font-semibold">About</h3>
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
          </section>

          {route !== 'general' && (
            <section className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-5 text-sm text-slate-600">
              This section uses the first-pass shell layout. More detailed controls will be added incrementally.
            </section>
          )}
        </section>
      </div>
    </main>
  );
}
