import { defineConfig } from 'playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 30000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3400', browserName: 'chromium', trace: 'retain-on-failure' },
  webServer: { command: 'node scripts/e2e-server.js', url: 'http://127.0.0.1:3400', reuseExistingServer: false, timeout: 30000 }
});
