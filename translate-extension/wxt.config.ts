import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  browser: 'chrome',
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  manifest: {
    permissions: ['storage', 'tabs', 'activeTab', 'sidePanel'],
    side_panel: {
      default_path: 'sidepanel.html',
    },
    host_permissions: [
      'https://translate.googleapis.com/*',
      'https://api-free.deepl.com/*',
    ],
  },
});
