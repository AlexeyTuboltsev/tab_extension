# Container Tab Manager

A Firefox extension that isolates every new tab in its own container, with smart URL-based routing rules, per-container fingerprint noise, timezone spoofing, and hardware profile mimicry.

## How It Works

Every HTTP request in the default Firefox context is intercepted and reopened in a fresh ephemeral container. This gives each tab its own cookie jar, storage, and fingerprint — preventing cross-site tracking without any manual setup.

Containers can be saved with URL patterns so that related sites (e.g. `amazon.*`) always share the same container. Shared providers like PayPal and Stripe automatically inherit the originating container's context for seamless auth flows.

## Features

### Container Management
- **Automatic isolation** — new tabs get new ephemeral containers by default
- **Saved containers** — pin containers with custom name, color, and icon; persists across restarts
- **Ephemeral lifecycle** — temporary containers are auto-destroyed when their last tab closes
- **Context menu** — right-click to open links in a specific container or a new one

### URL Routing Rules
- **Global rules** — route URL patterns to a specific saved container (e.g. `amazon.*` → "Amazon")
- **Container rules** — share cookies for patterns opened from a specific container
- **Shared providers** — PayPal, Stripe, Klarna, Google Accounts, etc. auto-share with the originating container
- **Port matching** — patterns like `127.0.0.1:18789` match only on that port

Pattern format: `domain.tld`, `sub.domain.tld`, `domain.tld/path`, `domain.*` (any TLD), `domain.tld:port`

### Fingerprint Isolation

Each container gets a deterministic fingerprint derived from its ID:

- **Canvas** — sub-pixel translate + LSB noise on readback (`toDataURL`, `getImageData`)
- **WebGL** — LSB noise on `readPixels` (WebGL1 + WebGL2)
- **Audio** — tiny frequency offset on oscillators + noise on `getFloatFrequencyData`

Same container always produces the same fingerprint. Different containers produce different fingerprints.

### Timezone Spoofing
- Detects timezone from public IP via geolocation APIs
- Overrides `Date.getTimezoneOffset()`, `Date.toString()`, `Intl.DateTimeFormat` in page context
- Auto-refreshes on VPN connect/disconnect, idle return, and new tab creation

### Hardware Profile Mimicry
- Per-container spoofing of `navigator.platform`, `hardwareConcurrency`, `deviceMemory`, `languages`
- Screen resolution and `devicePixelRatio` override
- WebGL vendor/renderer spoofing via `WEBGL_debug_renderer_info`
- Regional profile selection based on IP country (EU/US variants for Windows/Mac)

### Privacy
- Strips `Referer` headers for shared provider requests across domains
- Injects `Referrer-Policy: no-referrer` for payment/auth providers
- No telemetry — `data_collection_permissions` set to `none`

## UI

**Popup** — shows the current tab's container context. Save ephemeral containers, edit rules, manage shared providers.

**Options page** — full list of saved containers and shared providers with editing.

**Toolbar icon** — color-coded per container (filled = saved, outlined = ephemeral).

## Installation

1. Clone this repo
2. Open `about:debugging` in Firefox
3. Click "Load Temporary Add-on" and select `manifest.json`

Requires Firefox 109+ with container tabs enabled (`privacy.userContext.enabled = true`).

## Testing

```bash
# Unit tests (Jest)
npm install
npm test

# E2E tests (Dockerized Firefox + Claudezilla)
bash tests/e2e/run.sh
```

Unit tests cover pattern matching, rule engine evaluation, tab interception logic, and container environment config. E2E tests verify tab interception, timezone spoofing, and cross-container fingerprint divergence in a real Firefox instance.

## Architecture

```
background/
  background.js          — init, message handling, dynamic content script registration
  container-manager.js   — ephemeral/saved container lifecycle
  rule-engine.js         — URL → container routing decisions
  tab-interceptor.js     — webRequest interception and tab replacement
  container-env.js       — per-container config delivery via cookie
  storage-manager.js     — persistent storage abstraction
  ip-timezone.js         — IP geolocation for timezone detection
  context-menu.js        — right-click menu
  page-action-indicator.js — toolbar icon

content/
  container-env.js       — reads config cookie, injects timezone + fingerprint overrides via <script> tag
  profile-spoof.js       — navigator/screen/WebGL hardware profile spoofing

shared/
  match-pattern.js       — URL pattern parsing and matching
  constants.js           — storage keys

popup/                   — browser action popup UI
options/                 — extension options page
data/profiles.json       — regional hardware profiles
```

## License

MIT
