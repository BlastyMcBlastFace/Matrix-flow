/* Matrix Live Data Stream (v4-fixed) — aCurve /api/v1 integration
   GET  /Tag
   POST /MeasurementMulti
   Authorization: Bearer <token>

   Controls: S (settings), F (fullscreen), Space (pause)
*/
(() => {
  'use strict';

  const canvas = document.getElementById('matrix');
  const ctx = canvas.getContext('2d', { alpha: false });

  // HUD elements (guarded)
  const hud = document.getElementById('hud');
  const hudClose = document.getElementById('hudClose');
  const baseUrlEl = document.getElementById('baseUrl');
  const tokenEl = document.getElementById('token');
  const pollMsEl = document.getElementById('pollMs');
  const charsetEl = document.getElementById('charset');
  const trailEl = document.getElementById('trail');
  const tagsEl = document.getElementById('tags');
  const startTimeEl = document.getElementById('startTime');
  const endTimeEl = document.getElementById('endTime');
  const resTypeEl = document.getElementById('resType');
  const resNumEl = document.getElementById('resNum');
  const tsTypeEl = document.getElementById('tsType');
  const timeModeEl = document.getElementById('timeMode');
  const lookbackMinEl = document.getElementById('lookbackMin');
  const modeEl = document.getElementById('mode');
  const apiStatusEl = document.getElementById('apiStatus');
  const btnLoadTags = document.getElementById('btnLoadTags');
  const btnTestMeas = document.getElementById('btnTestMeas');

  const GREEN = 'rgba(72, 255, 132, 1)';
  const BG_FADE = () => Math.min(0.30, Math.max(0.02, Number(trailEl?.value || 0.08)));

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

  // Ensure black background from start
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // Charsets
  const DIGITS = '0123456789';
  const HEX = '0123456789ABCDEF';
  const KATAKANA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
  const MATRIX = KATAKANA + DIGITS;

  function getCharset() {
    const v = (charsetEl?.value || 'matrix').toLowerCase();
    if (v === 'hex') return HEX;
    if (v === 'digits') return DIGITS;
    return MATRIX;
  }

  // Data buffer
  const dataQueue = [];
  const MAX_QUEUE = 9000;

  function enqueueToken(tok) {
    if (tok == null) return;
    const s = String(tok);
    for (const ch of s) {
      if (dataQueue.length >= MAX_QUEUE) dataQueue.shift();
      dataQueue.push(ch);
    }
  }

  function flattenToTokens(value, path = '', out = [], depth = 0) {
    if (depth > 7) return out;
    if (value == null) return out;
    const t = typeof value;

    if (t === 'string' || t === 'number' || t === 'boolean') {
      const key = path ? path.split('.').slice(-1)[0] : '';
      out.push(key ? `${key}=${value} ` : `${value} `);
      return out;
    }
    if (Array.isArray(value)) {
      const primitive = value.every(v => v == null || ['string','number','boolean'].includes(typeof v));
      if (primitive) { for (const v of value) out.push(`${v} `); return out; }
      for (let i = 0; i < Math.min(40, value.length); i++) {
        flattenToTokens(value[i], path ? `${path}[${i}]` : `[${i}]`, out, depth + 1);
      }
      return out;
    }
    if (t === 'object') {
      const entries = Object.entries(value);
      for (let i = 0; i < Math.min(60, entries.length); i++) {
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
      enqueueToken(toks.join('').slice(0, 1600));
    } catch {}
  }

  function takeTokenOrRandom(charset) {
    // Always consume live data when available
    if (dataQueue.length > 0) return dataQueue.shift();
    return charset[(Math.random() * charset.length) | 0];
  }

  function setApiStatus(text) {
    if (apiStatusEl) apiStatusEl.textContent = text;
  }

  // API helpers
  function cleanBaseUrl() {
    let u = (baseUrlEl?.value || '').trim();
    if (!u) return '';
    if (!u.endsWith('/')) u += '/';
    return u;
  }

  function authHeaders() {
    const token = (tokenEl?.value || '').trim();
    const headers = { 'Accept': 'application/json, text/plain;q=0.9, */*;q=0.8' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }


  function pad2(n){ return String(n).padStart(2,'0'); }
  function formatLocalYYYYMMDDHHmm(d){
    const y = d.getFullYear();
    const m = pad2(d.getMonth()+1);
    const day = pad2(d.getDate());
    const hh = pad2(d.getHours());
    const mm = pad2(d.getMinutes());
    return `${y}-${m}-${day} ${hh}:${mm}`;
  }

  function parseMaybeJson(text) {
    const s = String(text || '').trim();
    if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
      try { return JSON.parse(s); } catch { return text; }
    }
    return text;
  }

  function buildMeasurementBody() {
    const rawTags = (tagsEl?.value || '').split(/\r?\n/).map(t => t.trim()).filter(Boolean);

    // Manual times (what user typed)
    let start = (startTimeEl?.value || '').trim();
    let end = (endTimeEl?.value || '').trim();

    // Latest mode: compute a rolling window ending "now" in the format the API spec shows: YYYY-MM-DD HH:mm
    const tm = (timeModeEl?.value || 'manual').toLowerCase();
    if (tm === 'latest') {
      const lookback = Math.max(1, Number(lookbackMinEl?.value || 60));
      const now = new Date();
      const from = new Date(now.getTime() - lookback * 60 * 1000);
      end = formatLocalYYYYMMDDHHmm(now);
      start = formatLocalYYYYMMDDHHmm(from);
    }

    return {
      TagName: rawTags,
      StartTime: start,
      EndTime: end,
      ResolutionType: (resTypeEl?.value || 'h').trim(),
      ResolutionNumber: String(resNumEl?.value || '1'),
      ReturnTimeStampType: (tsTypeEl?.value || 'LOCAL').trim(),
    };
  }

  async function fetchTags() {
    const base = cleanBaseUrl();
    if (!base) { setApiStatus('API: sätt API-bas först'); return; }
    const url = base + 'Tag';

    const started = performance.now();
    try {
      const res = await fetch(url, { headers: authHeaders(), cache: 'no-store' });
      const ms = Math.round(performance.now() - started);

      const ct = (res.headers.get('content-type') || '').toLowerCase();
      let payload = ct.includes('application/json') ? await res.json() : parseMaybeJson(await res.text());

      if (!res.ok) {
        setApiStatus(`API: /Tag HTTP ${res.status} (${ms}ms)`);
        normalizeApiPayload(payload);
        return;
      }

      const tags = [];
      if (Array.isArray(payload)) {
        for (const item of payload.slice(0, 200)) {
          if (typeof item === 'string') tags.push(item);
          else if (item && typeof item === 'object') {
            const name = item.TagName ?? item.Name ?? item.tagName ?? item.tag ?? item.id ?? null;
            if (name != null) tags.push(String(name));
          }
        }
      }

      if (tags.length && tagsEl && !tagsEl.value.trim()) tagsEl.value = tags.slice(0, 50).join('\n');
      setApiStatus(tags.length
        ? `API: /Tag OK (${ms}ms) · hittade ${tags.length} taggar`
        : `API: /Tag OK (${ms}ms) · kunde inte tolka payload`);

      normalizeApiPayload(payload);
      persistSettings();
    } catch (e) {
      setApiStatus('API: /Tag FEL (CORS/Nät) — öppna DevTools → Console/Network');
      enqueueToken('NET… ');
    }
  }

  async function fetchMeasurementOnce() {
    const base = cleanBaseUrl();
    if (!base) { setApiStatus('API: sätt API-bas först'); return false; }
    const url = base + 'MeasurementMulti';

    const body = buildMeasurementBody();
    if (!Array.isArray(body.TagName) || body.TagName.length === 0) {
      setApiStatus('API: lägg in minst 1 TagName (en per rad)');
      return false;
    }
    if (!body.StartTime || !body.EndTime) {
      setApiStatus('API: fyll i StartTime och EndTime (YYYY-MM-DD HH:mm)');
      return false;
    }

    const started = performance.now();
    try {
      const res = await fetch(url, {
        method: 'POST',
        cache: 'no-store',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const ms = Math.round(performance.now() - started);
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      let payload = ct.includes('application/json') ? await res.json() : parseMaybeJson(await res.text());

      if (!res.ok) {
        const body = buildMeasurementBody();
        const snippet = (typeof payload === 'string') ? String(payload).slice(0, 180) : '';
        setApiStatus(`API: /MeasurementMulti HTTP ${res.status} (${ms}ms) · Start=${body.StartTime} End=${body.EndTime}` + (snippet ? ` · ${snippet}` : ''));
        try { console.warn('MeasurementMulti non-OK', res.status, { requestBody: body, response: payload }); } catch {}
        normalizeApiPayload(payload);
        return false;
      }

      normalizeApiPayload(payload);
      setApiStatus(`API: /MeasurementMulti OK (${ms}ms) · injicerar data · queue=${dataQueue.length}`);
      persistSettings();
      return true;
    } catch (e) {
      setApiStatus('API: /MeasurementMulti FEL (CORS/Nät) — öppna DevTools → Console/Network');
      enqueueToken('NET… ');
      return false;
    }
  }

  // Poll loop
  let stopPoll = null;
  function startPolling() {
    stopPolling();
    let alive = true;

    const loop = async () => {
      if (!alive) return;
      await fetchMeasurementOnce();
      const ms = Math.max(200, Number(pollMsEl?.value || 3000));
      setTimeout(loop, ms);
    };
    loop();

    stopPoll = () => { alive = false; };
  }
  function stopPolling() {
    if (typeof stopPoll === 'function') stopPoll();
    stopPoll = null;
  }

  // Demo feed
  let stopDemoFn = null;
  function stopDemo() { if (typeof stopDemoFn === 'function') stopDemoFn(); stopDemoFn = null; }
  function startDemoFeed() {
    stopDemo();
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
    stopDemoFn = () => clearInterval(id);
  }

  // Settings persistence
  const saved = (() => { try { return JSON.parse(localStorage.getItem('matrix_settings_v4_fixed') || '{}'); } catch { return {}; } })();
  if (baseUrlEl) baseUrlEl.value = saved.baseUrl ?? 'https://acurve.kappala.se:50001/api/v1/';
  if (tokenEl) tokenEl.value = saved.token ?? '';
  if (pollMsEl) pollMsEl.value = saved.pollMs ?? 3000;
  if (charsetEl) charsetEl.value = saved.charset ?? 'matrix';
  if (trailEl) trailEl.value = saved.trail ?? 0.08;
  if (tagsEl) tagsEl.value = saved.tags ?? '';
  if (startTimeEl) startTimeEl.value = saved.startTime ?? '2023-01-05 00:00';
  if (endTimeEl) endTimeEl.value = saved.endTime ?? '2023-01-05 12:00';
  if (resTypeEl) resTypeEl.value = saved.resType ?? 'h';
  if (resNumEl) resNumEl.value = saved.resNum ?? 1;
  if (tsTypeEl) tsTypeEl.value = saved.tsType ?? 'LOCAL';
  if (modeEl) modeEl.value = saved.mode ?? 'poll';
  if (timeModeEl) timeModeEl.value = saved.timeMode ?? 'manual';
  if (lookbackMinEl) lookbackMinEl.value = saved.lookbackMin ?? 60;

  function persistSettings() {
    localStorage.setItem('matrix_settings_v4_fixed', JSON.stringify({
      baseUrl: baseUrlEl?.value || '',
      token: tokenEl?.value || '',
      pollMs: Number(pollMsEl?.value || 3000),
      charset: charsetEl?.value || 'matrix',
      trail: Number(trailEl?.value || 0.08),
      tags: tagsEl?.value || '',
      startTime: startTimeEl?.value || '',
      endTime: endTimeEl?.value || '',
      resType: resTypeEl?.value || 'h',
      resNum: Number(resNumEl?.value || 1),
      tsType: tsTypeEl?.value || 'LOCAL',
      mode: modeEl?.value || 'poll',
      timeMode: timeModeEl?.value || 'manual',
      lookbackMin: Number(lookbackMinEl?.value || 60),
    }));
  }

  const settingEls = [baseUrlEl, tokenEl, pollMsEl, charsetEl, trailEl, tagsEl, startTimeEl, endTimeEl, resTypeEl, resNumEl, tsTypeEl, modeEl, timeModeEl, lookbackMinEl].filter(Boolean);
  for (const el of settingEls) el.addEventListener('change', persistSettings);

  // Buttons
  if (btnLoadTags) btnLoadTags.addEventListener('click', fetchTags);
  if (btnTestMeas) btnTestMeas.addEventListener('click', fetchMeasurementOnce);

  function applyMode() {
    const mode = (modeEl?.value || 'poll').toLowerCase();
    persistSettings();
    if (mode === 'demo') {
      stopPolling();
      startDemoFeed();
    } else {
      stopDemo();
      startPolling();
      const tm = (timeModeEl?.value || 'manual').toLowerCase();
      setApiStatus('API: kör polling mot /MeasurementMulti' + (tm === 'latest' ? ' · Strömmande senaste (rullande fönster)' : ' · Manuell tid') + ' (tryck "Testa" för direktanrop)');
    }
  }
  if (modeEl) modeEl.addEventListener('change', applyMode);
  if (timeModeEl) timeModeEl.addEventListener('change', applyMode);
  if (lookbackMinEl) lookbackMinEl.addEventListener('change', applyMode);

  // Start mode
  applyMode();

  // ---- Multi-layer rain ----
  function makeLayer(fontPx, speedMul, densityMul, glow, alphaMul) {
    const layer = {
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
              : (Math.random() < 0.08 ? takeTokenOrRandom(cs) : takeTokenOrRandom(cs));

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
  requestAnimationFrame(frame);

  // Controls
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

  if (hudClose) hudClose.addEventListener('click', () => toggleHud(false));

})();
