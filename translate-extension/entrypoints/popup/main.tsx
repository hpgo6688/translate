import React from 'react';
import ReactDOM from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import App from './App.tsx';
import './style.css';
import '@/assets/tailwind.css';
import { i18n, setupI18n } from '@/utils/i18n';
import { startPopupStorageSync } from '@/stores/popup';

void setupI18n();
startPopupStorageSync();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <App />
    </I18nextProvider>
  </React.StrictMode>,
);
