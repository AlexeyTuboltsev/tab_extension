// Per-container environment configuration via cookie-based delivery
// Sets a short-lived XOR-obfuscated cookie with timezone + fingerprint seed
// before tab creation, so the content script can read it synchronously at document_start.

const ContainerEnv = (() => {
  'use strict';

  let currentTimezone = null;
  let currentCountry = null;
  let profilesList = null;

  // XOR cipher key derived from extension's internal UUID (not accessible to page scripts)
  let cipherKey = null;

  function deriveCipherKey() {
    const extUrl = browser.runtime.getURL('');
    const keyNum = String(hashString(extUrl));
    cipherKey = keyNum.repeat(Math.ceil(32 / keyNum.length)).slice(0, 32);
  }

  function xorCipher(str) {
    const out = [];
    for (let i = 0; i < str.length; i++) {
      out.push(String.fromCharCode(str.charCodeAt(i) ^ cipherKey.charCodeAt(i % cipherKey.length)));
    }
    return out.join('');
  }

  function hashString(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  function pickProfile(seed) {
    if (!profilesList || profilesList.length === 0) return null;
    const country = currentCountry || 'US';
    const matching = profilesList.filter(p => p.countries.includes(country));
    const pool = matching.length > 0 ? matching : profilesList;
    const picked = pool[seed % pool.length];
    if (!picked) return null;
    // Return only fields needed by content script (exclude id/region/countries)
    return {
      platform: picked.platform,
      hardwareConcurrency: picked.hardwareConcurrency,
      deviceMemory: picked.deviceMemory,
      screen: picked.screen,
      colorDepth: picked.colorDepth,
      pixelRatio: picked.pixelRatio,
      webgl_vendor: picked.webgl_vendor,
      webgl_renderer: picked.webgl_renderer,
      languages: picked.languages,
      fonts: picked.fonts
    };
  }

  function buildConfig(cookieStoreId) {
    if (cookieStoreId === 'firefox-default') return null;

    const seed = hashString(cookieStoreId);
    if (!currentTimezone) return { seed, prof: pickProfile(seed) };

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

    return { tz, off, gmt, ln, seed, prof: pickProfile(seed) };
  }

  async function setCookieForUrl(url, cookieStoreId) {
    if (cookieStoreId === 'firefox-default') return;
    if (!url.startsWith('http:') && !url.startsWith('https:')) return;

    const config = buildConfig(cookieStoreId);
    if (!config) return;

    const parsedUrl = new URL(url);
    const cookieUrl = parsedUrl.origin;

    if (!cipherKey) deriveCipherKey();
    const encoded = btoa(xorCipher(JSON.stringify(config)));

    await browser.cookies.set({
      url: cookieUrl,
      name: '__ctm_env',
      value: encoded,
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

  function setProfiles(profiles) {
    profilesList = profiles;
  }

  function setCountry(country) {
    currentCountry = country;
  }

  return { buildConfig, setCookieForUrl, updateTimezone, getTimezone, hashString, setProfiles, setCountry };
})();
