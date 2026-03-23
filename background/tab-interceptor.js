const TabInterceptor = (() => {
  const exemptTabs = new Set();
  const processingTabs = new Set();
  function shouldReplaceTab(details, currentCookieStoreId, tracked) {
    if (currentCookieStoreId === 'firefox-default') return true;
    if (tracked && (!tracked.url || tracked.url === 'about:blank' || tracked.url === 'about:newtab' || tracked.url === '')) return true;
    if (!details.originUrl) return true;
    if (details.originUrl.startsWith('about:') || details.originUrl.startsWith('moz-extension:')) return true;
    return false;
  }
  function onBeforeRequest(details) {
    if (details.tabId === -1) return {};
    if (details.incognito) return {};
    if (exemptTabs.has(details.tabId)) { exemptTabs.delete(details.tabId); return {}; }
    if (processingTabs.has(details.tabId)) return {};
    const url = details.url;
    if (!url || (!url.startsWith('http:') && !url.startsWith('https:'))) return {};
    const tracked = ContainerManager.getTabInfo(details.tabId);
    const currentCookieStoreId = tracked ? tracked.cookieStoreId : 'firefox-default';
    const openerTabId = tracked ? tracked.openerTabId : undefined;
    const decision = RuleEngine.evaluate(url, openerTabId, currentCookieStoreId);
    if (decision.action === 'ROUTE_TO' || decision.action === 'SHARE_CONTAINER') {
      if (currentCookieStoreId === decision.cookieStoreId) {
        if (tracked) tracked.url = url;
        // Set cookie so content script gets config synchronously on navigation
        return ContainerEnv.setCookieForUrl(url, currentCookieStoreId).then(function () { return {}; });
      }
      const replace = shouldReplaceTab(details, currentCookieStoreId, tracked);
      openInContainer(details.tabId, decision.cookieStoreId, url, replace);
      return { cancel: true };
    }
    if (decision.action === 'NEW_EPHEMERAL') {
      if (currentCookieStoreId !== 'firefox-default' && ContainerManager.isEphemeral(currentCookieStoreId) && ContainerManager.getContainerTabCount(currentCookieStoreId) <= 1) {
        if (tracked) tracked.url = url;
        return ContainerEnv.setCookieForUrl(url, currentCookieStoreId).then(function () { return {}; });
      }
      const replace = shouldReplaceTab(details, currentCookieStoreId, tracked);
      openInNewEphemeral(details.tabId, url, replace);
      return { cancel: true };
    }
    // No routing needed — still set cookie for container tabs so content script gets config
    if (currentCookieStoreId !== 'firefox-default') {
      return ContainerEnv.setCookieForUrl(url, currentCookieStoreId).then(function () { return {}; });
    }
    return {};
  }
  async function openInContainer(tabId, targetCookieStoreId, url, replaceOldTab) {
    processingTabs.add(tabId);
    try {
      const tab = await browser.tabs.get(tabId);
      await ContainerEnv.setCookieForUrl(url, targetCookieStoreId);
      const newTab = await browser.tabs.create({ url, cookieStoreId: targetCookieStoreId, index: replaceOldTab ? tab.index : tab.index + 1, active: true, windowId: tab.windowId });
      ContainerManager.trackTab(newTab.id, targetCookieStoreId, tab.id, url);
      if (replaceOldTab) await browser.tabs.remove(tabId).catch(() => {});
    } catch (e) {} finally { processingTabs.delete(tabId); }
  }
  async function openInNewEphemeral(tabId, url, replaceOldTab) {
    processingTabs.add(tabId);
    try {
      const tab = await browser.tabs.get(tabId);
      const container = await ContainerManager.createEphemeral();
      await ContainerEnv.setCookieForUrl(url, container.cookieStoreId);
      const newTab = await browser.tabs.create({ url, cookieStoreId: container.cookieStoreId, index: replaceOldTab ? tab.index : tab.index + 1, active: true, windowId: tab.windowId });
      ContainerManager.trackTab(newTab.id, container.cookieStoreId, tab.id, url);
      if (replaceOldTab) await browser.tabs.remove(tabId).catch(() => {});
    } catch (e) {} finally { processingTabs.delete(tabId); }
  }
  function onTabCreated(tab) {
    if (tab.incognito) return;
    if (ContainerManager.isMoving(tab.id) || ContainerManager.isManaged(tab.id)) { ContainerManager.clearManaged(tab.id); return; }
    ContainerManager.trackTab(tab.id, tab.cookieStoreId, tab.openerTabId, tab.url || '');
  }
  async function onTabRemoved(tabId) {
    exemptTabs.delete(tabId);
    const info = ContainerManager.untrackTab(tabId);
    if (info && ContainerManager.isEphemeral(info.cookieStoreId)) {
      if (ContainerManager.getContainerTabCount(info.cookieStoreId) === 0) await ContainerManager.destroyEphemeral(info.cookieStoreId);
    }
  }
  function onTabUpdated(tabId, changeInfo) { if (!changeInfo.url) return; const info = ContainerManager.getTabInfo(tabId); if (info) info.url = changeInfo.url; }
  function extractDomain(url) {
    try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
  }
  function isDifferentDomain(urlA, urlB) {
    const a = extractDomain(urlA);
    const b = extractDomain(urlB);
    if (!a || !b) return false;
    return a !== b;
  }
  function onBeforeSendHeaders(details) {
    const url = details.url;
    const originUrl = details.originUrl;
    if (!url || !originUrl) return {};
    if (!RuleEngine.isSharedProvider(url)) return {};
    if (!isDifferentDomain(url, originUrl)) return {};
    const headers = details.requestHeaders.filter(
      h => h.name.toLowerCase() !== 'referer'
    );
    return { requestHeaders: headers };
  }
  function onHeadersReceived(e) {
    // Referrer stripping for shared providers
    if (e.url && RuleEngine.isSharedProvider(e.url)) {
      for (let i = e.responseHeaders.length - 1; i >= 0; i--) {
        if (e.responseHeaders[i].name.toLowerCase() === 'referrer-policy') {
          e.responseHeaders.splice(i, 1);
        }
      }
      e.responseHeaders.push({ name: 'Referrer-Policy', value: 'no-referrer' });
    }

    return { responseHeaders: e.responseHeaders };
  }
  function addExemptTab(tabId) { exemptTabs.add(tabId); }

  // --- ServiceWorker script patching ---
  // Intercept SW script fetches and prepend timezone overrides so the SW
  // reports the same timezone as the main thread.
  function buildSWTimezonePatch(config) {
    if (!config || !config.tz) return null;
    // Self-contained IIFE that patches Date/Intl in ServiceWorkerGlobalScope
    return `(function(){` +
      `var TZ=${JSON.stringify(config.tz)};` +
      `var TZ_OFFSET=${config.off};` +
      `var GMT_STRING=${JSON.stringify(config.gmt)};` +
      `var TZ_LONG_NAME=${JSON.stringify(config.ln)};` +
      `var OrigDate=Date;` +
      `var origToLS=Date.prototype.toLocaleString;` +
      `var origToLDS=Date.prototype.toLocaleDateString;` +
      `var origToLTS=Date.prototype.toLocaleTimeString;` +
      `var OrigDTF=Intl.DateTimeFormat;` +
      `var origRO=OrigDTF.prototype.resolvedOptions;` +
      `var pad=function(n){return n<10?'0'+n:''+n};` +
      `var days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];` +
      `var months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];` +
      `var swOrigParse=OrigDate.parse;` +
      `var swRealOff=swOrigParse('2026-01-15T00:00:00')-swOrigParse('2026-01-15T00:00:00Z');` +
      `var swPAdj=TZ_OFFSET*60000-swRealOff;` +
      `var swHasTz=/[Zz]$|[+-]\\d{2}:?\\d{2}$|\\sGMT|\\sUTC/;` +
      `var swIsoDateOnly=/^\\d{4}(-\\d{2}(-\\d{2})?)?$/;` +
      `function swAdjParse(s){var r=swOrigParse(s);if(typeof s==='string'&&!isNaN(r)&&!swHasTz.test(s)&&!swIsoDateOnly.test(s))r+=swPAdj;return r};` +
      `Date=function(){` +
        `if(!(this instanceof Date)&&!new.target)return new OrigDate().toString();` +
        `var a=arguments;` +
        `if(a.length===0)return new OrigDate();` +
        `if(a.length===1){if(typeof a[0]==='string')return new OrigDate(swAdjParse(a[0]));return new OrigDate(a[0])};` +
        `return new OrigDate(OrigDate.UTC(a[0],a[1],a[2]||1,a[3]||0,a[4]||0,a[5]||0,a[6]||0)+TZ_OFFSET*60000)};` +
      `Date.prototype=OrigDate.prototype;Date.prototype.constructor=Date;` +
      `Date.now=OrigDate.now;Date.parse=swAdjParse;Date.UTC=OrigDate.UTC;` +
      `var m={` +
        `getTimezoneOffset(){return TZ_OFFSET},` +
        `getFullYear(){return new OrigDate(this.getTime()-TZ_OFFSET*60000).getUTCFullYear()},` +
        `getMonth(){return new OrigDate(this.getTime()-TZ_OFFSET*60000).getUTCMonth()},` +
        `getDate(){return new OrigDate(this.getTime()-TZ_OFFSET*60000).getUTCDate()},` +
        `getDay(){return new OrigDate(this.getTime()-TZ_OFFSET*60000).getUTCDay()},` +
        `getHours(){return new OrigDate(this.getTime()-TZ_OFFSET*60000).getUTCHours()},` +
        `getMinutes(){return new OrigDate(this.getTime()-TZ_OFFSET*60000).getUTCMinutes()},` +
        `getSeconds(){return new OrigDate(this.getTime()-TZ_OFFSET*60000).getUTCSeconds()},` +
        `getMilliseconds(){return new OrigDate(this.getTime()-TZ_OFFSET*60000).getUTCMilliseconds()},` +
        `toString(){var l=new OrigDate(this.getTime()-TZ_OFFSET*60000);` +
          `return days[l.getUTCDay()]+' '+months[l.getUTCMonth()]+' '+pad(l.getUTCDate())+' '+l.getUTCFullYear()+' '+` +
          `pad(l.getUTCHours())+':'+pad(l.getUTCMinutes())+':'+pad(l.getUTCSeconds())+' '+GMT_STRING+' ('+TZ_LONG_NAME+')'},` +
        `toTimeString(){var l=new OrigDate(this.getTime()-TZ_OFFSET*60000);` +
          `return pad(l.getUTCHours())+':'+pad(l.getUTCMinutes())+':'+pad(l.getUTCSeconds())+' '+GMT_STRING+' ('+TZ_LONG_NAME+')'},` +
        `toDateString(){var l=new OrigDate(this.getTime()-TZ_OFFSET*60000);` +
          `return days[l.getUTCDay()]+' '+months[l.getUTCMonth()]+' '+pad(l.getUTCDate())+' '+l.getUTCFullYear()},` +
        `toLocaleString(){var l=arguments[0],o=arguments[1];var opts=Object.assign({},o||{});if(!opts.timeZone)opts.timeZone=TZ;return origToLS.call(this,l,opts)},` +
        `toLocaleDateString(){var l=arguments[0],o=arguments[1];var opts=Object.assign({},o||{});if(!opts.timeZone)opts.timeZone=TZ;return origToLDS.call(this,l,opts)},` +
        `toLocaleTimeString(){var l=arguments[0],o=arguments[1];var opts=Object.assign({},o||{});if(!opts.timeZone)opts.timeZone=TZ;return origToLTS.call(this,l,opts)}` +
      `};` +
      `Object.keys(m).forEach(function(n){Date.prototype[n]=m[n]});` +
      `var P=function(locales,options){var opts=Object.assign({},options||{});if(!opts.timeZone)opts.timeZone=TZ;` +
        `if(new.target)return new OrigDTF(locales,opts);return OrigDTF(locales,opts)};` +
      `P.prototype=OrigDTF.prototype;P.supportedLocalesOf=OrigDTF.supportedLocalesOf;Intl.DateTimeFormat=P;` +
      `Intl.DateTimeFormat.prototype.resolvedOptions=` +
        `{resolvedOptions(){var r=origRO.call(this);r.timeZone=TZ;return r}}.resolvedOptions;` +
    `})();\n`;
  }

  function onScriptBeforeSendHeaders(details) {
    if (details.tabId === -1) return {};
    // Check for Service-Worker: script header
    let isServiceWorker = false;
    for (const h of details.requestHeaders) {
      if (h.name.toLowerCase() === 'service-worker' && h.value === 'script') {
        isServiceWorker = true;
        break;
      }
    }
    if (!isServiceWorker) return {};

    // Get container info for this tab
    const tracked = ContainerManager.getTabInfo(details.tabId);
    if (!tracked || tracked.cookieStoreId === 'firefox-default') return {};

    const config = ContainerEnv.buildConfig(tracked.cookieStoreId);
    const patchCode = buildSWTimezonePatch(config);
    if (!patchCode) return {};

    // Use filterResponseData to prepend timezone patches to the SW script
    const filter = browser.webRequest.filterResponseData(details.requestId);
    const decoder = new TextDecoder('utf-8');
    const encoder = new TextEncoder();
    const chunks = [];

    filter.ondata = (event) => { chunks.push(event.data); };
    filter.onstop = () => {
      let original = '';
      for (let i = 0; i < chunks.length; i++) {
        original += decoder.decode(chunks[i], { stream: i < chunks.length - 1 });
      }
      filter.write(encoder.encode(patchCode + original));
      filter.close();
    };
    filter.onerror = () => { try { filter.close(); } catch (e) {} };

    return {};
  }

  function setup() {
    browser.tabs.onCreated.addListener(onTabCreated);
    browser.tabs.onRemoved.addListener(onTabRemoved);
    browser.tabs.onUpdated.addListener(onTabUpdated);
    browser.webRequest.onBeforeRequest.addListener(onBeforeRequest, { urls: ['<all_urls>'], types: ['main_frame'] }, ['blocking']);
    browser.webRequest.onBeforeSendHeaders.addListener(onBeforeSendHeaders, { urls: ['<all_urls>'], types: ['main_frame'] }, ['blocking', 'requestHeaders']);
    browser.webRequest.onBeforeSendHeaders.addListener(onScriptBeforeSendHeaders, { urls: ['<all_urls>'], types: ['script'] }, ['blocking', 'requestHeaders']);
    browser.webRequest.onHeadersReceived.addListener(onHeadersReceived, { urls: ['<all_urls>'], types: ['main_frame'] }, ['blocking', 'responseHeaders']);
  }
  return {
    setup,
    addExemptTab,
  };
})();
