/**
 * Load IIFE-based source files for testing.
 * Evaluates the file in a context where the IIFE result is captured.
 */
const fs = require('fs');
const path = require('path');

function loadIIFE(filePath, varName) {
  const code = fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8');
  // The source files assign to a const: `const Foo = (() => { ... })();`
  // We eval the IIFE part and return the result.
  const fn = new Function(`
    ${code}
    return ${varName};
  `);
  return fn();
}

// hashString from background.js
function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// noise function from fingerprint-noise.js
function noise(s, index) {
  let h = s ^ index;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
  h = h ^ (h >>> 16);
  return h;
}

module.exports = { loadIIFE, hashString, noise };
