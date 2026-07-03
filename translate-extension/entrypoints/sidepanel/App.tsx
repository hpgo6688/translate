import { useState } from 'react';

import { LanguageSelect } from '@/components/ui/language-select';
import { usePopupStore } from '@/stores/popup';
import { sendMessage } from '@/utils/messaging';
import { requestSidePanelTranslation } from './actions';

function App() {
  const { providerId } = usePopupStore();
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('zh-CN');
  const [sourceText, setSourceText] = useState('');
  const [resultText, setResultText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="sidepanel-shell">
      <section className="panel-body">
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
              <span className="service-trigger" title="DeepSeek v4 Pro">
                🌀
              </span>
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
                    setResultText('');
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
            <div className="result-body">
              {error ? (
                <span className="error-text">{error}</span>
              ) : isTranslating ? (
                <span className="loading-text">Translating with AI...</span>
              ) : (
                resultText
              )}
            </div>
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
