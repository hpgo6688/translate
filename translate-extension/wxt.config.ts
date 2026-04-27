import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  browser: 'chrome',
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  manifest: {
    permissions: ['storage', 'tabs', 'activeTab'],
  },
});
