/* Matrix Live Data Stream (v3)
   - Polling with Bearer token (Authorization header)
   - Adds on-screen API status + robust JSON flattening so you get "something" even for nested payloads.
*/

(() => {
  'use strict';

  const canvas = document.getElementById('matrix');
  const ctx = canvas.getContext('2d', { alpha: false });

  const hud = document.getElementById('hud');
  const hudClose = document.getElementById('hudClose');
  const endpointEl = document.getElementById('endpoint');
  const tokenEl = document.getElementById('token');
  const modeEl = document.getElementById('mode');
  const pollMsEl = document.getElementById('pollMs');
  const charsetEl = document.getElementById('charset');
  const trailEl = document.getElementById('trail');
  const apiStatusEl = document.getElementById('apiStatus');

  const GREEN = 'rgba(72, 255, 132, 1)';
  const BG_FADE = () => Math.min(0.30, Math.max(0.02, Number(trailEl.value || 0.08)));

  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    W = Math.floor(window.innerWidth);
    H = Math.floor(window.innerHeight);
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize, { passive: true });
  resize();

  const DIGITS = '0123456789';
  const HEX = '0123456789ABCDEF';
  const KATAKANA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
  const MATRIX = KATAKANA + DIGITS;

  function getCharset() {
    const v = (charsetEl.value || 'matrix').toLowerCase();
    if (v === 'hex') return HEX;
    if (v === 'digits') return DIGITS;
    return MATRIX;
  }

  // Data buffer
  const dataQueue = [];
  const MAX_QUEUE = 6000;

  function enqueueToken(tok) {
    if (tok == null) return;
    const s = String(tok);
    for (const ch of s) {
      if (dataQueue.length >= MAX_QUEUE) dataQueue.shift();
      dataQueue.push(ch);
    }
  }

  // Robust payload-to-tokens:
  // - If it's nested, we recursively walk and emit a compact stream of key=value pairs & numbers.
  // - This makes it much more likely you see your API's data without custom mapping.
  function flattenToTokens(value, path = '', out = [], depth = 0) {
    if (depth > 6) return out; // avoid runaway
    if (value == null) return out;

    const t = typeof value;

    if (t === 'string' || t === 'number' || t === 'boolean') {
      const key = path ? path.split('.').slice(-1)[0] : '';
      if (key) out.push(`${key}=${value} `);
      else out.push(`${value} `);
      return out;
    }

    if (Array.isArray(value)) {
      // If it's an array of primitives, emit them
      const primitive = value.every(v => v == null || ['string','number','boolean'].includes(typeof v));
      if (primitive) {
        for (const v of value) out.push(`${v} `);
        return out;
      }
      // Otherwise walk a limited number of items
      for (let i = 0; i < Math.min(30, value.length); i++) {
        flattenToTokens(value[i], path ? `${path}[${i}]` : `[${i}]`, out, depth + 1);
      }
      return out;
    }

    if (t === 'object') {
      const entries = Object.entries(value);
      for (let i = 0; i < Math.min(40, entries.length); i++) {
        const [k, v] = entries[i];
        const p = path ? `${path}.${k}` : k;
        flattenToTokens(v, p, out, depth + 1);
      }
      return out;
    }

    return out;
  }

  function normalizeApiPayload(payload) {
    try {
      const toks = flattenToTokens(payload);
      if (toks.length === 0) return;
      // Join into manageable chunks so we don't drown the queue
      const joined = toks.join('');
      enqueueToken(joined.slice(0, 1200));
    } catch {}
  }

  function takeTokenOrRandom(charset) {
    const useLive = dataQueue.length > 0 && Math.random() < 0.60;
    if (useLive) return dataQueue.shift();
    return charset[(Math.random() * charset.length) | 0];
  }

  function setApiStatus(text) {
    apiStatusEl.textContent = text;
  }

  // Feeds
  let stopFeed = null;
  function stopCurrentFeed() { if (typeof stopFeed === 'function') stopFeed(); stopFeed = null; }

  function startDemoFeed() {
    setApiStatus('API: demo (lokal data)');
    const fields = ['FLOW','NH4','NO3','PO4','COD','DO','TEMP','kWh','PUMP','VALVE','SENSOR','ALARM','OK','WARN','ID','TS'];
    const t0 = performance.now();
    const id = setInterval(() => {
      const t = (performance.now() - t0) / 1000;
      const flow = (1200 + 250 * Math.sin(t / 3)).toFixed(0);
      const nh4 = (2.5 + 0.8 * Math.sin(t / 5)).toFixed(2);
      const temp = (14.0 + 1.2 * Math.sin(t / 11)).toFixed(1);
      const kwh = (850 + 40 * Math.sin(t / 7)).toFixed(0);
      const pick = fields[(Math.random() * fields.length) | 0];
      enqueueToken(`${pick} ${flow} ${nh4} ${temp} ${kwh} `);
    }, 250);
    return () => clearInterval(id);
  }

  function buildAuthHeaders() {
    const token = (tokenEl.value || '').trim();
    const headers = {
      'Accept': 'application/json, text/plain;q=0.9, */*;q=0.8',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  function startPollingFeed(endpoint, pollMs) {
    let alive = true;
    let okCount = 0;

    async function tick() {
      if (!alive) return;

      const started = performance.now();
      try {
        const res = await fetch(endpoint, {
          cache: 'no-store',
          headers: buildAuthHeaders(),
        });

        const ms = Math.round(performance.now() - started);

        if (!res.ok) {
          setApiStatus(`API: HTTP ${res.status} (${ms}ms) — kontrollera token/behörighet`);
        } else {
          okCount++;
        }

        const ct = (res.headers.get('content-type') || '').toLowerCase();
        let payload;
        if (ct.includes('application/json')) payload = await res.json();
        else payload = await res.text();

        // If payload is text that looks like JSON, try parse
        if (typeof payload === 'string') {
          const s = payload.trim();
          if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
            try { payload = JSON.parse(s); } catch {}
          }
        }

        normalizeApiPayload(payload);

        if (res.ok) {
          const q = dataQueue.length;
          setApiStatus(`API: OK (${ms}ms) · injicerar data · queue=${q} · ok#=${okCount}`);
        }
      } catch (e) {
        // Usually CORS/network/DNS
        setApiStatus(`API: FEL (CORS/Nät) — öppna DevTools → Console/Network`);
        // small marker
        if (Math.random() < 0.30) enqueueToken('NET… ');
      } finally {
        setTimeout(tick, pollMs);
      }
    }

    tick();
    return () => { alive = false; };
  }

  function startSSEFeed(endpoint) {
    // SSE in browser cannot send Authorization header.
    setApiStatus('API: SSE (obs: inga Authorization-headers i webbläsaren)');
    let es;
    try { es = new EventSource(endpoint); } catch { return null; }
    es.onmessage = (ev) => {
      const raw = ev.data;
      try { normalizeApiPayload(JSON.parse(raw)); }
      catch { normalizeApiPayload(raw); }
    };
    es.onerror = () => setApiStatus('API: SSE fel — prova Polling istället');
    return () => { try { es.close(); } catch {} };
  }

  function startFeedFromSettings() {
    stopCurrentFeed();

    const endpoint = (endpointEl.value || '').trim();
    const mode = (modeEl.value || 'poll').toLowerCase();
    const pollMs = Math.max(200, Number(pollMsEl.value || 1000));

    if (!endpoint || mode === 'demo') { stopFeed = startDemoFeed(); return; }
    if (mode === 'sse') {
      const stopper = startSSEFeed(endpoint);
      if (stopper) { stopFeed = stopper; return; }
      // fall back to polling
    }

    stopFeed = startPollingFeed(endpoint, pollMs);
  }

  // Persist settings
  const saved = (() => { try { return JSON.parse(localStorage.getItem('matrix_settings') || '{}'); } catch { return {}; } })();
  endpointEl.value = saved.endpoint ?? '';
  tokenEl.value = saved.token ?? '';
  modeEl.value = saved.mode ?? 'poll';
  pollMsEl.value = saved.pollMs ?? 1000;
  charsetEl.value = saved.charset ?? 'matrix';
  trailEl.value = saved.trail ?? 0.08;

  function persistSettings() {
    localStorage.setItem('matrix_settings', JSON.stringify({
      endpoint: endpointEl.value,
      token: tokenEl.value,
      mode: modeEl.value,
      pollMs: Number(pollMsEl.value),
      charset: charsetEl.value,
      trail: Number(trailEl.value),
    }));
  }

  for (const el of [endpointEl, tokenEl, modeEl, pollMsEl, charsetEl, trailEl]) {
    el.addEventListener('change', () => { persistSettings(); startFeedFromSettings(); });
  }
  hudClose.addEventListener('click', () => toggleHud(false));

  startFeedFromSettings();

  // Multi-layer rain
  function makeLayer(fontPx, speedMul, densityMul, glow, alphaMul) {
    const layer = {
      fontPx, speedMul, densityMul, glow, alphaMul,
      columns: [], stepY: fontPx * 1.05, lastW: -1,
      init() {
        const colW = fontPx * 0.62;
        const count = Math.max(10, Math.floor(W / colW * densityMul));
        this.columns = new Array(count).fill(0).map(() => ({
          y: (Math.random() * -80) | 0,
          speed: (0.55 + Math.random() * 1.25) * speedMul,
          burst: 12 + ((Math.random() * 28) | 0),
          burstDecay: 0.0,
        }));
        this.lastW = W;
      },
      draw() {
        if (this.lastW !== W) this.init();

        ctx.font = `${fontPx}px monospace`;
        ctx.textBaseline = 'top';
        ctx.shadowBlur = glow;
        ctx.shadowColor = GREEN;

        const cs = getCharset();

        for (let i = 0; i < this.columns.length; i++) {
          const c = this.columns[i];
          const x = Math.floor(i * (fontPx * 0.62));
          const yPx = c.y * this.stepY;

          const tail = Math.max(6, Math.floor(c.burst - c.burstDecay));
          c.burstDecay += 0.015 * c.speed;

          for (let t = 0; t < tail; t++) {
            const y = yPx - t * this.stepY;
            if (y < -this.stepY) continue;
            if (y > H + this.stepY) break;

            const isHead = (t === 0);
            const a = (isHead ? 0.98 : 0.30) * alphaMul * (1 - t / tail);
            ctx.fillStyle = isHead ? `rgba(180, 255, 210, ${a})` : `rgba(72, 255, 132, ${a})`;

            const ch = (t < 2)
              ? takeTokenOrRandom(cs)
              : (Math.random() < 0.08 ? takeTokenOrRandom(cs) : cs[(Math.random() * cs.length) | 0]);

            ctx.fillText(ch, x, y);
          }

          c.y += c.speed;
          if (yPx > H + 200) {
            c.y = (Math.random() * -90) | 0;
            c.speed = (0.55 + Math.random() * 1.25) * speedMul;
            c.burst = 12 + ((Math.random() * 28) | 0);
            c.burstDecay = 0.0;
          }
        }
        ctx.shadowBlur = 0;
      }
    };
    layer.init();
    return layer;
  }

  const layers = [
    makeLayer(12, 0.85, 0.95, 6, 0.55),
    makeLayer(16, 1.00, 1.00, 9, 0.75),
    makeLayer(20, 1.10, 0.85, 12, 0.95),
  ];

  let paused = false;
  function frame() {
    if (!paused) {
      ctx.fillStyle = `rgba(0, 0, 0, ${BG_FADE()})`;
      ctx.fillRect(0, 0, W, H);
      for (const L of layers) L.draw();
    }
    requestAnimationFrame(frame);
  }

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  requestAnimationFrame(frame);

  function toggleHud(force) {
    const show = typeof force === 'boolean' ? force : hud.classList.contains('hidden');
    hud.classList.toggle('hidden', !show);
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {}
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 's' || e.key === 'S') toggleHud();
    else if (e.key === ' ') { e.preventDefault(); paused = !paused; }
    else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    else if (e.key === 'Escape' && !hud.classList.contains('hidden')) toggleHud(false);
  });

})();
