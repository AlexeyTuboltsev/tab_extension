const { loadIIFE } = require('./helpers');
const MatchPattern = loadIIFE('shared/match-pattern.js', 'MatchPattern');

describe('MatchPattern.parse', () => {
  test('parses simple domain', () => {
    expect(MatchPattern.parse('amazon.com')).toEqual({ domain: 'amazon.com', path: null, port: null, anyTLD: false });
  });

  test('parses domain with path', () => {
    expect(MatchPattern.parse('google.com/maps')).toEqual({ domain: 'google.com', path: '/maps', port: null, anyTLD: false });
  });

  test('parses wildcard TLD', () => {
    expect(MatchPattern.parse('amazon.*')).toEqual({ domain: 'amazon', path: null, port: null, anyTLD: true });
  });

  test('strips scheme', () => {
    expect(MatchPattern.parse('https://example.com')).toEqual({ domain: 'example.com', path: null, port: null, anyTLD: false });
  });

  test('strips trailing slash', () => {
    expect(MatchPattern.parse('example.com/')).toEqual({ domain: 'example.com', path: null, port: null, anyTLD: false });
  });

  test('strips trailing wildcard path', () => {
    expect(MatchPattern.parse('example.com/*')).toEqual({ domain: 'example.com', path: null, port: null, anyTLD: false });
  });

  test('lowercases', () => {
    expect(MatchPattern.parse('EXAMPLE.COM')).toEqual({ domain: 'example.com', path: null, port: null, anyTLD: false });
  });

  test('parses domain with port', () => {
    expect(MatchPattern.parse('example.com:8080')).toEqual({ domain: 'example.com', path: null, port: '8080', anyTLD: false });
  });

  test('parses IP with port', () => {
    expect(MatchPattern.parse('127.0.0.1:18789')).toEqual({ domain: '127.0.0.1', path: null, port: '18789', anyTLD: false });
  });

  test('parses domain with port and path', () => {
    expect(MatchPattern.parse('example.com:3000/api')).toEqual({ domain: 'example.com', path: '/api', port: '3000', anyTLD: false });
  });

  test('parses scheme + domain + port', () => {
    expect(MatchPattern.parse('http://127.0.0.1:18789')).toEqual({ domain: '127.0.0.1', path: null, port: '18789', anyTLD: false });
  });

  test('rejects empty', () => {
    expect(MatchPattern.parse('')).toBeNull();
    expect(MatchPattern.parse(null)).toBeNull();
    expect(MatchPattern.parse(undefined)).toBeNull();
  });

  test('rejects domain without dot', () => {
    expect(MatchPattern.parse('localhost')).toBeNull();
  });

  test('rejects domain with spaces', () => {
    expect(MatchPattern.parse('example .com')).toBeNull();
  });

  test('rejects domain with wildcards in wrong place', () => {
    expect(MatchPattern.parse('*.example.com')).toBeNull();
    expect(MatchPattern.parse('exam*ple.com')).toBeNull();
  });

  test('rejects double wildcard TLD', () => {
    expect(MatchPattern.parse('*.*')).toBeNull();
  });
});

describe('MatchPattern.isValid', () => {
  test('valid patterns', () => {
    expect(MatchPattern.isValid('amazon.com')).toBe(true);
    expect(MatchPattern.isValid('amazon.*')).toBe(true);
    expect(MatchPattern.isValid('google.com/maps')).toBe(true);
    expect(MatchPattern.isValid('sub.domain.co.uk')).toBe(true);
  });

  test('invalid patterns', () => {
    expect(MatchPattern.isValid('')).toBe(false);
    expect(MatchPattern.isValid('localhost')).toBe(false);
    expect(MatchPattern.isValid('*.com')).toBe(false);
    expect(MatchPattern.isValid('paypal')).toBe(false);
  });
});

describe('MatchPattern.matches', () => {
  describe('exact domain', () => {
    test('matches exact domain', () => {
      expect(MatchPattern.matches('https://amazon.com/', 'amazon.com')).toBe(true);
    });

    test('matches subdomain', () => {
      expect(MatchPattern.matches('https://www.amazon.com/', 'amazon.com')).toBe(true);
      expect(MatchPattern.matches('https://shop.amazon.com/', 'amazon.com')).toBe(true);
    });

    test('does not match different domain', () => {
      expect(MatchPattern.matches('https://google.com/', 'amazon.com')).toBe(false);
    });

    test('does not match partial domain name', () => {
      expect(MatchPattern.matches('https://notamazon.com/', 'amazon.com')).toBe(false);
    });
  });

  describe('wildcard TLD', () => {
    test('matches .com', () => {
      expect(MatchPattern.matches('https://amazon.com/', 'amazon.*')).toBe(true);
    });

    test('matches .de', () => {
      expect(MatchPattern.matches('https://amazon.de/', 'amazon.*')).toBe(true);
    });

    test('matches .co.uk', () => {
      expect(MatchPattern.matches('https://amazon.co.uk/', 'amazon.*')).toBe(true);
    });

    test('matches subdomain with any TLD', () => {
      expect(MatchPattern.matches('https://www.amazon.com/', 'amazon.*')).toBe(true);
      expect(MatchPattern.matches('https://smile.amazon.de/', 'amazon.*')).toBe(true);
    });

    test('does not match different domain', () => {
      expect(MatchPattern.matches('https://notamazon.com/', 'amazon.*')).toBe(false);
      expect(MatchPattern.matches('https://myamazon.de/', 'amazon.*')).toBe(false);
    });

    test('does not match domain in path', () => {
      expect(MatchPattern.matches('https://wikipedia.org/wiki/Amazon', 'amazon.*')).toBe(false);
    });
  });

  describe('path matching', () => {
    test('matches path prefix', () => {
      expect(MatchPattern.matches('https://google.com/maps/place/Berlin', 'google.com/maps')).toBe(true);
    });

    test('does not match different path', () => {
      expect(MatchPattern.matches('https://google.com/search?q=test', 'google.com/maps')).toBe(false);
    });

    test('no path matches all paths', () => {
      expect(MatchPattern.matches('https://google.com/anything/here', 'google.com')).toBe(true);
    });
  });

  describe('scheme handling', () => {
    test('matches http', () => {
      expect(MatchPattern.matches('http://example.com/', 'example.com')).toBe(true);
    });

    test('matches https', () => {
      expect(MatchPattern.matches('https://example.com/', 'example.com')).toBe(true);
    });

    test('does not match ftp', () => {
      expect(MatchPattern.matches('ftp://example.com/', 'example.com')).toBe(false);
    });

    test('does not match about:', () => {
      expect(MatchPattern.matches('about:blank', 'example.com')).toBe(false);
    });
  });

  describe('port matching', () => {
    test('pattern with port matches URL with same port', () => {
      expect(MatchPattern.matches('http://127.0.0.1:18789/', '127.0.0.1:18789')).toBe(true);
    });

    test('pattern with port does not match URL with different port', () => {
      expect(MatchPattern.matches('http://127.0.0.1:3000/', '127.0.0.1:18789')).toBe(false);
    });

    test('pattern with port does not match URL with no port', () => {
      expect(MatchPattern.matches('http://example.com/', 'example.com:8080')).toBe(false);
    });

    test('pattern without port matches URL with any port', () => {
      expect(MatchPattern.matches('http://example.com:8080/', 'example.com')).toBe(true);
      expect(MatchPattern.matches('http://example.com:3000/', 'example.com')).toBe(true);
      expect(MatchPattern.matches('http://example.com/', 'example.com')).toBe(true);
    });

    test('port + path matching', () => {
      expect(MatchPattern.matches('http://localhost.localdomain:3000/api/data', 'localhost.localdomain:3000/api')).toBe(true);
      expect(MatchPattern.matches('http://localhost.localdomain:8080/api/data', 'localhost.localdomain:3000/api')).toBe(false);
    });

    test('port + subdomain matching', () => {
      expect(MatchPattern.matches('http://app.example.com:8080/', 'example.com:8080')).toBe(true);
      expect(MatchPattern.matches('http://app.example.com:9090/', 'example.com:8080')).toBe(false);
    });
  });

  describe('edge cases', () => {
    test('null/undefined url', () => {
      expect(MatchPattern.matches(null, 'example.com')).toBe(false);
      expect(MatchPattern.matches(undefined, 'example.com')).toBe(false);
    });

    test('null/undefined pattern', () => {
      expect(MatchPattern.matches('https://example.com/', null)).toBe(false);
      expect(MatchPattern.matches('https://example.com/', undefined)).toBe(false);
    });

    test('invalid url', () => {
      expect(MatchPattern.matches('not a url', 'example.com')).toBe(false);
    });
  });
});

describe('MatchPattern.domainToFriendly', () => {
  test('strips www', () => {
    expect(MatchPattern.domainToFriendly('www.example.com')).toBe('example.com');
  });

  test('strips www2', () => {
    expect(MatchPattern.domainToFriendly('www2.example.com')).toBe('example.com');
  });

  test('leaves non-www subdomains', () => {
    expect(MatchPattern.domainToFriendly('shop.example.com')).toBe('shop.example.com');
  });

  test('leaves bare domain', () => {
    expect(MatchPattern.domainToFriendly('example.com')).toBe('example.com');
  });
});

describe('MatchPattern.patternsOverlap', () => {
  describe('exact domains', () => {
    test('same domain overlaps', () => {
      expect(MatchPattern.patternsOverlap('amazon.com', 'amazon.com')).toBe(true);
    });

    test('subdomain overlaps parent', () => {
      expect(MatchPattern.patternsOverlap('shop.amazon.com', 'amazon.com')).toBe(true);
      expect(MatchPattern.patternsOverlap('amazon.com', 'shop.amazon.com')).toBe(true);
    });

    test('different domains do not overlap', () => {
      expect(MatchPattern.patternsOverlap('amazon.com', 'google.com')).toBe(false);
    });
  });

  describe('wildcard TLD', () => {
    test('wildcard overlaps with exact', () => {
      expect(MatchPattern.patternsOverlap('amazon.*', 'amazon.com')).toBe(true);
      expect(MatchPattern.patternsOverlap('amazon.com', 'amazon.*')).toBe(true);
    });

    test('same wildcard overlaps', () => {
      expect(MatchPattern.patternsOverlap('amazon.*', 'amazon.*')).toBe(true);
    });

    test('different wildcard domains do not overlap', () => {
      expect(MatchPattern.patternsOverlap('amazon.*', 'google.*')).toBe(false);
    });
  });

  describe('path overlap', () => {
    test('no path overlaps with path', () => {
      expect(MatchPattern.patternsOverlap('google.com', 'google.com/maps')).toBe(true);
    });

    test('same path overlaps', () => {
      expect(MatchPattern.patternsOverlap('google.com/maps', 'google.com/maps')).toBe(true);
    });

    test('prefix path overlaps', () => {
      expect(MatchPattern.patternsOverlap('google.com/maps', 'google.com/maps/place')).toBe(true);
    });

    test('different paths do not overlap', () => {
      expect(MatchPattern.patternsOverlap('google.com/maps', 'google.com/search')).toBe(false);
    });
  });

  describe('port overlap', () => {
    test('same port overlaps', () => {
      expect(MatchPattern.patternsOverlap('example.com:8080', 'example.com:8080')).toBe(true);
    });

    test('different ports do not overlap', () => {
      expect(MatchPattern.patternsOverlap('example.com:8080', 'example.com:3000')).toBe(false);
    });

    test('no port overlaps with port (port is more specific)', () => {
      expect(MatchPattern.patternsOverlap('example.com', 'example.com:8080')).toBe(true);
    });
  });

  describe('invalid patterns', () => {
    test('invalid pattern does not overlap', () => {
      expect(MatchPattern.patternsOverlap('localhost', 'amazon.com')).toBe(false);
      expect(MatchPattern.patternsOverlap('', 'amazon.com')).toBe(false);
    });
  });
});
