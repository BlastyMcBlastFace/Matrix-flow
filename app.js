/* Matrix Live Data Stream (v4-fixed) — aCurve /api/v1 integration
   GET  /Tag
   POST /MeasurementMulti
   Authorization: Bearer <token>

   Controls: S (settings), F (fullscreen), Space (pause)
*/
(() => {
  'use strict';

  const canvas = document.getElementById('matrix');
  const tooltipEl = document.getElementById('tooltip');
  // Tag metadata (TagName -> { description }) fetched from GET /Tag
  const tagMeta = new Map();
  function resolveLabel(tagName){
    const t = String(tagName || '').trim();
    const m = tagMeta.get(t);
    return (m && m.description) ? String(m.description) : t;
  }

  const hoverRegions = []; // per-frame regions for head tokens
  let mousePx = { x: -1, y: -1, inside: false };
  function canvasToLocal(e){
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * (canvas.width / r.width);
    const y = (e.clientY - r.top) * (canvas.height / r.height);
    return { x, y };
  }
  function hideTooltip(){
    if (!tooltipEl) return;
    tooltipEl.classList.add('hidden');
  }

  function hitTestHover(){
    if (!mousePx.inside) { hideTooltip(); return; }
    let hit = null;
    for (let i = hoverRegions.length - 1; i >= 0; i--) {
      const r = hoverRegions[i];
      if (mousePx.x >= r.left && mousePx.x <= r.right && mousePx.y >= r.top && mousePx.y <= r.bottom) { hit = r; break; }
    }
    if (hit) {
      const tag = hit.headObj?.tag ? String(hit.headObj.tag) : '(okänd tag)';
      const val = hit.value ? String(hit.value) : '';
      const label = hit.headObj?.label || hit.headObj?.tag || tag;
      const showTag = hit.headObj?.tag && hit.headObj.tag !== label ? `\n(${hit.headObj.tag})` : '';
      showTooltip(mousePx.pageX, mousePx.pageY, `${label}\n${val}${showTag}`);
    } else {
      hideTooltip();
    }
  }

  function showTooltip(pageX, pageY, text){
    if (!tooltipEl) return;
    tooltipEl.textContent = text;
    tooltipEl.style.left = (pageX + 14) + 'px';
    tooltipEl.style.top = (pageY + 14) + 'px';
    tooltipEl.classList.remove('hidden');
  }
    // Mouse tracking (window-level) so hover works even when the HUD overlays the canvas
  window.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    const inside = (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom);
    if (!inside) {
      mousePx = { x: -1, y: -1, inside: false, pageX: e.clientX, pageY: e.clientY };
      return;
    }
    const x = (e.clientX - r.left) * (canvas.width / r.width);
    const y = (e.clientY - r.top) * (canvas.height / r.height);
    mousePx = { x, y, inside: true, pageX: e.clientX, pageY: e.clientY };
  });
  window.addEventListener('mouseleave', () => { mousePx = { x:-1, y:-1, inside:false }; hideTooltip(); });

  const debugOverlayEl = document.getElementById('debugOverlay');
  const showDebugEl = document.getElementById('showDebug');
  const headLockEl = document.getElementById('headLock');
  const ctx = canvas.getContext('2d', { alpha: false });

  // HUD elements (guarded)
  const hud = document.getElementById('hud');
  const hudClose = document.getElementById('hudClose');
  const baseUrlEl = document.getElementById('baseUrl');
  const tokenEl = document.getElementById('token');
  const pollMsEl = document.getElementById('pollMs');
  const chunkSizeEl = document.getElementById('chunkSize');
  const charsetEl = document.getElementById('charset');
  const trailEl = document.getElementById('trail');
  const speedEl = document.getElementById('speed');
  const mxPresetEl = document.getElementById('mxPreset');
  const mxLayersEl = document.getElementById('mxLayers');
  const mxFontEl = document.getElementById('mxFont');
  const mxDensityEl = document.getElementById('mxDensity');
  const mxGlowEl = document.getElementById('mxGlow');
  const mxSpeedEl = document.getElementById('mxSpeed');
  const mxFadeEl = document.getElementById('mxFade');
  const repeatEl = document.getElementById('repeat');
  const tagsEl = document.getElementById('tags');
  const startTimeEl = document.getElementById('startTime');
  const endTimeEl = document.getElementById('endTime');
  const resTypeEl = document.getElementById('resType');
  const resNumEl = document.getElementById('resNum');
  const tsTypeEl = document.getElementById('tsType');
  const timeModeEl = document.getElementById('timeMode');
  const lookbackMinEl = document.getElementById('lookbackMin');
  const fetchModeEl = document.getElementById('fetchMode');
  const modeEl = document.getElementById('mode');
  const apiStatusEl = document.getElementById('apiStatus');
  const btnLoadTags = document.getElementById('btnLoadTags');
  const btnTestMeas = document.getElementById('btnTestMeas');

  const GREEN = 'rgba(72, 255, 132, 1)';
  
  function mxNum(el, fallback, minV, maxV){
    const v = Number(el?.value ?? fallback);
    if (Number.isNaN(v)) return fallback;
    return Math.max(minV, Math.min(maxV, v));
  }
  function mxLayers(){ return Math.floor(mxNum(mxLayersEl, 3, 1, 4)); }
  function mxFontBase(){ return Math.floor(mxNum(mxFontEl, 16, 10, 28)); }
  function mxDensity(){ return mxNum(mxDensityEl, 1.0, 0.5, 2.0); }
  function mxGlow(){ return mxNum(mxGlowEl, 1.0, 0.0, 2.0); }
  function mxSpeed(){ return mxNum(mxSpeedEl, 1.0, 0.5, 2.0); }
  function mxFade(){ return mxNum(mxFadeEl, 1.0, 0.5, 2.0); }

function speedScale(){
    const v = Number(speedEl?.value || 0.7);
    return Math.max(0.2, Math.min(1.5, v));
  }
  function repeatFactor(){
    const v = Number(repeatEl?.value || 4);
    return Math.max(1, Math.min(10, Math.floor(v)));
  }

  const BG_FADE = () => Math.min(0.30, Math.max(0.02, Number(trailEl?.value || 0.08) * mxFade()));

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
  
    rebuildLayers();
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
  // Numeric value tokens for column heads
  const valueQueue = [];
  const MAX_VALUE_QUEUE = 5000;
  function enqueueValueToken(tag, value){
    const v = String(value ?? '').trim();
    const t = String(tag ?? '').trim();
    if (!v) return;
    addToHeadPool({ tag: t, label: resolveLabel(t), value: v });
    valueQueue.push({ tag: t, label: resolveLabel(t), value: v });
    if (valueQueue.length > MAX_VALUE_QUEUE) valueQueue.splice(0, valueQueue.length - MAX_VALUE_QUEUE);
  }

  function nextHeadToken(){ return valueQueue.length ? valueQueue.shift() : null; }

  function nextHeadTokenReusable(){
    // Prefer fresh queue, else reuse from pool WITHOUT consuming
    const fresh = nextHeadToken();
    if (fresh) return fresh;
    if (!headPool.length) return null;
    const o = headPool[headPoolIdx % headPool.length];
    headPoolIdx = (headPoolIdx + 1) % headPool.length;
    return o;
  }
// Recent API-derived head tokens (can be reused across many streams)
  const headPool = [];
  const HEAD_POOL_MAX = 250;
  let headPoolIdx = 0;

  function addToHeadPool(obj){
    if (!obj) return;
    headPool.push(obj);
    if (headPool.length > HEAD_POOL_MAX) headPool.splice(0, headPool.length - HEAD_POOL_MAX);
    if (headPoolIdx >= headPool.length) headPoolIdx = 0;
  }
// For streaming mode: only request data since last successful fetch
  let lastSuccessfulEndDate = null;
  // Adaptive throttling when API rejects with "exceeded allowed read operations"
  let adaptiveFactor = 1; // increases 1,2,4,8...
  let lastOpsExceededAt = 0;
  let chunkCursor = 0;
  const MAX_QUEUE = 9000;
  let lastInjected = '';
  let lastRequestInfo = '';
  let lastResponseInfo = '';
  function setDebugVisible(on){
    if (!debugOverlayEl) return;
    debugOverlayEl.classList.toggle('hidden', !on);
  }
  function updateDebug(){
    if (!debugOverlayEl || debugOverlayEl.classList.contains('hidden')) return;
    const q = (typeof dataQueue !== 'undefined') ? dataQueue.length : 0;
    debugOverlayEl.textContent =
      `QUEUE(chars): ${q} | QUEUE(values): ${valueQueue.length}\n` +
      `POOL(size): ${headPool.length}\n` +
      (valueQueue.length ? `NEXT_VALUES: ${valueQueue.slice(0, 8).map(o => `${o.tag||'?'}` + ':' + `${o.value}`).join(' , ')}\n` : '') +
      (lastRequestInfo ? `REQ: ${lastRequestInfo}\n` : '') +
      (lastResponseInfo ? `RES: ${lastResponseInfo}\n` : '') +
      `INJECT: ${lastInjected}`;
  }

  // Standardtaggar: fyll i era 10 taggar här (exakta namn).
  // Alternativt: klicka "Hämta /Tag" så auto-fylls första 10 om fältet är tomt.
  const DEFAULT_TAGS = [];

  function enqueueToken(tok) {
    if (tok == null) return;
    const s = String(tok);
    for (const ch of s) {
      if (dataQueue.length >= MAX_QUEUE) dataQueue.shift();
      dataQueue.push(ch);
    }
  }

  
  function payloadHasAnyData(payload){
    try{
      if (payload == null) return false;
      if (Array.isArray(payload)) return payload.length > 0;
      if (typeof payload === 'object'){
        for (const v of Object.values(payload)){
          if (Array.isArray(v) && v.length > 0) return true;
          if (v && typeof v === 'object' && payloadHasAnyData(v)) return true;
        }
        return false;
      }
      return false;
    } catch { return false; }
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

  function shortTagName(k){
    const s = String(k||'');
    // Split on backslash, slash, dot and take last chunk
    const parts = s.split(/\\|\/|\./).filter(Boolean);
    return parts.length ? parts[parts.length-1] : s;
  }
  function formatNumeric2(v){
    // Force 2 decimals for numeric-looking values
    if (v == null) return '';
    if (typeof v === 'number') return Number.isFinite(v) ? v.toFixed(2) : String(v);
    if (typeof v === 'string') {
      const s = v.trim().replace(',', '.');
      if (/^[+-]?(\d+\.?\d*|\d*\.?\d+)([eE][+-]?\d+)?$/.test(s)) {
        const n = Number(s);
        return Number.isFinite(n) ? n.toFixed(2) : v;
      }
      return v;
    }
    return String(v);
  }

  
  function extractTagValuePairs(payload){
    // Expected aCurve style: { "<TagName>": [ ...points... ], "<TagName2>": [...] }
    try{
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
      const pairs = [];
      for (const [tag, node] of Object.entries(payload)) {
        const v = extractValuePoint(node);
        if (v == null) continue;
        const fv = formatNumeric2(v);
        if (!fv) continue;
        pairs.push({ tag, value: fv });
      }
      return pairs;
    } catch { return []; }
  }
function collectNumericValues(node, out, depth=0){
    if (depth > 6) return;
    if (node == null) return;
    if (typeof node === 'number') { out.push(node); return; }
    if (typeof node === 'string') {
      const s = node.trim().replace(',', '.');
      if (/^[+-]?(\d+\.?\d*|\d*\.?\d+)([eE][+-]?\d+)?$/.test(s)) {
        const n = Number(s);
        if (Number.isFinite(n)) out.push(n);
      }
      return;
    }
    if (Array.isArray(node)) {
      // take last few to keep "latest"
      const start = Math.max(0, node.length - 3);
      for (let i = start; i < node.length; i++) collectNumericValues(node[i], out, depth+1);
      return;
    }
    if (typeof node === 'object') {
      // common fields
      for (const key of ['Value','value','Val','val','Y','y']) {
        if (key in node) { collectNumericValues(node[key], out, depth+1); return; }
      }
      for (const v of Object.values(node)) collectNumericValues(v, out, depth+1);
    }
  }
  function extractValuePoint(x){
    if (x == null) return null;
    if (typeof x === 'number' || typeof x === 'string' || typeof x === 'boolean') return x;
    if (Array.isArray(x)) {
      if (!x.length) return null;
      return extractValuePoint(x[x.length-1]);
    }
    if (typeof x === 'object') {
      // common fields
      const v = x.Value ?? x.value ?? x.Val ?? x.val ?? x.Y ?? x.y ?? x.Data ?? x.data ?? null;
      if (v != null) return extractValuePoint(v);
      // If object has a single key, drill
      const keys = Object.keys(x);
      if (keys.length === 1) return extractValuePoint(x[keys[0]]);
    }
    return null;
  }
  function extractValueStream(payload){
    try {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '';
      const vals = [];
      for (const v of Object.values(payload)) {
        const val = extractValuePoint(v);
        if (val == null) continue;
        const outVal = formatNumeric2(val);
        if (!outVal) continue;
        vals.push(outVal);
      }
      return vals.join('   ');
    } catch { return ''; }
  }
  function extractCompactStream(payload){
    try {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '';
      const parts = [];
      for (const [k,v] of Object.entries(payload)) {
        const val = extractValuePoint(v);
        if (val == null) continue;
        const tag = shortTagName(k);
        // keep it mostly numeric-looking
        const outVal = formatNumeric2(val);
        parts.push(`${tag}:${outVal}`);
      }
      return parts.join(' | ');
    } catch { return ''; }
  }
  function normalizeApiPayload(payload) {
    try {
      const nums = [];
      collectNumericValues(payload, nums);

      // Format with 2 decimals and push newest last
      const pairs = extractTagValuePairs(payload);
      for (const p of pairs) enqueueValueToken(p.tag, p.value);
      const formatted = pairs.map(p => p.value);

      // Inject something readable into the character rain as well
      const verbose = (typeof extractCompactStream === 'function') ? (extractCompactStream(payload) || '') : '';
      const injectStr = formatted.length ? formatted.join('   ') : verbose;

      if (injectStr) {
        lastInjected = injectStr;
        if (verbose && verbose !== injectStr) lastInjected = `${injectStr}
[verbose] ${verbose}`;
        const rep = repeatFactor();
        for (let i = 0; i < rep; i++) enqueueToken(' ' + injectStr + '   ');
        updateDebug();
      }
    } catch {}
  }
  function takeFromQueue() {
    while (dataQueue.length > 0) {
      const c = dataQueue.shift();
      if (c && !/\s/.test(c)) return c;
    }
    return '';
  }
  function randomChar(charset){
    return charset[(Math.random() * charset.length) | 0];
  }
  function randomDigit(){
    return String((Math.random() * 10) | 0);
  }
  function nextHeadChar(charset){
    // Prefer data chars, but fall back to digits so heads are readable
    const c = takeFromQueue();
    return c || randomDigit();
  }

  function takeTokenOrRandom(charset) {
    return randomChar(charset);
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



  
  function windowMsForResolution(resType, resNum){
    const n = Math.max(1, Number(resNum || 1));
    const t = String(resType || 'm').trim().toLowerCase();
    const unitMs = (t === 's') ? 1000 : (t === 'm') ? 60_000 : (t === 'h') ? 3_600_000 : (t === 'd') ? 86_400_000 : 60_000;
    return unitMs * n;
  }

  function parseLocalYYYYMMDDHHmm(s){
    const t = String(s||'').trim();
    // Expect "YYYY-MM-DD HH:mm" (or with :ss)
    const m = t.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return null;
    const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
    const hh = Number(m[4]), mm = Number(m[5]), ss = Number(m[6] || 0);
    const dt = new Date(y, mo, d, hh, mm, ss, 0);
    return isNaN(dt.getTime()) ? null : dt;
  }

  function pad2(n){ return String(n).padStart(2,'0'); }

  function normalizeTimeInput(s){
    const t = String(s||'').trim();
    if (!t) return '';
    // If ISO-like, try to convert to local YYYY-MM-DD HH:mm
    if (t.includes('T')) {
      const d = new Date(t);
      if (!isNaN(d.getTime())) return formatLocalYYYYMMDDHHmm(d);
    }
    return t;
  }

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

  function buildMeasurementBody(tagsOverride) {
    const rawTagsAll = Array.isArray(tagsOverride)
      ? tagsOverride
      : (tagsEl?.value || '').split(/\r?\n/).map(t => t.trim()).filter(Boolean);
    // Hard cap to avoid massive read operations if someone pastes hundreds of tags
    const MAX_TAGS = 10; // user wants 10 standard
    const rawTags = rawTagsAll.slice(0, MAX_TAGS);
    const tagsTruncated = rawTagsAll.length > MAX_TAGS;

    // Manual times (what user typed)
    let start = normalizeTimeInput(startTimeEl?.value || '');
    let end = normalizeTimeInput(endTimeEl?.value || '');

    const tm = (timeModeEl?.value || 'manual').toLowerCase();
    // User lookback
    const lookbackUser = Math.max(1, Number(lookbackMinEl?.value || 60));
    // Adaptive lookback (shrinks on ops exceeded)
    const lookback = Math.max(1, Math.floor(lookbackUser / Math.max(1, adaptiveFactor)));

    // Latest mode:
    // - compute "end" as now-1min (avoid server-clock skew)
    // - request ONLY from lastSuccessfulEndDate (delta), else lookback window
    if (tm === 'latest') {
      const endDate = new Date(Date.now() - 60 * 1000);
      const fromDate = new Date(endDate.getTime() - lookback * 60 * 1000);

      // Delta: after first successful call, only fetch new interval since last end
      const startDate = lastSuccessfulEndDate ? lastSuccessfulEndDate : fromDate;

      end = formatLocalYYYYMMDDHHmm(endDate);
      start = formatLocalYYYYMMDDHHmm(startDate);
      const fm = (fetchModeEl?.value || 'window').toLowerCase();
      // Auto-clamp to point mode if the API has rejected ops repeatedly
      const autoPoint = adaptiveFactor >= 4;
      const usePoint = (fm === 'point') || autoPoint;
      if (usePoint) {
        // Request the smallest interval that can still produce a value at the chosen resolution.
        const safeEnd = new Date(Date.now() - 2 * 60 * 1000);
        end = formatLocalYYYYMMDDHHmm(safeEnd);
        const resTypeTmp = (resTypeEl?.value || 'm').trim();
        // Use the (possibly adaptive) resolution number
        const resNumTmp = Math.max(1, Math.floor(Number(resNumEl?.value || 1) * Math.max(1, adaptiveFactor)));
        const wMs = windowMsForResolution(resTypeTmp, resNumTmp);
        const startDate2 = new Date(safeEnd.getTime() - wMs);
        start = formatLocalYYYYMMDDHHmm(startDate2);
      } else {

        // Keep streaming window small to avoid read-operation limits
        const eD = parseLocalYYYYMMDDHHmm(end);
        if (eD) {
          const maxWindowMin = adaptiveFactor > 1 ? 5 : 10;
          const sD = parseLocalYYYYMMDDHHmm(start);
          if (sD && (eD.getTime() - sD.getTime()) > maxWindowMin * 60 * 1000) {
            const newStart = new Date(eD.getTime() - maxWindowMin * 60 * 1000);
            start = formatLocalYYYYMMDDHHmm(newStart);
          }
        }
      }
    }

    // Resolution
    const resType = (resTypeEl?.value || 'h').trim();
    let resNum = Number(resNumEl?.value || 1);
    // Also apply adaptive factor to resolution to reduce points
    resNum = Math.max(1, Math.floor(resNum * Math.max(1, adaptiveFactor)));

    // Guard: try to avoid "exceeded allowed read operations"
    // Approx points per tag:
    //  - if resType is 'm' => minutes / resNum, 'h' => hours/resNum, 's' => seconds/resNum, 'd' => days/resNum
    // We don't know server limit, so we keep it conservative.
    try {
      const sD = parseLocalYYYYMMDDHHmm(start);
      const eD = parseLocalYYYYMMDDHHmm(end);
      if (sD && eD && eD > sD && rawTags.length > 0) {
        const spanSec = (eD.getTime() - sD.getTime()) / 1000;
        const unitSec = (resType === 's') ? 1 : (resType === 'm') ? 60 : (resType === 'h') ? 3600 : (resType === 'd') ? 86400 : 3600;
        const pointsPerTag = Math.max(1, Math.ceil(spanSec / (unitSec * Math.max(1, resNum))));
        const estOps = pointsPerTag * rawTags.length;

        // If estimated operations are high, increase resolution number automatically
        const MAX_EST_OPS = 2000; // conservative
        if (estOps > MAX_EST_OPS) {
          const factor = Math.ceil(estOps / MAX_EST_OPS);
          resNum = Math.max(resNum, factor);
        }
      }
    } catch {}

    return {
      TagName: rawTags,
      StartTime: start,
      EndTime: end,
      ResolutionType: resType,
      ResolutionNumber: resNum,
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

      if (tags.length && tagsEl && !tagsEl.value.trim()) tagsEl.value = tags.slice(0, 10).join('\n');
      setApiStatus(tags.length
        ? `API: /Tag OK (${ms}ms) · hittade ${tags.length} taggar (fyller 10 st som standard om tomt)`
        : `API: /Tag OK (${ms}ms) · kunde inte tolka payload`);

      normalizeApiPayload(payload);
      persistSettings();
    } catch (e) {
      setApiStatus('API: /Tag FEL (CORS/Nät) — öppna DevTools → Console/Network');
      enqueueToken('NET… ');
    }
  }

  async function fetchMeasurementOnce(tagsChunk) {
    const base = cleanBaseUrl();
    if (!base) { setApiStatus('API: sätt API-bas först'); return false; }
    const url = base + 'MeasurementMulti';

    const body = buildMeasurementBody(tagsChunk);
    try {
      const tCount = Array.isArray(body.TagName) ? body.TagName.length : 0;
      lastRequestInfo = `/MeasurementMulti tags=${tCount} Start=${body.StartTime} End=${body.EndTime} res=${body.ResolutionType}${body.ResolutionNumber}`;
      updateDebug();
    } catch {}
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
        const body = buildMeasurementBody(tagsChunk);
    try {
      const tCount = Array.isArray(body.TagName) ? body.TagName.length : 0;
      lastRequestInfo = `/MeasurementMulti tags=${tCount} Start=${body.StartTime} End=${body.EndTime} res=${body.ResolutionType}${body.ResolutionNumber}`;
      updateDebug();
    } catch {}
        const snippet = (typeof payload === 'string') ? String(payload).slice(0, 180) : '';
        const opsExceeded = (typeof payload === 'string') && payload.toLowerCase().includes('exceeded allowed read operations');
        if (opsExceeded) {
          // Back off quickly (shrink lookback + increase resolution) for next attempts
          const now = Date.now();
          if (now - lastOpsExceededAt > 2000) { // avoid spamming bumps
            adaptiveFactor = Math.min(64, adaptiveFactor * 2);
            // Reduce chunk size to minimum to survive strict limits
            try { if (chunkSizeEl) chunkSizeEl.value = 1; } catch {}
            // Slow down slightly
            try { if (pollMsEl && Number(pollMsEl.value) < 30000) pollMsEl.value = 30000; } catch {}
            lastOpsExceededAt = now;
          }
        }
        const tagCountAll = (tagsEl?.value||'').split(/\r?\n/).map(t=>t.trim()).filter(Boolean).length;
        const capNote = tagCountAll > 20 ? ' · taggar: kapade till 20' : '';
        const adaptNote = adaptiveFactor > 1 ? ` · adaptive×${adaptiveFactor}` : '';
        const tagCountReq = Array.isArray(tagsChunk) ? tagsChunk.length : ((tagsEl?.value||'').split(/\r?\n/).map(t=>t.trim()).filter(Boolean).slice(0,10).length);
        const chunk = Array.isArray(tagsChunk) ? tagsChunk.length : Math.max(1, Math.min(10, Number(chunkSizeEl?.value || 1)));
        setApiStatus(`API: /MeasurementMulti HTTP ${res.status} (${ms}ms) · Start=${body.StartTime} End=${body.EndTime} · tags=${tagCountReq} · res=${body.ResolutionType}${body.ResolutionNumber} · chunk=${chunk} · fetch=${(fetchModeEl?.value||'window')}`
          + (snippet ? ` · ${snippet}` : '')
          + capNote + adaptNote
        );
        try { console.warn('MeasurementMulti non-OK', res.status, { requestBody: body, response: payload }); } catch {}
        normalizeApiPayload(payload);
        return false;
      }

      // If the API returns empty arrays, it usually means the interval+resolution produced 0 points.
      const anyData = payloadHasAnyData(payload);
      try { lastResponseInfo = `HTTP ${res.status} OK` + (anyData ? '' : ' (0 punkter)'); updateDebug(); } catch {}
      if (!anyData) {
        enqueueToken(' NO_DATA ');
      }
      normalizeApiPayload(payload);
      // Update delta cursor only on success
      try {
        const bodyUsed = buildMeasurementBody(tagsChunk);
        const eD = parseLocalYYYYMMDDHHmm(bodyUsed.EndTime);
        if (eD) lastSuccessfulEndDate = eD;
      } catch {}
      const bodyUsed2 = buildMeasurementBody();
      const tagCountReq = Array.isArray(tagsChunk) ? tagsChunk.length : ((tagsEl?.value||'').split(/\r?\n/).map(t=>t.trim()).filter(Boolean).slice(0,10).length);
      const chunk = Array.isArray(tagsChunk) ? tagsChunk.length : Math.max(1, Math.min(10, Number(chunkSizeEl?.value || 1)));
      setApiStatus(`API: /MeasurementMulti OK (${ms}ms) · injicerar data · queue=${dataQueue.length} · tags=${tagCountReq} · res=${bodyUsed2.ResolutionType}${bodyUsed2.ResolutionNumber} · chunk=${chunk} · fetch=${(fetchModeEl?.value||'window')}` + (anyData ? '' : ' · (0 punkter — öka fönster eller sänk upplösning)')
        + (adaptiveFactor > 1 ? ` · adaptive×${adaptiveFactor}` : '')
        + (((tagsEl?.value||'').split(/\r?\n/).map(t=>t.trim()).filter(Boolean).length) > 20 ? ' · taggar: kapade till 20' : '')
      );
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
      // Batch tag list into a single request (or a few chunks) to avoid per-tag calls
      const allTags = (tagsEl?.value || '').split(/\r?\n/).map(t => t.trim()).filter(Boolean);
      const maxTags = 10;
      const tags = allTags.slice(0, maxTags);

      // Send multiple tags in the same MeasurementMulti request (more efficient than one-by-one).
      const chunkSize = Math.max(1, Math.min(50, Number(chunkSizeEl?.value || 10)));
      const chunks = [];
      for (let i = 0; i < tags.length; i += chunkSize) chunks.push(tags.slice(i, i + chunkSize));

      for (let ci = 0; ci < chunks.length; ci++) {
        await fetchMeasurementOnce(chunks[ci]);
        // small spacing to be gentle on the API / proxy
        if (ci < chunks.length - 1) await sleep(80);
      }
      const ms = Math.max(500, Number(pollMsEl?.value || 10000));
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
  if (pollMsEl) pollMsEl.value = saved.pollMs ?? 10000;
  if (chunkSizeEl) chunkSizeEl.value = saved.chunkSize ?? 2;
  if (charsetEl) charsetEl.value = saved.charset ?? 'matrix';
  if (trailEl) trailEl.value = saved.trail ?? 0.08;
  if (speedEl) speedEl.value = saved.speed ?? 0.7;
  if (repeatEl) repeatEl.value = saved.repeat ?? 4;
  if (showDebugEl) showDebugEl.checked = saved.showDebug ?? false;
  if (headLockEl) headLockEl.checked = saved.headLock ?? true;
  setDebugVisible(showDebugEl?.checked);
  updateDebug();
  if (tagsEl) tagsEl.value = saved.tags ?? '';
  if (tagsEl && !tagsEl.value.trim() && Array.isArray(DEFAULT_TAGS) && DEFAULT_TAGS.length) {
    tagsEl.value = DEFAULT_TAGS.slice(0, 10).join('\n');
  }
  if (startTimeEl) startTimeEl.value = saved.startTime ?? '2023-01-05 00:00';
  if (endTimeEl) endTimeEl.value = saved.endTime ?? '2023-01-05 12:00';
  if (resTypeEl) resTypeEl.value = saved.resType ?? 'h';
  if (resNumEl) resNumEl.value = saved.resNum ?? 1;
  if (tsTypeEl) tsTypeEl.value = saved.tsType ?? 'LOCAL';
  if (modeEl) modeEl.value = saved.mode ?? 'poll';
  if (timeModeEl) timeModeEl.value = saved.timeMode ?? 'manual';
  if (lookbackMinEl) lookbackMinEl.value = saved.lookbackMin ?? 60;
  if (fetchModeEl) fetchModeEl.value = saved.fetchMode ?? 'window';

  function persistSettings() {
    localStorage.setItem('matrix_settings_v4_fixed', JSON.stringify({
      baseUrl: baseUrlEl?.value || '',
      token: tokenEl?.value || '',
      pollMs: Number(pollMsEl?.value || 3000),
      chunkSize: Number(chunkSizeEl?.value || 2),
      charset: charsetEl?.value || 'matrix',
      trail: Number(trailEl?.value || 0.08),
      speed: Number(speedEl?.value || 0.7),
      repeat: Number(repeatEl?.value || 4),
      showDebug: Boolean(showDebugEl?.checked),
      headLock: Boolean(headLockEl?.checked),
      tags: tagsEl?.value || '',
      startTime: startTimeEl?.value || '',
      endTime: endTimeEl?.value || '',
      resType: resTypeEl?.value || 'h',
      resNum: Number(resNumEl?.value || 1),
      tsType: tsTypeEl?.value || 'LOCAL',
      mode: modeEl?.value || 'poll',
      timeMode: timeModeEl?.value || 'manual',
      lookbackMin: Number(lookbackMinEl?.value || 60),
      fetchMode: fetchModeEl?.value || 'window',
    }));
  }

  const settingEls = [baseUrlEl, tokenEl, pollMsEl, chunkSizeEl, charsetEl, trailEl, speedEl, repeatEl, showDebugEl, headLockEl, tagsEl, startTimeEl, endTimeEl, resTypeEl, resNumEl, tsTypeEl, modeEl, timeModeEl, lookbackMinEl, fetchModeEl].filter(Boolean);
  for (const el of settingEls) el.addEventListener('change', persistSettings);
  if (showDebugEl) showDebugEl.addEventListener('change', () => {
    setDebugVisible(showDebugEl.checked);
    persistSettings();
    updateDebug();
  });

  // Buttons
  if (btnLoadTags) btnLoadTags.addEventListener('click', fetchTags);
  if (btnTestMeas) btnTestMeas.addEventListener('click', async () => {
    const allTags = (tagsEl?.value || '').split(/\r?\n/).map(t => t.trim()).filter(Boolean);
    const tags = allTags.slice(0, 10);
    const chunkSize = Math.max(1, Math.min(10, Number(chunkSizeEl?.value || 2)));
    const chunk = tags.slice(0, chunkSize);
    chunkCursor = 0;
    await fetchMeasurementOnce(chunk);
  });

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
      const cs = Math.max(1, Math.min(10, Number(chunkSizeEl?.value || 2)));
      setApiStatus('API: kör polling mot /MeasurementMulti' + (tm === 'latest' ? ' · Strömmande senaste' : ' · Manuell tid')
        + ` · chunk=${cs}`
        + ` · fetch=${(fetchModeEl?.value||'window')}`
        + ' (tryck "Testa" för direktanrop)');
    }
  }
  if (modeEl) modeEl.addEventListener('change', applyMode);
  if (timeModeEl) timeModeEl.addEventListener('change', applyMode);
  if (lookbackMinEl) lookbackMinEl.addEventListener('change', applyMode);
  if (fetchModeEl) fetchModeEl.addEventListener('change', applyMode);

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
          headToken: '',
          headChars: null,
          headObj: null,
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
          // Assign head token only before the column enters the screen (so it stays stable for the whole fall)
          if (!c.headToken && c.y < 0) {
            c.headObj = nextHeadTokenReusable();
            if (!c.headObj) {
              // No API token yet; leave headToken empty (tail continues)
              c.headToken = '';
              c.headChars = null;
            } else {
              c.headToken = String(c.headObj.value);
              c.headChars = c.headToken.split('');
            }
            c.headChars = c.headToken ? String(c.headToken).split('') : null;
          }


          const tail = Math.max(6, Math.floor(c.burst - c.burstDecay));
          c.burstDecay += 0.015 * c.speed * speedScale();

          for (let t = 1; t < tail; t++) {
            const y = yPx - t * this.stepY;
            if (y < -this.stepY) continue;
            if (y > H + this.stepY) break;

            const a = 0.30 * alphaMul * (1 - t / tail);
            ctx.fillStyle = `rgba(72, 255, 132, ${a})`;
            const ch = takeTokenOrRandom(cs);
            ctx.fillText(ch, x, y);
          }

                    // Head token: only draw if assigned from API queue
          if (c.headToken) {
// Stable head token (whole value), drawn last so it doesn't flicker
            const chars = c.headChars || String(c.headToken).split('');
            const L = Math.min(chars.length, 10);
            for (let i2 = 0; i2 < L; i2++) {
              const y2 = yPx + i2 * this.stepY;
              if (y2 < -this.stepY) continue;
              if (y2 > H + this.stepY) break;
              const aH = (0.98 - i2 * 0.06) * alphaMul;
              ctx.fillStyle = `rgba(180, 255, 210, ${Math.max(0.30, aH)})`;
              ctx.fillText(chars[i2], x, y2);
            }
             
          
          // Register hover region for this head token (for tooltip)
          try {
            const colW = fontPx * 0.62;
            const tokenLen = String(c.headToken || '').length;
            const w = Math.max(colW * 0.9, tokenLen * (colW * 0.55));
            const left = x - w / 2;
            const right = x + w / 2;
            const top = yPx - this.stepY * 0.8;
            const bottom = yPx + (L + 0.8) * this.stepY;
            hoverRegions.push({ left, right, top, bottom, headObj: c.headObj, value: c.headToken });
          } catch {}
}
c.y += c.speed * speedScale();
          if (yPx > H + 200) {
            c.y = (Math.random() * -90) | 0;
            c.speed = (0.55 + Math.random() * 1.25) * speedMul;
            c.burst = 12 + ((Math.random() * 28) | 0);
            c.burstDecay = 0.0;
            c.headToken = '';
            c.headChars = null;
            c.headObj = null;
            c.headToken = '';
            c.headChars = null;
            c.headObj = null;
          }
        }
        ctx.shadowBlur = 0;
      }
    };
    layer.init();
    return layer;
  }

  
  function classicLayerTable(n){
    // base parameters approximating the classic Matrix look
    if (n === 1) return { speed:[0.82], dens:[1.0], glow:[9], alpha:[0.75], offs:[0] };
    if (n === 2) return { speed:[0.75,0.92], dens:[0.95,0.90], glow:[7,11], alpha:[0.65,0.95], offs:[-2,2] };
    if (n === 4) return { speed:[0.65,0.78,0.90,1.02], dens:[0.95,1.05,0.95,0.85], glow:[5,7,10,13], alpha:[0.45,0.65,0.85,0.98], offs:[-6,-2,2,6] };
    // default 3
    return { speed:[0.70,0.82,0.92], dens:[0.95,1.00,0.85], glow:[6,9,12], alpha:[0.55,0.75,0.95], offs:[-4,0,4] };
  }

  let layers = [];
  function rebuildLayers(){
    const n = mxLayers();
    const base = mxFontBase();
    const tab = classicLayerTable(n);
    const densMul = mxDensity();
    const glowMul = mxGlow();
    const spdMul = mxSpeed();
    layers = new Array(n).fill(0).map((_,i)=>{
      const fp = Math.max(10, Math.min(28, base + tab.offs[i]));
      const speedMul = tab.speed[i] * spdMul * speedScale();
      const densityMul = tab.dens[i] * densMul;
      const glow = tab.glow[i] * glowMul;
      const alphaMul = tab.alpha[i];
      return makeLayer(fp, speedMul, densityMul, glow, alphaMul);
    });
  }


  let paused = false;
  function frame() {
    if (!paused) hoverRegions.length = 0; // rebuild regions when animating; keep last when paused
    if (!paused) {
      ctx.fillStyle = `rgba(0, 0, 0, ${BG_FADE()})`;
      ctx.fillRect(0, 0, W, H);
      for (const L of layers) L.draw();
    }
        // Even when paused, allow hover tooltips
    hitTestHover();
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


  function onMatrixTuningChange(){
    try{ rebuildLayers(); } catch {}
    try{ saveSettings(); } catch {}
  }

  [mxLayersEl, mxFontEl, mxDensityEl, mxGlowEl, mxSpeedEl, mxFadeEl].forEach(el=>{
    if (!el) return;
    el.addEventListener('input', onMatrixTuningChange);
    el.addEventListener('change', onMatrixTuningChange);
  });

  function applyPreset(preset){
    if (!preset || preset === 'custom') return;
    if (preset === 'classic') {
      // Classic Matrix defaults
      try { charsetEl.value = 'matrix'; } catch {}
      try { trailEl.value = 0.08; } catch {}
      try { speedEl.value = 0.6; } catch {}
      try { mxLayersEl.value = 3; } catch {}
      try { mxFontEl.value = 16; } catch {}
      try { mxDensityEl.value = 1.0; } catch {}
      try { mxGlowEl.value = 1.0; } catch {}
      try { mxSpeedEl.value = 1.0; } catch {}
      try { mxFadeEl.value = 1.0; } catch {}
      onMatrixTuningChange();
    }
  }

  if (mxPresetEl){
    mxPresetEl.addEventListener('change', ()=>{
      try{ saveSettings(); }catch{}
      applyPreset(mxPresetEl.value);
    });
  }
