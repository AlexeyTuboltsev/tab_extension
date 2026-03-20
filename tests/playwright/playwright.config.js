const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/playwright/specs',
  timeout: 30000,
  retries: 0,
  projects: [
    {
      name: 'firefox',
      use: {
        browserName: 'firefox',
        headless: true,
        launchOptions: {
          firefoxUserPrefs: {
            // Enable container tabs
            'privacy.userContext.enabled': true,
            'privacy.userContext.ui.enabled': true,
          },
        },
      },
    },
  ],
});
