/**
 * Setup Firefox profile with both extensions sideloaded.
 *
 * Creates /app/firefox-profile/ with:
 *   - Container Tab Manager extension
 *   - Claudezilla extension
 *   - user.js prefs for unsigned extensions and containers
 */

import { mkdirSync, cpSync, writeFileSync } from 'fs';
import { join } from 'path';

const PROFILE_DIR = '/app/firefox-profile';
const EXTENSIONS_DIR = join(PROFILE_DIR, 'extensions');

// Extension IDs from their manifest.json files
const CLAUDEZILLA_ID = 'claudezilla@boot.industries';
const CTM_ID = 'container-tab-manager@alexeytuboltsev';

// Source paths (as mounted in Docker)
const CLAUDEZILLA_SRC = '/app/claudezilla/extension';
const CTM_SRC = '/app/extension';

console.log('Creating Firefox profile at', PROFILE_DIR);

// 1. Create profile and extensions directories
mkdirSync(EXTENSIONS_DIR, { recursive: true });

// 2. Copy Claudezilla extension
const claudezillaDest = join(EXTENSIONS_DIR, CLAUDEZILLA_ID);
console.log(`Copying Claudezilla extension to ${claudezillaDest}`);
cpSync(CLAUDEZILLA_SRC, claudezillaDest, { recursive: true });

// 3. Copy Container Tab Manager extension
const ctmDest = join(EXTENSIONS_DIR, CTM_ID);
console.log(`Copying CTM extension to ${ctmDest}`);
cpSync(CTM_SRC, ctmDest, { recursive: true });

// 4. Write user.js with required prefs
const userJs = `
// Allow unsigned extensions
user_pref("xpinstall.signatures.required", false);

// Auto-enable sideloaded extensions (disable scopes that block auto-enable)
user_pref("extensions.autoDisableScopes", 10);
user_pref("extensions.enabledScopes", 5);

// Enable container tabs
user_pref("privacy.userContext.enabled", true);
user_pref("privacy.userContext.ui.enabled", true);
`;

writeFileSync(join(PROFILE_DIR, 'user.js'), userJs);
console.log('Wrote user.js');

console.log('Firefox profile setup complete.');
