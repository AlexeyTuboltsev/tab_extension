/**
 * URL pattern matching with a simple, precise domain-based format.
 *
 * Format:
 *   domain.tld             → matches domain.tld and all subdomains (*.domain.tld)
 *   sub.domain.tld         → matches sub.domain.tld exactly (and its subdomains)
 *   domain.tld/path        → matches domain.tld/path* (and subdomains)
 *
 * The rule: whatever you type as the domain, we match it and anything
 * that ends with .{your input}. No wildcards, no guessing.
 */

const MatchPattern = (() => {

  /**
   * Parse a friendly pattern into { domain, path }.
   * Returns null if invalid.
   */
  function parse(pattern) {
    if (!pattern || typeof pattern !== 'string') return null;
    let input = pattern.trim().toLowerCase();

    // Strip scheme if pasted
    input = input.replace(/^https?:\/\//, '');
    // Strip trailing slash or wildcard
    input = input.replace(/\/\*$/, '/').replace(/\/$/, '');

    if (!input) return null;

    // Split into domain and path on first /
    const slashIdx = input.indexOf('/');
    let domain, path;
    if (slashIdx !== -1) {
      domain = input.slice(0, slashIdx);
      path = input.slice(slashIdx); // includes leading /
    } else {
      domain = input;
      path = null;
    }

    // Basic domain validation: must have at least one dot, no spaces, no wildcards
    if (!domain || !domain.includes('.') || /\s/.test(domain) || domain.includes('*')) return null;

    return { domain, path };
  }

  /**
   * Test whether a URL matches a pattern.
   */
  function matches(url, pattern) {
    if (!pattern || typeof pattern !== 'string') return false;

    const parsed = parse(pattern);
    if (!parsed) return false;

    let urlObj;
    try {
      urlObj = new URL(url);
    } catch {
      return false;
    }

    // Only http/https
    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
      return false;
    }

    // Domain match: exact or subdomain
    const hostname = urlObj.hostname.toLowerCase();
    if (hostname !== parsed.domain && !hostname.endsWith('.' + parsed.domain)) {
      return false;
    }

    // Path match: prefix
    if (parsed.path) {
      const urlPath = urlObj.pathname + urlObj.search;
      if (!urlPath.startsWith(parsed.path)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validate a pattern.
   */
  function isValid(pattern) {
    return parse(pattern) !== null;
  }

  /**
   * Convert a hostname to a clean domain for auto-generated rules.
   * "www.paypal.com" → "paypal.com"
   * Strips common prefixes like www, www2, etc.
   */
  function domainToFriendly(hostname) {
    return hostname.replace(/^www\d*\./, '');
  }

  return { matches, isValid, parse, domainToFriendly };
})();
