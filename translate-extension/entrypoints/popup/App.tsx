import { type ReactNode, useEffect, useMemo, useState } from 'react';

import { PopupSwitch } from '@/components/ui/popup-switch';
import { SearchableSelect, type SelectOption } from '@/components/ui/searchable-select';
import { masterPasswordManager } from '@/core/keystore/master-password';
import { usePopupStore } from '@/stores/popup';
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
    ],
    [],
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
          <div className="app-chip">App</div>
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
              }}
            >
              {providerOptions.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label === 'Google' ? 'Free Translation Service' : 'DeepL Pro'}
                </option>
              ))}
            </select>
          </label>
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
