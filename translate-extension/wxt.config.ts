import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  browser: 'chrome',
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Translate',
    action: {
      default_title: 'Translate',
    },
    permissions: ['storage', 'tabs', 'activeTab', 'sidePanel'],
    side_panel: {
      default_path: 'sidepanel.html',
    },
    host_permissions: [
      'https://api.deepseek.com/*',
    ],
  },
});
