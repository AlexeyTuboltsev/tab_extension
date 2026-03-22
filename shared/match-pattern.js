/**
 * URL pattern matching with a simple, precise domain-based format.
 *
 * Format:
 *   domain.tld             → matches domain.tld and all subdomains
 *   sub.domain.tld         → matches sub.domain.tld and its subdomains
 *   domain.tld/path        → matches domain.tld/path* and subdomains
 *   domain.*               → matches domain with ANY TLD (amazon.com, amazon.de, amazon.co.uk)
 *   domain.tld:8080        → matches only on port 8080
 *   127.0.0.1:18789        → matches IP + port combination
 *
 * The rule: whatever you type as the domain, we match it and anything
 * that ends with .{your input}. The .* suffix matches any TLD.
 * If a port is specified, it must match exactly; otherwise any port matches.
 */

const MatchPattern = (() => {

  function parse(pattern) {
    if (!pattern || typeof pattern !== 'string') return null;
    let input = pattern.trim().toLowerCase();
    input = input.replace(/^https?:\/\//, '');
    input = input.replace(/\/\*$/, '/').replace(/\/$/, '');
    if (!input) return null;
    const slashIdx = input.indexOf('/');
    let domain, path;
    if (slashIdx !== -1) {
      domain = input.slice(0, slashIdx);
      path = input.slice(slashIdx);
    } else {
      domain = input;
      path = null;
    }
    if (!domain || /\s/.test(domain)) return null;
    // Extract port if present (e.g. "example.com:8080" or "127.0.0.1:18789")
    let port = null;
    const lastColon = domain.lastIndexOf(':');
    if (lastColon !== -1) {
      const maybPort = domain.slice(lastColon + 1);
      if (/^\d+$/.test(maybPort)) {
        port = maybPort;
        domain = domain.slice(0, lastColon);
      }
    }
    if (domain.endsWith('.*')) {
      const base = domain.slice(0, -2);
      if (!base || base.includes('*')) return null;
      return { domain: base, path, port, anyTLD: true };
    }
    if (!domain.includes('.') || domain.includes('*')) return null;
    return { domain, path, port, anyTLD: false };
  }

  function matches(url, pattern) {
    if (!pattern || typeof pattern !== 'string') return false;
    const parsed = parse(pattern);
    if (!parsed) return false;
    let urlObj;
    try { urlObj = new URL(url); } catch { return false; }
    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') return false;
    const hostname = urlObj.hostname.toLowerCase();
    if (parsed.port && urlObj.port !== parsed.port) return false;
    if (parsed.anyTLD) {
      const parts = hostname.split('.');
      const baseIdx = parts.indexOf(parsed.domain);
      if (baseIdx === -1) return false;
      if (parts.length - baseIdx - 1 < 1) return false;
    } else {
      if (hostname !== parsed.domain && !hostname.endsWith('.' + parsed.domain)) return false;
    }
    if (parsed.path) {
      const urlPath = urlObj.pathname + urlObj.search;
      if (!urlPath.startsWith(parsed.path)) return false;
    }
    return true;
  }

  function isValid(pattern) { return parse(pattern) !== null; }

  function domainToFriendly(hostname) {
    return hostname.replace(/^www\d*\./, '');
  }

  function patternsOverlap(patternA, patternB) {
    const a = parse(patternA);
    const b = parse(patternB);
    if (!a || !b) return false;
    // Different explicit ports never overlap
    if (a.port && b.port && a.port !== b.port) return false;
    if (!domainsOverlap(a, b)) return false;
    if (a.path && b.path) {
      if (!a.path.startsWith(b.path) && !b.path.startsWith(a.path)) return false;
    }
    return true;
  }

  function domainsOverlap(a, b) {
    if (a.anyTLD && b.anyTLD) {
      return a.domain === b.domain || a.domain.endsWith('.' + b.domain) || b.domain.endsWith('.' + a.domain);
    }
    if (a.anyTLD || b.anyTLD) {
      const wild = a.anyTLD ? a : b;
      const exact = a.anyTLD ? b : a;
      const parts = exact.domain.split('.');
      return parts.includes(wild.domain) || exact.domain === wild.domain || exact.domain.startsWith(wild.domain + '.') || exact.domain.endsWith('.' + wild.domain);
    }
    return a.domain === b.domain || a.domain.endsWith('.' + b.domain) || b.domain.endsWith('.' + a.domain);
  }

  return { matches, isValid, parse, domainToFriendly, patternsOverlap };
})();
