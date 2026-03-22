// Per-container environment configuration via cookie-based delivery
// Sets a short-lived cookie with timezone + fingerprint seed before tab creation,
// so the content script can read it synchronously at document_start.

const ContainerEnv = (() => {
  'use strict';

  let currentTimezone = null;

  function hashString(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  function buildConfig(cookieStoreId) {
    if (cookieStoreId === 'firefox-default') return null;

    const seed = hashString(cookieStoreId);
    if (!currentTimezone) return { seed };

    const tz = currentTimezone;
    const now = new Date();
    const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzStr = now.toLocaleString('en-US', { timeZone: tz });
    const off = (new Date(utcStr) - new Date(tzStr)) / 60000;

    const sign = off <= 0 ? '+' : '-';
    const absOff = Math.abs(off);
    const gmt = 'GMT' + sign + String(Math.floor(absOff / 60)).padStart(2, '0') + String(absOff % 60).padStart(2, '0');

    let ln = '';
    try {
      const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'long' });
      const parts = fmt.formatToParts(now);
      const tzPart = parts.find(p => p.type === 'timeZoneName');
      if (tzPart) ln = tzPart.value;
    } catch (e) {}

    return { tz, off, gmt, ln, seed };
  }

  async function setCookieForUrl(url, cookieStoreId) {
    if (cookieStoreId === 'firefox-default') return;
    if (!url.startsWith('http:') && !url.startsWith('https:')) return;

    const config = buildConfig(cookieStoreId);
    if (!config) return;

    const parsedUrl = new URL(url);
    const cookieUrl = parsedUrl.origin;

    await browser.cookies.set({
      url: cookieUrl,
      name: '__ctm_env',
      value: encodeURIComponent(JSON.stringify(config)),
      storeId: cookieStoreId,
      path: '/',
      expirationDate: Math.floor(Date.now() / 1000) + 30
    });
  }

  function updateTimezone(tz) {
    currentTimezone = tz;
  }

  function getTimezone() {
    return currentTimezone;
  }

  return { buildConfig, setCookieForUrl, updateTimezone, getTimezone, hashString };
})();
