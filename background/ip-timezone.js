// IP-based timezone/locale detection
// Fetches geolocation data from ipapi.co and caches it

const IpTimezone = (() => {
  'use strict';

  const STORAGE_KEY = 'ipTimezone';
  // Try multiple APIs in order — some block extension contexts
  const API_URLS = [
    { url: 'http://ip-api.com/json/', parse: d => ({ timezone: d.timezone, country: d.countryCode, city: d.city, ip: d.query }) },
    { url: 'https://ipapi.co/json/', parse: d => ({ timezone: d.timezone, country: d.country_code || d.country, city: d.city, ip: d.ip }) },
  ];
  let cachedInfo = null;
  let onChangeCallback = null;

  async function fetchIPInfo() {
    for (const api of API_URLS) {
      try {
        const response = await fetch(api.url);
        if (!response.ok) {
          console.warn('[IpTimezone] API', api.url, 'returned status', response.status);
          continue;
        }
        const data = await response.json();
        const parsed = api.parse(data);
        const info = {
          timezone: parsed.timezone || null,
          country: parsed.country || null,
          city: parsed.city || null,
          ip: parsed.ip || null,
          lastChecked: Date.now()
        };
        const oldTz = cachedInfo ? cachedInfo.timezone : null;
        cachedInfo = info;
        await browser.storage.local.set({ [STORAGE_KEY]: info });
        console.log('[IpTimezone] Updated via', api.url, ':', info.timezone, info.country, info.city);
        if (onChangeCallback && info.timezone !== oldTz) {
          onChangeCallback(info);
        }
        return info;
      } catch (e) {
        console.warn('[IpTimezone] Fetch from', api.url, 'failed:', e.message);
        continue;
      }
    }
    console.warn('[IpTimezone] All APIs failed');
    return null;
  }

  async function maybeRefresh() {
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

  function onChange(cb) { onChangeCallback = cb; }

  return { init, getIPInfo, onChange, maybeRefresh };
})();
