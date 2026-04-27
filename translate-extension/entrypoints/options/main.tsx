import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/assets/tailwind.css';

import App from './App';
import { setupI18n } from '@/utils/i18n';
import { startSettingsSync } from '@/stores/settings';

void setupI18n();
startSettingsSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
