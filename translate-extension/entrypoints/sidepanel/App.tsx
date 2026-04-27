import { useEffect, useMemo, useState } from 'react';

import { LanguageSelect } from '@/components/ui/language-select';
import { usePopupStore } from '@/stores/popup';
import { sendMessage } from '@/utils/messaging';
import { requestSidePanelTranslation } from './actions';

type ExtensionChrome = {
  storage?: {
    sync?: {
      get?: (keys: string[]) => Promise<Record<string, unknown>>;
    };
  };
};

type ServiceMenuItem = {
  id: string;
  label: string;
  group: 'free' | 'pro';
  badge?: string;
  icon: string;
  providerId?: string;
  disabled?: boolean;
};

function getChrome(): ExtensionChrome {
  return (globalThis as { chrome?: ExtensionChrome }).chrome ?? {};
}

async function readProAvailability(): Promise<boolean> {
  const payload = await getChrome().storage?.sync?.get?.(['settings']);
  const settings = payload?.settings as { providers?: Record<string, { enabled?: boolean }> } | undefined;
  return Boolean(settings?.providers?.deepl?.enabled);
}

function App() {
  const { providerId, setProviderId } = usePopupStore();
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('zh-CN');
  const [sourceText, setSourceText] = useState('');
  const [resultText, setResultText] = useState('');
  const [showServiceMenu, setShowServiceMenu] = useState(false);
  const [isProUser, setIsProUser] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const serviceOptions = useMemo<ServiceMenuItem[]>(
    () => [
      { id: 'free-service', label: 'Free Translation Service', group: 'free', icon: '⭐', providerId: 'google' },
      { id: 'google', label: 'Google Translate', group: 'free', icon: '🌐', providerId: 'google' },
      { id: 'microsoft', label: 'Microsoft Translator', group: 'free', icon: '🪟', disabled: true },
      { id: 'deepseek', label: 'DeepSeek-V3.2', group: 'pro', badge: 'Pro', icon: '🌀', disabled: true },
      { id: 'gpt5', label: 'GPT-5 mini', group: 'pro', badge: 'Pro', icon: '◎', disabled: true },
      { id: 'claude', label: 'Claude Haiku 4.5', group: 'pro', badge: 'Pro', icon: '✺', disabled: true },
      { id: 'gemini', label: 'Gemini 3 Flash', group: 'pro', badge: 'Pro', icon: '✦', disabled: true },
      { id: 'grok', label: 'Grok 4.1 Fast', group: 'pro', badge: 'Pro', icon: '◉', disabled: true },
      {
        id: 'deepl',
        label: 'DeepL Pro',
        group: 'pro',
        badge: 'Pro',
        icon: '◆',
        providerId: 'deepl',
        disabled: !isProUser,
      },
      { id: 'glm', label: 'GLM-4.7', group: 'pro', badge: 'Pro', icon: '⬡', disabled: true },
      { id: 'qwen', label: 'Qwen 3.5 Plus', group: 'pro', badge: 'Pro', icon: '◍', disabled: true },
    ],
    [isProUser],
  );

  const selectedServiceId = useMemo(() => {
    if (providerId === 'deepl') {
      return 'deepl';
    }
    return 'google';
  }, [providerId]);

  useEffect(() => {
    void (async () => {
      const proAvailable = await readProAvailability();
      setIsProUser(proAvailable);
    })();
  }, []);

  useEffect(() => {
    if (providerId === 'deepl' && !isProUser) {
      void setProviderId('google');
    }
  }, [providerId, isProUser, setProviderId]);

  return (
    <main className="sidepanel-shell">
      <section className="panel-body">
        <header className="panel-topbar">
          <div className="panel-brand">🔠 Immersive Translate - Translate Web & PDF</div>
          <div className="panel-top-actions">
            <button type="button">✕</button>
          </div>
        </header>
        <div className="panel-content">
          <div className="workspace">
          <header className="sidepanel-header">
            <div className="title-wrap">
              <h1>Translate text</h1>
              <button type="button" className="icon-mini" aria-label="expand">
                ↗
              </button>
            </div>
            <div className="header-actions">
              <button
                type="button"
                className="service-trigger"
                onClick={() => {
                  setShowServiceMenu((prev) => !prev);
                }}
                aria-expanded={showServiceMenu}
              >
                🌎
              </button>
              <button type="button" className="service-arrow" aria-label="toggle service menu">
                ▾
              </button>
              {showServiceMenu ? (
                <div className="service-menu">
                  <p className="service-group-title">Free User</p>
                  {serviceOptions
                    .filter((item) => item.group === 'free')
                    .map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        className={`service-option${selectedServiceId === item.id ? ' active' : ''}${item.disabled ? ' disabled' : ''}`}
                        disabled={item.disabled}
                        onClick={() => {
                          if (item.providerId) {
                            void setProviderId(item.providerId);
                          }
                          setShowServiceMenu(false);
                        }}
                      >
                        <span className="service-check">{selectedServiceId === item.id ? '✓' : ''}</span>
                        <span className="service-icon">{item.icon}</span>
                        <span className="service-name">{item.label}</span>
                      </button>
                    ))}
                  <p className="service-group-title pro">Pro Model</p>
                  {serviceOptions
                    .filter((item) => item.group === 'pro')
                    .map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        className={`service-option${selectedServiceId === item.id ? ' active' : ''}${item.disabled ? ' disabled' : ''}`}
                        disabled={item.disabled}
                        onClick={() => {
                          if (item.providerId) {
                            void setProviderId(item.providerId);
                          }
                          setShowServiceMenu(false);
                        }}
                      >
                        <span className="service-check">{selectedServiceId === item.id ? '✓' : ''}</span>
                        <span className="service-icon">{item.icon}</span>
                        <span className="service-name">{item.label}</span>
                        {item.badge ? <span className="service-badge">{item.badge}</span> : null}
                      </button>
                    ))}
                </div>
              ) : null}
            </div>
          </header>

          <section className="translator-card">
            <div className="lang-row">
              <LanguageSelect value={sourceLang} onChange={setSourceLang} mode="source" />
              <button
                type="button"
                className="swap-btn"
                aria-label="swap language direction"
                onClick={() => {
                  if (sourceLang === 'auto') {
                    return;
                  }
                  const previousSource = sourceLang;
                  setSourceLang(targetLang);
                  setTargetLang(previousSource);
                }}
              >
                ⇄
              </button>
              <LanguageSelect value={targetLang} onChange={setTargetLang} mode="target" dropdownAlign="right" />
            </div>

            <textarea
              value={sourceText}
              className="source-input"
              placeholder="Please type or paste text..."
              onChange={(event) => setSourceText(event.target.value)}
            />

            <div className="action-row">
              <div className="left-actions">
                <button type="button" className="ghost-square" aria-label="paste">
                  ⇱
                </button>
                <button
                  type="button"
                  className="ghost-square"
                  aria-label="clear"
                  onClick={() => {
                    setSourceText('');
                    setResultText('');
                    setError(null);
                  }}
                >
                  🗑
                </button>
              </div>
              <button
                type="button"
                className="translate-btn"
                disabled={sourceText.trim().length === 0 || isTranslating}
                onClick={() => {
                  void (async () => {
                    setError(null);
                    setIsTranslating(true);
                    try {
                      const translatedText = await requestSidePanelTranslation(sendMessage, {
                        sourceLang,
                        targetLang,
                        providerId,
                        text: sourceText,
                      });
                      setResultText(translatedText);
                    } catch (nextError) {
                      setError((nextError as Error).message || 'Failed to translate');
                    } finally {
                      setIsTranslating(false);
                    }
                  })();
                }}
              >
                {isTranslating ? 'Translating...' : 'Translate ↩'}
              </button>
            </div>
          </section>

          <section className="result-card">
            <div className="result-body">{error ? <span className="error-text">{error}</span> : resultText}</div>
          </section>
          </div>

          <aside className="right-rail">
            <button type="button" className="rail-item active">
              <span>🅃</span>
              <small>Text</small>
            </button>
            <button type="button" className="rail-item">
              <span>🗎</span>
              <small>Docu...</small>
            </button>
            <button type="button" className="rail-item">
              <span>▦</span>
              <small>Video</small>
            </button>
            <button type="button" className="rail-item">
              <span>🖼</span>
              <small>Image</small>
            </button>
            <button type="button" className="rail-item">
              <span>🧭</span>
              <small>Tutorials</small>
            </button>
            <div className="rail-spacer" />
            <button type="button" className="rail-item small">
              <span>🎁</span>
            </button>
            <button type="button" className="rail-item small">
              <span>👍</span>
            </button>
            <button type="button" className="rail-item small">
              <span>🏠</span>
            </button>
            <button type="button" className="rail-item small">
              <span>⚙</span>
            </button>
          </aside>
        </div>
      </section>
    </main>
  );
}

export default App;
