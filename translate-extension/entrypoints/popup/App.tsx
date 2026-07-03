import { type ReactNode, useMemo, useState } from 'react';

import { ProviderSetupBanner } from '@/components/provider-setup-banner';
import { PopupSwitch } from '@/components/ui/popup-switch';
import { SearchableSelect, type SelectOption } from '@/components/ui/searchable-select';
import { openExtensionSidePanel } from '@/entrypoints/sidepanel/actions';
import { useProviderConfigured } from '@/hooks/use-provider-configured';
import { usePopupStore } from '@/stores/popup';
import { openOptionsPage } from '@/utils/open-options-page';
import './App.css';

type PreferenceRowProps = {
  label: string;
  trailing: ReactNode;
  disabled?: boolean;
  badge?: string;
};

function openGeneralOptionsPage(): void {
  void openOptionsPage('general');
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
  const [sourceLang, setSourceLang] = useState('auto');
  const [hoverMode, setHoverMode] = useState('option');
  const [siteMode, setSiteMode] = useState('always');
  const [hoverEnabled, setHoverEnabled] = useState(true);
  const [translateEnglishPages, setTranslateEnglishPages] = useState(false);

  const {
    enabled,
    targetLang,
    selectionEnabled,
    selectionMode,
    setEnabled,
    setTargetLang,
    setSelectionEnabled,
    setSelectionMode,
  } = usePopupStore();
  const providerConfigured = useProviderConfigured();
  const needsProviderSetup = providerConfigured === false;

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

      {needsProviderSetup ? <ProviderSetupBanner variant="popup" /> : null}

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
          <div className="service-row">
            <span className="service-label">Service:</span>
            <span className="inline-select">DeepSeek v4 Pro</span>
          </div>
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
              if (needsProviderSetup) {
                void openOptionsPage('providers');
                return;
              }
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
    </main>
  );
}

export default App;
