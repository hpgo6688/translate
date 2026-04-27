import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { masterPasswordManager } from '@/core/keystore/master-password';
import { usePopupStore } from '@/stores/popup';
import { onMessage, sendMessage } from '@/utils/messaging';

function App() {
  const { t } = useTranslation();
  const [showUnlock, setShowUnlock] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const {
    enabled,
    targetLang,
    providerId,
    sessionChars,
    cacheHitRate,
    setEnabled,
    setTargetLang,
    setProviderId,
  } = usePopupStore();

  const providerOptions = useMemo(
    () => [
      { id: 'google', label: 'Google' },
      { id: 'deepl', label: 'DeepL' },
    ],
    [],
  );

  useEffect(() => {
    const remove = onMessage('NEEDS_UNLOCK', () => {
      setShowUnlock(true);
    });
    return remove;
  }, []);

  return (
    <main className="w-80 p-4 text-slate-900">
      <h1 className="text-lg font-semibold">{t('popup.title')}</h1>
      <label className="mt-3 flex items-center justify-between text-sm">
        <span>{t('popup.enableCurrentTab')}</span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => {
            void setEnabled(event.target.checked);
          }}
        />
      </label>

      <label className="mt-3 block text-sm">
        <span className="mb-1 block">Target Language</span>
        <select
          className="w-full rounded border p-1"
          value={targetLang}
          onChange={(event) => {
            void setTargetLang(event.target.value);
          }}
        >
          <option value="zh-CN">Chinese (zh-CN)</option>
          <option value="en">English (en)</option>
          <option value="ja">Japanese (ja)</option>
        </select>
      </label>

      <label className="mt-3 block text-sm">
        <span className="mb-1 block">Provider</span>
        <select
          className="w-full rounded border p-1"
          value={providerId}
          onChange={(event) => {
            void setProviderId(event.target.value);
          }}
        >
          {providerOptions.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.label}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
        Session chars: {sessionChars} | Cache hit rate: {Math.round(cacheHitRate * 100)}%
      </div>

      <a className="mt-3 inline-block text-xs text-blue-600 underline" href="/options.html">
        Open Options
      </a>

      {showUnlock && (
        <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-2 text-xs">
          <p className="mb-1 font-medium">Unlock required</p>
          <input
            type="password"
            className="mb-2 w-full rounded border p-1"
            value={unlockPassword}
            onChange={(event) => setUnlockPassword(event.target.value)}
            placeholder="Master password"
          />
          {unlockError ? <p className="mb-1 text-red-600">{unlockError}</p> : null}
          <button
            className="rounded bg-slate-900 px-2 py-1 text-white"
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
