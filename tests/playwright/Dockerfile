FROM mcr.microsoft.com/playwright:v1.52.0-noble

WORKDIR /app

# Install Playwright test runner
RUN npm init -y && npm install @playwright/test

# Install Firefox only (not chromium/webkit)
RUN npx playwright install firefox

# Copy Playwright config
COPY tests/playwright/playwright.config.js ./playwright.config.js

# Copy test specs
COPY tests/playwright/specs/ ./tests/playwright/specs/

# Copy extension source
COPY manifest.json ./
COPY background/ ./background/
COPY content/ ./content/
COPY data/ ./data/
COPY shared/ ./shared/
COPY popup/ ./popup/
COPY options/ ./options/
COPY icons/ ./icons/

# Copy test HTML pages
COPY fingerprint-check.html ./

CMD ["npx", "playwright", "test", "--reporter=list"]
