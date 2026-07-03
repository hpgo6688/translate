import { type ReactNode, useEffect, useMemo, useState } from 'react';

import { PopupSwitch } from '@/components/ui/popup-switch';
import { SearchableSelect, type SelectOption } from '@/components/ui/searchable-select';
import { masterPasswordManager } from '@/core/keystore/master-password';
import { openExtensionSidePanel } from '@/entrypoints/sidepanel/actions';
import { usePopupStore } from '@/stores/popup';
import { liteLlmDefaults, normalizeLiteLlmConfig } from '@/utils/litellm-config';
import { onMessage, sendMessage } from '@/utils/messaging';
import './App.css';

type PreferenceRowProps = {
  label: string;
  trailing: ReactNode;
  disabled?: boolean;
  badge?: string;
};

function openGeneralOptionsPage(): void {
  const extensionChrome = (globalThis as {
    chrome?: {
      runtime?: { getURL?: (path: string) => string };
      tabs?: { create?: (options: { url: string }) => void };
    };
  }).chrome;
  const optionsUrl = extensionChrome?.runtime?.getURL?.('options.html#general') ?? '/options.html#general';
  if (extensionChrome?.tabs?.create) {
    extensionChrome.tabs.create({ url: optionsUrl });
    return;
  }
  window.open(optionsUrl, '_blank');
}

function PreferenceRow({ label, trailing, disabled = false, badge }: PreferenceRowProps) {
  return (
    <div className={`preference-row${disabled ? ' is-disabled' : ''}`}>
      <div className="preference-copy">
        <div className="preference-label-wrap">
          <p className="preference-label">{label}</p>
          {badge ? <span className="preference-badge">{badge}</span> : null}
        </div>
      </div>
      <div className="preference-control">{trailing}</div>
    </div>
  );
}

function App() {
  const [showUnlock, setShowUnlock] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [sourceLang, setSourceLang] = useState('auto');
  const [hoverMode, setHoverMode] = useState('option');
  const [siteMode, setSiteMode] = useState('always');
  const [hoverEnabled, setHoverEnabled] = useState(true);
  const [translateEnglishPages, setTranslateEnglishPages] = useState(false);
  const [llmEndpoint, setLlmEndpoint] = useState('');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [llmModel, setLlmModel] = useState('');
  const [llmTemperature, setLlmTemperature] = useState(String(liteLlmDefaults.temperature));
  const [llmMaxTokens, setLlmMaxTokens] = useState(String(liteLlmDefaults.maxTokens));
  const [llmTimeoutMs, setLlmTimeoutMs] = useState(String(liteLlmDefaults.timeoutMs));

  const {
    enabled,
    targetLang,
    providerId,
    selectionEnabled,
    selectionMode,
    setEnabled,
    setTargetLang,
    setProviderId,
    setSelectionEnabled,
    setSelectionMode,
  } = usePopupStore();

  const proProviderLocked = providerId !== 'deepl';

  const providerOptions = useMemo(
    () => [
      { id: 'google', label: 'Google' },
      { id: 'deepl', label: 'DeepL' },
      { id: 'deepseek', label: 'DeepSeek v4 Pro' },
      { id: 'llm', label: 'LiteLLM' },
    ],
    [],
  );
  const llmConfig = useMemo(
    () =>
      normalizeLiteLlmConfig({
        endpoint: llmEndpoint.trim(),
        apiKey: llmApiKey.trim(),
        model: llmModel.trim(),
        temperature: Number(llmTemperature),
        maxTokens: Number(llmMaxTokens),
        timeoutMs: Number(llmTimeoutMs),
      }),
    [llmApiKey, llmEndpoint, llmMaxTokens, llmModel, llmTemperature, llmTimeoutMs],
  );
  const sourceLangOptions = useMemo<SelectOption[]>(
    () => [
      { value: 'auto', label: 'Auto Detect' },
      { value: 'en', label: 'English' },
      { value: 'zh-CN', label: 'Simplified Chinese (简体中文)' },
      { value: 'zh-TW', label: 'Traditional Chinese (Taiwan) (繁體中文-台灣)' },
      { value: 'zh-HK', label: 'Traditional Chinese (Hong Kong) (繁體中文-香港)' },
      { value: 'ja', label: 'Japanese (日本語)' },
      { value: 'ko', label: 'Korean (한국어)' },
      { value: 'es', label: 'Spanish (Español)' },
      { value: 'de', label: 'German (Deutsch)' },
    ],
    [],
  );
  const targetLangOptions = useMemo<SelectOption[]>(
    () => sourceLangOptions.filter((item) => item.value !== 'auto'),
    [sourceLangOptions],
  );

  useEffect(() => {
    const remove = onMessage('NEEDS_UNLOCK', () => {
      setShowUnlock(true);
    });
    return remove;
  }, []);
  useEffect(() => {
    if (!llmConfig) {
      return;
    }
    const extensionChrome = (globalThis as {
      chrome?: { storage?: { sync?: { set?: (items: Record<string, unknown>) => Promise<void> } } };
    }).chrome;
    void extensionChrome?.storage?.sync?.set?.({ liteLlmConfig: llmConfig });
  }, [llmConfig]);
  useEffect(() => {
    const extensionChrome = (globalThis as {
      chrome?: { storage?: { sync?: { get?: (keys: string[]) => Promise<Record<string, unknown>> } } };
    }).chrome;
    void (async () => {
      const payload = await extensionChrome?.storage?.sync?.get?.(['liteLlmConfig']);
      const existing = normalizeLiteLlmConfig(payload?.liteLlmConfig);
      if (!existing) {
        return;
      }
      setLlmEndpoint(existing.endpoint);
      setLlmApiKey(existing.apiKey);
      setLlmModel(existing.model);
      setLlmTemperature(String(existing.temperature));
      setLlmMaxTokens(String(existing.maxTokens));
      setLlmTimeoutMs(String(existing.timeoutMs));
    })();
  }, []);

  return (
    <main className="popup-shell">
      <section className="p-[10px] popup-header">
        <div className="user-row">
          <div className="user-chip">
            <span className="avatar-dot" />
            <span>Guest</span>
          </div>
          <button className="upgrade-chip" type="button">
            Upgrade
          </button>
          <button
            className="app-chip cursor-pointer"
            type="button"
            onClick={() => {
              void openExtensionSidePanel();
            }}
          >
            App
          </button>
        </div>
      </section>

      <section className="p-[10px] popup-primary-flow">
        <div className="language-pair">
          <label className="field-block pair-item">
            <SearchableSelect
              value={sourceLang}
              options={sourceLangOptions}
              onChange={(next) => {
                setSourceLang(next);
              }}
            />
          </label>
          <div className="pair-arrow">→</div>
          <label className="field-block pair-item">
            <SearchableSelect
              value={targetLang}
              options={targetLangOptions}
              dropdownAlign="right"
              onChange={(next) => {
                void setTargetLang(next);
              }}
            />
          </label>
        </div>

        <div className="px-[10px] service-card py-[14px]">
          <label className="service-row">
            <span className="service-label">Service:</span>
            <select
              className="inline-select"
              value={providerId}
              onChange={(event) => {
                void setProviderId(event.target.value);
                if (event.target.value === 'llm' && llmConfig) {
                  const extensionChrome = (globalThis as {
                    chrome?: { storage?: { sync?: { set?: (items: Record<string, unknown>) => Promise<void> } } };
                  }).chrome;
                  void extensionChrome?.storage?.sync?.set?.({ liteLlmConfig: llmConfig });
                }
              }}
            >
              {providerOptions.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.id === 'google'
                    ? 'Free Translation Service'
                    : provider.id === 'deepl'
                      ? 'DeepL Pro'
                      : provider.id === 'deepseek'
                        ? 'DeepSeek v4 Pro'
                        : 'LiteLLM Custom'}
                </option>
              ))}
            </select>
          </label>
          {providerId === 'llm' ? (
            <>
              <label className="service-row muted">
                <span className="service-label">Endpoint:</span>
                <input className="inline-select" value={llmEndpoint} onChange={(event) => setLlmEndpoint(event.target.value)} />
              </label>
              <label className="service-row muted">
                <span className="service-label">API Key:</span>
                <input className="inline-select" type="password" value={llmApiKey} onChange={(event) => setLlmApiKey(event.target.value)} />
              </label>
              <label className="service-row muted">
                <span className="service-label">Model:</span>
                <input className="inline-select" value={llmModel} onChange={(event) => setLlmModel(event.target.value)} />
              </label>
              <label className="service-row muted">
                <span className="service-label">Temp/Tokens/Timeout:</span>
                <input
                  className="inline-select"
                  value={`${llmTemperature}/${llmMaxTokens}/${llmTimeoutMs}`}
                  onChange={(event) => {
                    const [temp, max, timeout] = event.target.value.split('/');
                    setLlmTemperature(temp ?? '');
                    setLlmMaxTokens(max ?? '');
                    setLlmTimeoutMs(timeout ?? '');
                  }}
                />
              </label>
              {!llmConfig ? <p className="text-xs text-red-600">LLM config invalid</p> : null}
            </>
          ) : null}
          <label className="service-row muted">
            <span className="service-label">AI Expert:</span>
            <select className="inline-select" defaultValue="general">
              <option value="general">General</option>
            </select>
          </label>
          <div className="service-row">
            <div className="preference-label-wrap">
              <span className="service-label">AI Context-Aware</span>
              <span className="preference-badge">Pro</span>
            </div>
            <PopupSwitch checked={false} disabled />
          </div>
        </div>

        <div className="cta-row">
          <button className="icon-cta" type="button" aria-label="switch direction">
            ⇄
          </button>
          <button
            className="translate-cta"
            onClick={() => {
              void setEnabled(true);
            }}
          >
            Translate
          </button>
        </div>
      </section>

      <section className="px-[10px] popup-preferences -mt-[12px]">
 
        <PreferenceRow
          label="Always translate this site"
          trailing={
            <div className="preference-actions">
              <select className="mini-select" value={siteMode} onChange={(event) => setSiteMode(event.target.value)}>
                <option value="always">Always translate this site</option>
                <option value="never">Never translate this site</option>
              </select>
              <PopupSwitch
                checked={enabled}
                onChange={(next) => {
                  void setEnabled(next);
                }}
              />
            </div>
          }
        />
        <PreferenceRow
          label="Hover: + ⌥ translate/restore this paragraph"
          trailing={
            <div className="preference-actions">
              <select className="mini-select" value={hoverMode} onChange={(event) => setHoverMode(event.target.value)}>
                <option value="ctrl">+ Ctrl translate/restore this paragraph</option>
                <option value="shift">+ Shift translate/restore this paragraph</option>
                <option value="option">+ ⌥ translate/restore this paragraph</option>
                <option value="hold">+ Hold left click immediately translate this paragraph</option>
              </select>
              <PopupSwitch
                checked={hoverEnabled}
                onChange={(next) => {
                  setHoverEnabled(next);
                }}
              />
            </div>
          }
        />
        <PreferenceRow
          label="Text selection translation: Show mini icon"
          trailing={
            <div className="preference-actions">
              <select
                className="mini-select"
                value={selectionMode}
                onChange={(event) => {
                  void setSelectionMode(event.target.value);
                }}
              >
                <option value="direct">Direct trigger</option>
                <option value="icon">Show icon</option>
                <option value="mini-icon">Show mini icon</option>
                <option value="ctrl">Press Ctrl to trigger</option>
                <option value="option">Press ⌥ to trigger</option>
                <option value="shift">Press Shift to trigger</option>
              </select>
              <PopupSwitch
                checked={selectionEnabled}
                onChange={(next) => {
                  void setSelectionEnabled(next);
                }}
              />
            </div>
          }
        />
        <PreferenceRow
          label="Always translate English pages"
          disabled={proProviderLocked}
          trailing={
            <PopupSwitch
              checked={translateEnglishPages}
              onChange={(next) => {
                setTranslateEnglishPages(next);
              }}
            />
          }
        />
      </section>

      <footer className="popup-footer">
        <button
          className="options-link cursor-pointer"
          type="button"
          onClick={() => {
            openGeneralOptionsPage();
          }}
        >
          Settings
        </button>
        <span className="footer-version">1.28.5</span>
        <button className="more-btn cursor-pointer" type="button">
          More
        </button>
      </footer>

      {showUnlock && (
        <div className="unlock-panel">
          <p className="unlock-title">Unlock required</p>
          <input
            type="password"
            className="unlock-input"
            value={unlockPassword}
            onChange={(event) => setUnlockPassword(event.target.value)}
            placeholder="Master password"
          />
          {unlockError ? <p className="unlock-error">{unlockError}</p> : null}
          <button
            className="unlock-btn"
            onClick={() => {
              void (async () => {
                try {
                  await masterPasswordManager.unlock(unlockPassword);
                  await sendMessage('UNLOCK_RESULT', {
                    ok: true,
                    password: unlockPassword,
                  });
                  setUnlockError(null);
                  setUnlockPassword('');
                  setShowUnlock(false);
                } catch {
                  setUnlockError('Incorrect password');
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
    </main>
  );
}

export default App;
