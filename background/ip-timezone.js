// IP-based timezone/locale detection
// Fetches geolocation data from ipapi.co and caches it

const IpTimezone = (() => {
  'use strict';

  const STORAGE_KEY = 'ipTimezone';
  const API_URL = 'https://ipapi.co/json/';
  const MIN_RECHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

  let cachedInfo = null;

  async function fetchIPInfo() {
    try {
      const response = await fetch(API_URL);
      if (!response.ok) {
        console.warn('[IpTimezone] API returned status', response.status);
        return null;
      }
      const data = await response.json();
      const info = {
        timezone: data.timezone || null,
        country: data.country_code || data.country || null,
        city: data.city || null,
        ip: data.ip || null,
        lastChecked: Date.now()
      };
      cachedInfo = info;
      await browser.storage.local.set({ [STORAGE_KEY]: info });
      console.log('[IpTimezone] Updated:', info.timezone, info.country, info.city);
      return info;
    } catch (e) {
      console.warn('[IpTimezone] Fetch failed:', e.message);
      return null;
    }
  }

  async function maybeRefresh() {
    if (cachedInfo && (Date.now() - cachedInfo.lastChecked) < MIN_RECHECK_INTERVAL) {
      return; // Too soon to re-check
    }
    await fetchIPInfo();
  }

  async function getIPInfo() {
    if (cachedInfo) return cachedInfo;
    // Try loading from storage
    const stored = await browser.storage.local.get(STORAGE_KEY);
    if (stored[STORAGE_KEY]) {
      cachedInfo = stored[STORAGE_KEY];
      return cachedInfo;
    }
    return null;
  }

  async function init() {
    // Load cached data first
    const stored = await browser.storage.local.get(STORAGE_KEY);
    if (stored[STORAGE_KEY]) {
      cachedInfo = stored[STORAGE_KEY];
    }

    // Fetch fresh data
    await fetchIPInfo();

    // Re-check when coming back online (e.g. VPN connect/disconnect)
    window.addEventListener('online', () => {
      console.log('[IpTimezone] Online event — rechecking');
      maybeRefresh();
    });

    // Re-check when user returns from idle
    if (browser.idle && browser.idle.onStateChanged) {
      browser.idle.onStateChanged.addListener((state) => {
        if (state === 'active') {
          console.log('[IpTimezone] Returned from idle — rechecking');
          maybeRefresh();
        }
      });
    }
  }

  return { init, getIPInfo };
})();
