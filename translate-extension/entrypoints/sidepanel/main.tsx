import React from 'react';
import ReactDOM from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';

import '@/assets/tailwind.css';
import { i18n, setupI18n } from '@/utils/i18n';
import { startPopupStorageSync } from '@/stores/popup';

import App from './App';
import './style.css';

void setupI18n();
startPopupStorageSync();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <App />
    </I18nextProvider>
  </React.StrictMode>,
);
