# Container Tab Manager — TODO

## Fix: Incognito windows blocked by extension

Incognito (private) windows are currently broken — the extension's `webRequest.onBeforeRequest` handler blocks/cancels requests because it tries to create containers, but Firefox doesn't support `contextualIdentities` in private windows.

### Fix
In `tab-interceptor.js` `onBeforeRequest`, check if the tab is in a private window and skip all interception:

```javascript
// At the top of onBeforeRequest:
if (details.incognito) return {};
```

Or check via `browser.tabs.get(details.tabId)` → `tab.incognito`, but that's async and we need a synchronous answer for the blocking handler. `details.incognito` should be available directly on the `webRequest` details object — need to verify.

Alternative: track private window IDs on `windows.onCreated` and skip any tabId belonging to those windows.

### Priority
High — this is a bug that breaks basic browser functionality.

---

## Strip referrer on shared provider navigations

When a shared provider (PayPal, Stripe, etc.) opens from a merchant's container, third-party tracker scripts on the provider page can see `document.referrer` revealing which merchant you came from. Combined with fingerprinting, this lets trackers correlate shopping activity across merchants.

### The leak
1. You're on `ebay.de/checkout` → click "Pay with PayPal"
2. PayPal opens in eBay's container (shared provider)
3. A tracker script on PayPal reads `document.referrer` → `https://www.ebay.de/checkout`
4. Later, same tracker on PayPal from Amazon → `https://www.amazon.de/checkout`
5. Even with different container fingerprints, the referrer tells the tracker which merchants you use

### What our extension already handles
- Fingerprint differs per container → tracker can't link eBay-PayPal and Amazon-PayPal sessions via fingerprint (good)
- uBlock Origin blocks most known trackers (additional layer)

### What's missing: referrer stripping
Use `webRequest.onBeforeSendHeaders` to strip or modify the `Referer` header when navigating to a shared provider:

```javascript
// When destination is a shared provider AND origin is a different domain:
// Set Referer to just the provider's origin, or remove it entirely
browser.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (isSharedProvider(details.url) && isFromMerchant(details)) {
      // Option A: strip entirely
      headers = headers.filter(h => h.name.toLowerCase() !== 'referer');
      // Option B: set to provider's own origin (less suspicious)
      // headers.find(h => h.name.toLowerCase() === 'referer').value = new URL(details.url).origin;
    }
    return { requestHeaders: headers };
  },
  { urls: ['<all_urls>'] },
  ['blocking', 'requestHeaders']
);
```

### Also strip via content script
`document.referrer` in JavaScript is separate from the HTTP header. Need to also patch it in the `document_start` content script when on a shared provider page:

```javascript
Object.defineProperty(document, 'referrer', {
  get: () => ''  // or the provider's own origin
});
```

### Open questions
- Strip completely or rewrite to provider's origin? Stripping might break some payment flows that check referrer.
- Also strip `Referer` on sub-resource requests (images, scripts) from shared provider pages? Probably yes — tracker pixels use the referrer.
- Should this apply to all cross-container navigations, not just shared providers?

---

## Shared provider auth: keep user logged in across payment flows

When PayPal opens from a merchant's container (shared context), the user has to log in every time because PayPal's login state (cookies, localStorage, etc.) lives in the PayPal saved container, not the merchant's.

### Approach A: Route to provider's own container (simpler, test first)

Instead of sharing the merchant's container, open PayPal in its **own saved container**. Payment flows pass everything needed via URL parameters (`token=XYZ`).

**Flow:**
1. Merchant's "Pay with PayPal" opens `paypal.com/checkout?token=XYZ`
2. Global rule routes it to the PayPal saved container (not shared with merchant)
3. PayPal has its own cookies + localStorage → user is already logged in
4. URL token tells PayPal which merchant order this is
5. After payment, PayPal redirects back to merchant → lands in merchant's container

**Implementation:** remove PayPal from shared providers list. Let the global rule handle routing. No code changes needed — just configuration.

**To test:** does PayPal's checkout rely on anything from the merchant's container besides the URL? If the URL token is sufficient, this approach works perfectly.

**Risk:** some payment flows may use `window.opener` / `postMessage` to communicate back to the merchant page. If the PayPal popup is in a different container, `window.opener` is null and the callback breaks. Need to test with real payments.

### Approach B: Copy provider auth into merchant's container (comprehensive, complex)

Copy all of the provider's auth state into the merchant's container before the provider page loads.

**What needs copying:**

| Storage | Copy method |
|---|---|
| Cookies | `browser.cookies` API — read from provider container, write to merchant container |
| localStorage | Content script in provider container reads → messaging → content script in merchant container writes |
| sessionStorage | Same as localStorage |
| IndexedDB | Same, but more complex (async, structured data) |
| Cache API | Extremely complex, probably skip |

**Flow:**
1. Detect shared provider navigation (paypal.com from merchant container)
2. **Cookies**: background script copies `*.paypal.com` cookies from PayPal container → merchant container
3. **localStorage/IndexedDB**: inject content script into a hidden tab in PayPal container, read storage, send via messaging, write into merchant container's PayPal page
4. PayPal loads in merchant's container with full auth state

**One-directional only** — copy provider → merchant, never merchant → provider. Prevents tracking cookie leakage.

**Challenges:**
- localStorage/IndexedDB copy requires a tab open on paypal.com in the PayPal container to read from (timing issue)
- Could pre-cache provider storage on extension startup by briefly opening provider domains in hidden tabs
- sessionStorage is per-tab and doesn't persist — may not be needed
- Some cookies are HttpOnly — can still be copied via `browser.cookies` API but not via content scripts

### Recommendation
Test Approach A first — it's zero code changes and might just work. If PayPal's checkout breaks because it needs `window.opener` or merchant cookies, fall back to Approach B.

### Open questions
- Which payment providers use URL-only flows (Approach A works) vs window.opener/postMessage (need Approach B)?
- Should we auto-detect: try Approach A, and if the payment flow fails/errors, offer to retry with Approach B?
- For Approach B: how to handle cookie expiration drift (provider cookie expires in 30 days, copied cookie has same expiry — but they may get out of sync if user logs into provider directly)

---

## Fingerprint noise per container

Add per-container canvas/WebGL/AudioContext fingerprint noise so each saved container appears as a different "user" to fingerprinting scripts.

### Approach
- Content script with `"run_at": "document_start"` — Firefox guarantees this runs before any page scripts
- Patch `HTMLCanvasElement.prototype.toDataURL`, `.toBlob`, and `CanvasRenderingContext2D.prototype.getImageData` on the prototype
- Use `exportFunction` (Firefox-specific) to expose the patched functions to page context
- Generate deterministic noise seed from the tab's `cookieStoreId` so the same container always produces the same fingerprint
- Also patch `WebGLRenderingContext.prototype.readPixels` and `AudioContext` for full coverage

### Key details
- Noise must be deterministic per-container (same container = same hash = consistent identity)
- Noise must be small enough to produce plausible canvas output (modify a few pixels, not blank it)
- Different containers = different noise = different fingerprint (matches cookie isolation)
- `document_start` in Firefox runs before any DOM is constructed or scripts execute — safe against inline scripts

### Files to add
- `content/fingerprint-noise.js` — the content script
- Update `manifest.json` to add `content_scripts` entry

### Canvas/WebGL pixel output spoofing

Two-layer approach that produces natural-looking variation without trying to mimic a specific GPU:

**Layer 1: Sub-pixel transform injection (primary)**

Patch `getContext` once — inject a tiny sub-pixel translate into every 2D canvas context.
This shifts ALL drawing operations, causing the GPU's own antialiasing to produce different edge pixels.

```javascript
const origGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function(type, attrs) {
  const ctx = origGetContext.call(this, type, attrs);
  if (type === '2d') {
    // Tiny shift — different per container, affects all antialiased edges
    ctx.translate(0.0000001 * seed, 0.0000001 * seed);
  }
  return ctx;
};
```

Why this works:
- One patch covers ALL 2D drawing operations (~20 methods: fillRect, strokeRect, fillText, arc, lineTo, drawImage, etc.)
- Can't be bypassed by caching a reference to drawing methods — the transform is on the context instance
- Output looks natural — the GPU itself renders differently, not artificial noise
- Deterministic per container (same seed = same shift = same fingerprint)

For WebGL: same idea — inject tiny offset into projection matrix via patching `gl.viewport` or `gl.uniformMatrix*` calls.

**Layer 2: Readback noise (fallback)**

Patch readback functions to add deterministic per-container noise as a safety net:
- `CanvasRenderingContext2D.prototype.getImageData`
- `HTMLCanvasElement.prototype.toDataURL`
- `HTMLCanvasElement.prototype.toBlob`
- `WebGLRenderingContext.prototype.readPixels`
- `WebGL2RenderingContext.prototype.readPixels`

```javascript
// Flip least significant bits using container-derived seed
for (let i = 0; i < data.length; i += 4) {
  data[i]   ^= (hash(seed + i) & 1);   // R ±1
  data[i+1] ^= (hash(seed + i+1) & 1); // G ±1
}
```

**Why both layers:**
- Layer 1 produces natural GPU-rendered variation for known canvas tests
- Layer 2 catches edge cases (e.g., code that creates a context, draws, reads pixels all in ways that bypass the transform)
- Together: natural-looking + comprehensive

**AudioContext:**
- Patch `AudioContext.prototype.createOscillator` or `createDynamicsCompressor`
- Add tiny frequency/gain offset per container seed
- Or patch `AnalyserNode.prototype.getFloatFrequencyData` / `getByteFrequencyData` to add noise to output

### What we CANNOT do from an extension
- Change actual GPU rendering pipeline (browser engine level)
- Intercept WebGL shader execution on GPU
- Modify OS font rasterizer
- Perfectly mimic a specific GPU's pixel output (would need reference renders for infinite possible operations)

### Honest limitation
No anti-fingerprint tool mimics specific GPU pixel output. Tor Browser makes everyone identical (standardized rendering). Brave adds random noise. Our approach (sub-pixel shift + readback noise) is between the two — natural-looking variation that differs per container.

### Signals to patch (summary)
- [ ] Canvas: sub-pixel transform injection on `getContext('2d')`
- [ ] Canvas: readback noise on `toDataURL`, `toBlob`, `getImageData`
- [ ] WebGL: projection matrix offset on context creation
- [ ] WebGL: readback noise on `readPixels`
- [ ] WebGL: renderer/vendor strings via `getParameter`
- [ ] AudioContext: frequency/gain noise on oscillator/compressor
- [ ] Consider: `navigator.hardwareConcurrency`, screen dimensions (from profile bundle)

### Open questions
- Should ephemeral containers each get unique noise, or share a "generic" profile?
- Should there be a UI toggle to enable/disable fingerprint noise?
- How to handle `privacy.resistFingerprinting` interaction — if user has it enabled, don't double-patch?
- Sub-pixel shift amount: how small is small enough to be invisible to the user but large enough to change antialiased pixels? Need to test.

## Auto timezone/locale from IP (VPN-aware)

Automatically detect timezone from public IP so that when using a VPN, the browser's reported timezone matches the VPN exit location. Prevents timezone-based fingerprint mismatch.

### IP detection strategy
- Lookup public IP via geolocation API (e.g., `https://ipapi.co/json/` — returns timezone, country, city)
- Check once on extension startup
- Re-check on `online` event (covers VPN connect/disconnect)
- Re-check on `browser.idle.onStateChanged` when user returns from idle (VPN may have changed while away)
- Cache result in `storage.local` — typically ~5-10 API calls per day
- Share cached timezone with content scripts via messaging or storage

### What to patch in content script (`document_start`)
- [ ] `Date.prototype.getTimezoneOffset()` — return offset matching spoofed timezone
- [ ] `Date.prototype.toString()`, `toLocaleString()`, `toTimeString()` — show spoofed timezone name
- [ ] `Intl.DateTimeFormat().resolvedOptions().timeZone` — return spoofed timezone string
- [ ] `Intl.DateTimeFormat.prototype.format()` — format dates in spoofed timezone
- [ ] `navigator.language` / `navigator.languages` — match region to timezone for consistency

### Per-container overrides
- Each saved container can have a timezone override (auto from IP, or manual)
- Ephemeral containers use the current auto-detected timezone
- UI: dropdown in container settings form — "Auto (from IP)", or pick a timezone manually

### Permissions needed
- `idle` permission (for `browser.idle.onStateChanged`)
- `<all_urls>` already covers the API fetch

### Open questions
- Which IP geolocation API? ipapi.co (1000/day free), ip-api.com (45/min free, http only), or self-hosted?
- Should `navigator.language` change per-container? e.g., German VPN → `de-DE`? This could break UX for the user
- How to handle IP lookup failure (no internet, API down) — fall back to real timezone?

## Regional hardware profile mimicry

Instead of randomizing or blanking fingerprint signals, mimic the most common real hardware configuration for the user's detected country/region. Combined with IP-based timezone, each container appears as a plausible local user.

### How it works
1. IP lookup gives us the country (already done for timezone)
2. Country maps to a regional profile set (e.g., "Western Europe")
3. Container ID deterministically selects a specific profile from the set
4. Content script (`document_start`) patches all signals to match the chosen profile
5. Same container = same profile always. Different container = different profile.

### Profile structure
```
{
  "id": "eu-west-01",
  "region": "Western Europe",
  "webgl_renderer": "ANGLE (Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)",
  "webgl_vendor": "Google Inc. (Intel)",
  "platform": "Win32",
  "hardwareConcurrency": 8,
  "deviceMemory": 8,
  "screen": [1920, 1080],
  "colorDepth": 24,
  "pixelRatio": 1,
  "languages": ["de-DE", "en-US"],
  "canvas_noise_seed": "derived from container ID + profile ID",
  "fonts": "win11-de"
}
```

### Regional profile sets to curate
- [ ] Western Europe (DE/FR/NL/etc.) — 3-5 profiles
- [ ] North America (US/CA) — 3-5 profiles
- [ ] Eastern Europe (PL/CZ/RU/etc.) — 3-5 profiles
- [ ] East Asia (JP/KR/TW) — 3-5 profiles
- [ ] South America (BR/AR/etc.) — 2-3 profiles
- Total: ~15-25 profiles

### Data sources for building profiles
- Steam Hardware Survey (GPU/CPU/OS/screen per region)
- StatCounter (screen resolution, OS, browser per country)
- AmIUnique.org research papers (fingerprint distributions)
- CreepJS / CoverYourTracks datasets
- Chrome UX Report (device categories per country)
- Manual collection: run fingerprint test page through VPN exits in each region

### Signals patched per profile
- [ ] `navigator.platform`
- [ ] `navigator.hardwareConcurrency`
- [ ] `navigator.deviceMemory`
- [ ] `navigator.languages` / `navigator.language`
- [ ] `screen.width`, `screen.height`, `screen.colorDepth`
- [ ] `window.devicePixelRatio`
- [ ] WebGL renderer/vendor strings
- [ ] Canvas noise (deterministic per profile + container)
- [ ] WebGL readPixels noise
- [ ] AudioContext noise
- [ ] `Date` / `Intl` timezone (from IP, see above)

### Consistency checks
- GPU renderer must match platform (no Intel UHD on macOS ARM, no Apple M1 on Win32)
- Screen resolution must be plausible for the device class
- CPU cores must match the GPU tier (no 32 cores with Intel HD 4000)
- Language should match region but not break user experience — maybe only spoof in ephemeral containers?

### UI
- Container settings form: "Fingerprint Profile" dropdown
  - "Auto (match region)" — default, uses IP-detected region
  - "Manual" — pick a specific profile
  - "None" — no spoofing, real signals
- Global toggle in options: enable/disable fingerprint mimicry

### Open questions
- Ship profiles as a static JSON file in the extension, or fetch from a maintained repo?
- How often do profiles need updating? GPU market shifts slowly (~yearly is fine)
- Should we also spoof `User-Agent` to match the profile? (e.g., Windows UA for a Win32 profile) — this is high risk, may break sites
- How to handle WebGL render-based fingerprinting (not just strings but actual pixel output)? May need per-profile GPU rendering quirk simulation — very complex, maybe out of scope

## Font list mimicry per profile

Spoof the installed font list to match the most common real-world font combination for the profile's OS+locale. Font enumeration is one of the strongest fingerprint signals (17,372 distinct combinations found across 2M fingerprints in research).

### How font fingerprinting works
- Script sets `fontFamily` to `"TestFont", monospace` and measures element width/height
- If dimensions differ from pure monospace fallback → font is installed
- Tests against 3 fallback families (serif, sans-serif, monospace) to avoid false negatives
- Also uses `document.fonts.check()` API
- Fingerprinters typically test 50-200 fonts from a known dictionary

### The 66 fonts that fingerprinters actually test
From the 2M-fingerprint study (Gómez-Boix et al., WWW 2018) — these are the fonts we need to fake answers for:
```
Andale Mono, AppleGothic, Arial, Arial Black, Arial Hebrew, Arial MT,
Arial Narrow, Arial Rounded MT Bold, Arial Unicode MS,
Bitstream Vera Sans Mono, Book Antiqua, Bookman Old Style,
Calibri, Cambria, Cambria Math, Century, Century Gothic,
Century Schoolbook, Comic Sans, Comic Sans MS, Consolas,
Courier, Courier New, Garamond, Geneva, Georgia, Helvetica,
Helvetica Neue, Impact, Lucida Bright, Lucida Calligraphy,
Lucida Console, Lucida Fax, LUCIDA GRANDE, Lucida Handwriting,
Lucida Sans, Lucida Sans Typewriter, Lucida Sans Unicode,
Microsoft Sans Serif, Monaco, Monotype Corsiva, MS Gothic,
MS Outlook, MS PGothic, MS Reference Sans Serif, MS Sans Serif,
MS Serif, MYRIAD, MYRIAD PRO, Palatino, Palatino Linotype,
Segoe Print, Segoe Script, Segoe UI, Segoe UI Light,
Segoe UI Semibold, Segoe UI Symbol, Tahoma, Times,
Times New Roman, Times New Roman PS, Trebuchet MS,
Verdana, Wingdings, Wingdings 2, Wingdings 3
```

### Strategy: mimic the most popular real combination, not just OS defaults
- A bare OS install is itself unusual — most users have Office, browsers, common apps
- OS default fonts + Office fonts (~70% of Windows) = the most common combo
- Per-locale: add language-specific fonts (CJK for JP/KR/CN, Cyrillic for RU, etc.)
- Goal: match the largest anonymity set (most users with this exact font combo)

### How to fake it
- `document_start` content script intercepts font measurement
- For each of the 66 probed fonts, the profile defines: installed (true/false)
- Installed → allow real measurement
- Not installed → return fallback dimensions (spoof as absent)
- Patch: `HTMLElement.prototype.offsetWidth/offsetHeight`, `getBoundingClientRect`, `getComputedStyle`, `document.fonts.check()`

### Font list derivation
```
IP → country (DE) → profile OS (Windows 11) → locale (de-DE)
→ "win11-de" font set: OS defaults + Office + common German software
```

### Data sources
- **Research**: 66-font test list from Gómez-Boix et al. (above) — what trackers actually probe
- **Microsoft docs**: font list per Windows version + language pack fonts
  https://learn.microsoft.com/en-us/typography/fonts/windows_11_font_list
- **Apple docs**: fonts per macOS version
  https://support.apple.com/en-us/103206
- **Linux**: dejavu + liberation + noto baseline, locale-specific Noto variants
- **App-bundled fonts**: Office (~70% of Win), LibreOffice (common on Linux), Adobe (~10%)
- **Opt-in data collection**: future feature — extension users can contribute their real font fingerprint anonymously, building a real-world dataset per region

### Ship as static JSON
Per profile, only need to answer true/false for the 66 probed fonts:
```json
{
  "win11-de": {
    "Arial": true, "Arial Black": true, "Calibri": true, "Cambria": true,
    "Comic Sans MS": true, "Consolas": true, "Courier New": true,
    "Georgia": true, "Helvetica": false, "Helvetica Neue": false,
    "Impact": true, "Lucida Console": true, "Monaco": false,
    "MS Gothic": false, "Segoe UI": true, "Tahoma": true,
    "Times New Roman": true, "Trebuchet MS": true, "Verdana": true,
    "AppleGothic": false, "Geneva": false, "LUCIDA GRANDE": false,
    ...
  }
}
```
- 66 booleans per profile — tiny file
- ~20-30 profiles total
- Updated yearly or via opt-in data collection

### Open questions
- Real-world font stats per country don't exist publicly — need to approximate from OS+locale+common apps, or build our own dataset via opt-in
- How to handle `@font-face` web fonts vs system fonts — only spoof system font detection
- Firefox `privacy.resistFingerprinting` already restricts fonts — detect and don't double-patch

---

## Testing strategy

Multi-layer approach to verify fingerprint spoofing works correctly and isn't detectable.

### 1. Internal test page (`fingerprint-check.html`)
Extend the existing test page to show all spoofed signals:
- [ ] Canvas hash (draw test pattern, read back via `toDataURL`, show hash)
- [ ] WebGL hash (render scene, `readPixels`, hash)
- [ ] WebGL renderer/vendor strings
- [ ] Detected font list (probe the 66 fingerprinted fonts)
- [ ] AudioContext fingerprint
- [ ] Timezone, locale, screen, navigator signals
- [ ] Container ID (so we can verify different containers show different values)

**Test procedure**: open the page in two different containers → all hashes should differ. Open twice in the same container → all hashes should be identical.

### 2. Third-party fingerprint test sites
Open in different containers and compare fingerprint hashes:
- [ ] https://coveryourtracks.eff.org — EFF, most comprehensive, shows uniqueness score
- [ ] https://browserleaks.com/canvas — canvas fingerprint specifically
- [ ] https://browserleaks.com/fonts — font detection specifically
- [ ] https://browserleaks.com/webgl — WebGL signals
- [ ] https://amiunique.org — overall fingerprint uniqueness
- [ ] https://abrahamjuliot.github.io/creepjs/ — advanced, detects anti-fingerprint tampering

**Pass criteria**: different fingerprint hash per container on all sites.

### 3. CreepJS tamper detection
CreepJS (https://abrahamjuliot.github.io/creepjs/) specifically detects spoofing:
- Shows a **trust score** — higher = less tampering detected
- **"lies"** section appears if it detects patched/spoofed APIs
- **"trash"** section appears if signals look fabricated
- Individual rows highlighted red/orange = inconsistency detected

**Pass criteria**: no "lies" or "trash" sections after implementing spoofing. All indicators green. This is the hardest test — if CreepJS doesn't flag us, our spoofing is natural enough.

**Current baseline**: clean (no lies/trash with unmodified Firefox). Must maintain this after adding spoofing.

### 4. Automated cross-container tests
Extension-internal test that can run via messaging API:
```
Background script sends "run fingerprint test" to content scripts in different containers
→ Each content script draws canvas, probes fonts, reads WebGL, hashes everything
→ Background collects results, asserts:
  - container_A.hash !== container_B.hash (different identity)
  - container_A.hash_run1 === container_A.hash_run2 (deterministic)
  - All signals in profile are internally consistent
```

### 5. Profile consistency validation
Offline unit tests that validate profile bundles:
- [ ] Win32 platform → no macOS-only fonts (Helvetica Neue, SF Pro, Monaco)
- [ ] macOS platform → no Windows-only fonts (Calibri, Segoe UI, MS Gothic)
- [ ] GPU renderer matches platform (no Intel UHD on macOS ARM)
- [ ] CPU cores plausible for GPU tier
- [ ] Screen resolution plausible for device class
- [ ] Language matches region

### 6. Anti-bypass tests
Verify spoofing can't be circumvented:
- [ ] Caching `toDataURL` reference before our script → should fail (`document_start` runs first)
- [ ] Canvas in `<iframe>` → must work (`all_frames: true` in manifest)
- [ ] `OffscreenCanvas` → need to patch `OffscreenCanvas.prototype.getContext` too
- [ ] `createImageBitmap` → verify it doesn't leak real canvas data
- [ ] `Worker` with `OffscreenCanvas` → content scripts don't run in workers, need alternative
- [ ] `document.fonts.check()` vs measurement-based font detection → both must be patched

### 7. Visual regression
Ensure spoofing doesn't visibly break page rendering:
- [ ] Sub-pixel canvas shift is invisible to the naked eye
- [ ] Font spoofing doesn't cause layout shifts (only affects measurement, not rendering)
- [ ] WebGL scenes render correctly (no visible artifacts from projection offset)
- Open common sites (Google, YouTube, GitHub, maps) and verify no visual glitches
