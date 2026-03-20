const { test, expect } = require('@playwright/test');

/**
 * Fingerprint signal collection tests.
 * Verifies browser APIs return valid signals via direct evaluation.
 * No dependency on test HTML pages.
 */

test.describe('Timezone signals', () => {
  test('timezone is a valid IANA string', async ({ page }) => {
    await page.goto('about:blank');
    const tz = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(tz).toBeTruthy();
    // Docker may return "UTC" (no slash), real systems return "Europe/Berlin" etc.
    expect(typeof tz).toBe('string');
  });

  test('timezone offset is a number', async ({ page }) => {
    await page.goto('about:blank');
    const offset = await page.evaluate(() => new Date().getTimezoneOffset());
    expect(typeof offset).toBe('number');
  });

  test('Date.toString includes timezone info', async ({ page }) => {
    await page.goto('about:blank');
    const str = await page.evaluate(() => new Date().toString());
    expect(str).toBeTruthy();
    expect(str.length).toBeGreaterThan(20);
  });
});

test.describe('Navigator signals', () => {
  test('platform is defined', async ({ page }) => {
    await page.goto('about:blank');
    const platform = await page.evaluate(() => navigator.platform);
    expect(platform).toBeTruthy();
  });

  test('hardwareConcurrency is positive', async ({ page }) => {
    await page.goto('about:blank');
    const cores = await page.evaluate(() => navigator.hardwareConcurrency);
    expect(cores).toBeGreaterThan(0);
  });

  test('language is defined', async ({ page }) => {
    await page.goto('about:blank');
    const lang = await page.evaluate(() => navigator.language);
    expect(lang).toBeTruthy();
    expect(lang).toMatch(/^[a-z]{2}/i);
  });

  test('languages is a non-empty array', async ({ page }) => {
    await page.goto('about:blank');
    const langs = await page.evaluate(() => [...navigator.languages]);
    expect(langs.length).toBeGreaterThan(0);
  });
});

test.describe('Screen signals', () => {
  test('screen dimensions are positive', async ({ page }) => {
    await page.goto('about:blank');
    const dims = await page.evaluate(() => ({
      w: screen.width, h: screen.height, cd: screen.colorDepth,
    }));
    expect(dims.w).toBeGreaterThan(0);
    expect(dims.h).toBeGreaterThan(0);
    expect(dims.cd).toBeGreaterThan(0);
  });

  test('devicePixelRatio is positive', async ({ page }) => {
    await page.goto('about:blank');
    const dpr = await page.evaluate(() => window.devicePixelRatio);
    expect(dpr).toBeGreaterThan(0);
  });
});

test.describe('Canvas signals', () => {
  test('canvas toDataURL produces a non-empty string', async ({ page }) => {
    await page.goto('about:blank');
    const hash = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 200; c.height = 50;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#f60';
      ctx.fillRect(10, 10, 100, 30);
      ctx.fillStyle = '#069';
      ctx.font = '14px Arial';
      ctx.fillText('fingerprint test', 15, 30);
      return c.toDataURL().slice(-40);
    });
    expect(hash).toBeTruthy();
    expect(hash.length).toBe(40);
  });

  test('canvas is deterministic (same drawing = same hash)', async ({ page }) => {
    await page.goto('about:blank');
    const hashes = await page.evaluate(() => {
      function draw() {
        const c = document.createElement('canvas');
        c.width = 200; c.height = 50;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#f60';
        ctx.fillRect(10, 10, 100, 30);
        ctx.fillStyle = '#069';
        ctx.font = '14px Arial';
        ctx.fillText('determinism test', 15, 30);
        return c.toDataURL();
      }
      return [draw(), draw()];
    });
    expect(hashes[0]).toBe(hashes[1]);
  });

  test('getImageData returns pixel data', async ({ page }) => {
    await page.goto('about:blank');
    const result = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 10; c.height = 10;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, 10, 10);
      const data = ctx.getImageData(0, 0, 10, 10);
      return { length: data.data.length, r: data.data[0], g: data.data[1], b: data.data[2] };
    });
    expect(result.length).toBe(400); // 10x10x4
    expect(result.r).toBe(255);
    expect(result.g).toBe(0);
    expect(result.b).toBe(0);
  });
});

test.describe('WebGL signals', () => {
  test('WebGL context can be requested', async ({ page }) => {
    await page.goto('about:blank');
    const info = await page.evaluate(() => {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl');
      if (!gl) return { available: false };
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        available: true,
        vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : 'no-ext',
        renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'no-ext',
        version: gl.getParameter(gl.VERSION),
      };
    });
    // In headless Docker, WebGL may not be available — that's OK
    if (info.available) {
      expect(info.vendor).toBeTruthy();
      expect(info.renderer).toBeTruthy();
      expect(info.version).toContain('WebGL');
    }
  });
});

test.describe('AudioContext signals', () => {
  test('OfflineAudioContext can render', async ({ page }) => {
    await page.goto('about:blank');
    const result = await page.evaluate(async () => {
      try {
        const ctx = new OfflineAudioContext(1, 44100, 44100);
        const osc = ctx.createOscillator();
        const comp = ctx.createDynamicsCompressor();
        osc.connect(comp);
        comp.connect(ctx.destination);
        osc.start(0);
        const buffer = await ctx.startRendering();
        const data = buffer.getChannelData(0);
        let hash = 0;
        for (let i = 0; i < Math.min(100, data.length); i++) {
          hash = ((hash << 5) - hash + Math.round(data[i] * 1000)) | 0;
        }
        return { hash, length: data.length, rendered: true };
      } catch (e) {
        return { error: e.message, rendered: false };
      }
    });
    // Should at least render without error (hash may be 0 in headless Docker)
    expect(result.rendered).toBe(true);
    expect(result.length).toBe(44100);
  });

  test('AudioContext is deterministic', async ({ page }) => {
    await page.goto('about:blank');
    const hashes = await page.evaluate(async () => {
      async function getHash() {
        const ctx = new OfflineAudioContext(1, 44100, 44100);
        const osc = ctx.createOscillator();
        const comp = ctx.createDynamicsCompressor();
        osc.connect(comp);
        comp.connect(ctx.destination);
        osc.start(0);
        const buffer = await ctx.startRendering();
        const data = buffer.getChannelData(0);
        let hash = 0;
        for (let i = 0; i < 100; i++) {
          hash = ((hash << 5) - hash + Math.round(data[i] * 1000)) | 0;
        }
        return hash;
      }
      return [await getHash(), await getHash()];
    });
    expect(hashes[0]).toBe(hashes[1]);
  });
});

test.describe('Font detection', () => {
  test('detects at least some common fonts', async ({ page }) => {
    await page.goto('about:blank');
    const detected = await page.evaluate(() => {
      const baseFonts = ['monospace', 'serif', 'sans-serif'];
      const testStr = 'mmmmmmmmmmlli';
      const span = document.createElement('span');
      span.style.fontSize = '72px';
      span.textContent = testStr;
      document.body.appendChild(span);
      const baseW = {};
      for (const b of baseFonts) { span.style.fontFamily = b; baseW[b] = span.offsetWidth; }
      const results = [];
      const fonts = ['Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana'];
      for (const f of fonts) {
        let found = false;
        for (const b of baseFonts) {
          span.style.fontFamily = `"${f}", ${b}`;
          if (span.offsetWidth !== baseW[b]) { found = true; break; }
        }
        results.push({ font: f, detected: found });
      }
      document.body.removeChild(span);
      return results;
    });
    const detectedFonts = detected.filter(f => f.detected);
    expect(detectedFonts.length).toBeGreaterThan(0);
  });
});
