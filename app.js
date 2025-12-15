   /* Matrix Live Data Stream
   - Multi-layer canvas "digital rain"
   - Data injection from API (SSE or polling fetch) with demo fallback
   - Controls: S (settings), F (fullscreen), Space (pause)
*/

(() => {
  'use strict';

  const canvas = document.getElementById('matrix');
  const ctx = canvas.getContext('2d', { alpha: false });

  // HUD elements
  const hud = document.getElementById('hud');
  const hudClose = document.getElementById('hudClose');
  const endpointEl = document.getElementById('endpoint');
  const modeEl = document.getElementById('mode');
  const pollMsEl = document.getElementById('pollMs');
  const charsetEl = document.getElementById('charset');
  const trailEl = document.getElementById('trail');

  // ---- Rendering parameters (tuned for "Matrix look") ----
  const GREEN = 'rgba(72, 255, 132, 1)';   // bright head glow
  const GREEN_DIM = 'rgba(72, 255, 132, 0.42)'; // body
  const BG_FADE = () => Math.min(0.30, Math.max(0.02, Number(trailEl.value || 0.08)));

  let W = 0, H = 0, DPR = 1;

  function resize() {
    DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1)); // cap for perf
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

  // ---- Character sets ----
  const DIGITS = '0123456789';
  const HEX = '0123456789ABCDEF';
  // Katakana set often used for matrix-rain aesthetics
  const KATAKANA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
  const MATRIX = KATAKANA + DIGITS;

  function getCharset() {
    const v = (charsetEl.value || 'digits').toLowerCase();
    if (v === 'hex') return HEX;
    if (v === 'matrix') return MATRIX;
    return DIGITS;
  }

  // ---- Data buffer ----
  // We translate API data into short "tokens" that get injected into the rain.
  const dataQueue = [];
  const MAX_QUEUE = 3000;

  function enqueueToken(tok) {
    if (tok == null) return;
    const s = String(tok);
    // Keep it short & "rain-friendly"
    for (const ch of s) {
      if (dataQueue.length >= MAX_QUEUE) dataQueue.shift();
      dataQueue.push(ch);
    }
  }

  function takeTokenOrRandom(charset) {
    // Prefer live data, but mix with random to keep the effect continuous.
    const useLive = dataQueue.length > 0 && Math.random() < 0.55;
    if (useLive) return dataQueue.shift();
    return charset[(Math.random() * charset.length) | 0];
  }

  // ---- API ingestion: SSE + polling fallback ----
  let stopFeed = null;

  function stopCurrentFeed() {
    if (typeof stopFeed === 'function') stopFeed();
    stopFeed = null;
  }

  function normalizeApiPayload(payload) {
    // Accept:
    // - Array => join
    // - {data:[...]} or {values:[...]} or any object => stringify values
    try {
      if (payload == null) return;
      if (Array.isArray(payload)) {
        payload.forEach(v => enqueueToken(v));
        return;
      }
      if (typeof payload === 'object') {
        const arr = payload.data ?? payload.values ?? payload.items;
        if (Array.isArray(arr)) {
          arr.forEach(v => enqueueToken(v));
          return;
        }
        // If it's a plain object, inject key:value pairs as short snippets
        for (const [k, v] of Object.entries(payload)) {
          enqueueToken(k + ':' + v + ' ');
        }
        return;
      }
      enqueueToken(payload);
    } catch (e) {
      // ignore
    }
  }

  function startDemoFeed() {
    const demoFields = [
      'FLOW', 'NH4', 'NO3', 'PO4', 'COD', 'DO', 'TEMP', 'kWh', 'PUMP', 'VALVE',
      'SENSOR', 'ALARM', 'OK', 'WARN', 'ID', 'TS'
    ];

    const t0 = performance.now();
    const id = setInterval(() => {
      const t = (performance.now() - t0) / 1000;
      const flow = (1200 + 250 * Math.sin(t / 3)).toFixed(0);
      const nh4 = (2.5 + 0.8 * Math.sin(t / 5)).toFixed(2);
      const temp = (14.0 + 1.2 * Math.sin(t / 11)).toFixed(1);
      const kwh = (850 + 40 * Math.sin(t / 7)).toFixed(0);
      const pick = demoFields[(Math.random() * demoFields.length) | 0];
      enqueueToken(`${pick} ${flow} ${nh4} ${temp} ${kwh} `);
    }, 250);

    return () => clearInterval(id);
  }

  function startPollingFeed(endpoint, pollMs) {
    let alive = true;

    async function tick() {
      if (!alive) return;
      try {
        const res = await fetch(endpoint, {
        cache: 'no-store',
        headers: {
       'Authorization': 'Bearer ff2d6750f4184ddcb46a162eeea82d54',
       'X-API-Key': 'DIN_NYCKEL_HÄR',
        }
});
        // If endpoint isn't JSON, we'll still read as text
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('application/json')) {
          normalizeApiPayload(await res.json());
        } else {
          normalizeApiPayload(await res.text());
        }
      } catch (e) {
        // On error, still keep the rain alive by injecting a tiny marker sometimes
        if (Math.random() < 0.15) enqueueToken('…');
      } finally {
        setTimeout(tick, pollMs);
      }
    }

    tick();
    return () => { alive = false; };
  }

  function startSSEFeed(endpoint) {
    let es;
    try {
      es = new EventSource(endpoint, { withCredentials: false });
    } catch (e) {
      return null;
    }

    es.onmessage = (ev) => {
      // Expect either JSON in ev.data or plain text
      const raw = ev.data;
      try {
        normalizeApiPayload(JSON.parse(raw));
      } catch {
        normalizeApiPayload(raw);
      }
    };

    es.onerror = () => {
      // keep it silent; user can switch mode if needed
    };

    return () => {
      try { es.close(); } catch {}
    };
  }

  function isProbablySSE(endpoint) {
    // Heuristic: if endpoint ends with /sse or contains 'stream'
    const s = String(endpoint || '').toLowerCase();
    return s.includes('sse') || s.includes('stream');
  }

  function startFeedFromSettings() {
    stopCurrentFeed();

    const endpoint = (endpointEl.value || '').trim();
    const mode = (modeEl.value || 'auto').toLowerCase();
    const pollMs = Math.max(200, Number(pollMsEl.value || 1000));

    if (!endpoint || mode === 'demo') {
      stopFeed = startDemoFeed();
      return;
    }

    if (mode === 'sse' || (mode === 'auto' && isProbablySSE(endpoint))) {
      const stopper = startSSEFeed(endpoint);
      if (stopper) { stopFeed = stopper; return; }
      // If SSE failed, fall back to polling
    }

    stopFeed = startPollingFeed(endpoint, pollMs);
  }

  // Hook settings changes
  for (const el of [endpointEl, modeEl, pollMsEl, charsetEl, trailEl]) {
    el.addEventListener('change', () => startFeedFromSettings());
  }
  hudClose.addEventListener('click', () => toggleHud(false));

  // Load persisted settings
  const saved = (() => {
    try { return JSON.parse(localStorage.getItem('matrix_settings') || '{}'); } catch { return {}; }
  })();

  endpointEl.value = saved.endpoint ?? '';
  modeEl.value = saved.mode ?? 'auto';
  pollMsEl.value = saved.pollMs ?? 1000;
  charsetEl.value = saved.charset ?? 'matrix';
  trailEl.value = saved.trail ?? 0.08;

  function persistSettings() {
    const obj = {
      endpoint: endpointEl.value,
      mode: modeEl.value,
      pollMs: Number(pollMsEl.value),
      charset: charsetEl.value,
      trail: Number(trailEl.value),
    };
    localStorage.setItem('matrix_settings', JSON.stringify(obj));
  }

  for (const el of [endpointEl, modeEl, pollMsEl, charsetEl, trailEl]) {
    el.addEventListener('change', persistSettings);
  }

  startFeedFromSettings();

  // ---- Multi-layer rain ----
  // Layer concept: same effect with different font sizes/speeds/alpha.
  function makeLayer(fontPx, speedMul, densityMul, glow, alphaMul) {
    const charset = () => getCharset();
    const layer = {
      fontPx,
      speedMul,
      densityMul,
      glow,
      alphaMul,
      columns: [],
      colCount: 0,
      stepY: fontPx * 1.05,
      lastW: -1,
      init() {
        const colW = fontPx * 0.62; // tighter columns (more matrix-like)
        const count = Math.max(10, Math.floor(W / colW * densityMul));
        this.colCount = count;
        this.columns = new Array(count).fill(0).map((_, i) => ({
          // y in "steps", start random above
          y: (Math.random() * -80) | 0,
          speed: (0.55 + Math.random() * 1.25) * speedMul,
          // occasional "burst" length
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

        const cs = charset();

        // Draw each column
        for (let i = 0; i < this.columns.length; i++) {
          const c = this.columns[i];
          const x = Math.floor(i * (fontPx * 0.62));

          // head char is brighter; tail fades
          const yPx = c.y * this.stepY;

          // Tail length + flicker
          const tail = Math.max(6, Math.floor(c.burst - c.burstDecay));
          c.burstDecay += 0.015 * c.speed;

          for (let t = 0; t < tail; t++) {
            const y = yPx - t * this.stepY;
            if (y < -this.stepY) continue;
            if (y > H + this.stepY) break;

            const isHead = (t === 0);
            const a = (isHead ? 0.98 : 0.30) * this.alphaMul * (1 - t / tail);
            ctx.fillStyle = isHead ? `rgba(180, 255, 210, ${a})` : `rgba(72, 255, 132, ${a})`;

            // Inject live data mostly at/near head
            const ch = (t < 2)
              ? takeTokenOrRandom(cs)
              : (Math.random() < 0.08 ? takeTokenOrRandom(cs) : cs[(Math.random() * cs.length) | 0]);

            ctx.fillText(ch, x, y);
          }

          // Advance column
          c.y += c.speed;

          // Reset when beyond screen
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

  // Layers: back to front
  const layers = [
    makeLayer(12, 0.85, 0.95, 6, 0.55),
    makeLayer(16, 1.00, 1.00, 9, 0.75),
    makeLayer(20, 1.10, 0.85, 12, 0.95),
  ];

  // ---- Animation loop ----
  let paused = false;

  function frame() {
    if (!paused) {
      // Fade to black (trail effect)
      ctx.fillStyle = `rgba(0, 0, 0, ${BG_FADE()})`;
      ctx.fillRect(0, 0, W, H);

      // Slight vignette for depth
      // (tiny cost, big vibe)
      ctx.save();
      ctx.globalAlpha = 0.10;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.fill();
      ctx.restore();

      // Draw layers
      for (const L of layers) L.draw();
    }
    requestAnimationFrame(frame);
  }

  // Start with a clean black frame (no flash)
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  requestAnimationFrame(frame);

  // ---- Controls ----
  function toggleHud(force) {
    const show = typeof force === 'boolean' ? force : hud.classList.contains('hidden');
    hud.classList.toggle('hidden', !show);
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {}
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 's' || e.key === 'S') {
      toggleHud();
    } else if (e.key === ' ' ) {
      e.preventDefault();
      paused = !paused;
    } else if (e.key === 'f' || e.key === 'F') {
      toggleFullscreen();
    } else if (e.key === 'Escape' && !hud.classList.contains('hidden')) {
      toggleHud(false);
    }
  });

})();
