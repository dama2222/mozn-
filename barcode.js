/* =====================================================================
   MUZN — وحدة الماسح الضوئي (باركود + QR)  v3
   =====================================================================
   • تقرأ: Code128 / Code39 / Code93 / EAN / UPC / ITF / Codabar / QR / DataMatrix
   • محرك القراءة:
       1) BarcodeDetector الأصلي في المتصفح (الأسرع) إن كان مدعوماً
       2) وإلا مكتبة ZXing (تُحمَّل عند الحاجة فقط) — تعمل على آيفون وكل المتصفحات
   • واجهة حديثة: إطار مسح متحرك، فلاش، تكبير (زوم)، تبديل الكاميرا،
     قراءة من صورة، إدخال يدوي، اهتزاز وصوت، سجل آخر العمليات
   • نفس واجهة الاستدعاء القديمة تماماً:
       openScanner({ title, mode:'product'|'customer'|'distributor'|'auto', screen,
                     onFound(entity, rawCode, entityType), onNotFound(rawCode),
                     store, toast, escHtml, adapter, user, uuid, closeSheet, openSheet,
                     continuous:false })
   • window.__barcodeScanner.stop() متاحة كما كانت
   ===================================================================== */
(function(){
'use strict';

/* ───────────────────────── أدوات عامة ───────────────────────── */
const ZX_URL = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
const NATIVE_FORMATS = ['qr_code','code_128','code_39','code_93','ean_13','ean_8','upc_a','upc_e','itf','codabar','data_matrix'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

function localToday(){
  if(typeof window.today === 'function'){ try{ return window.today(); }catch(e){} }
  const d = new Date(), p = n => String(n).padStart(2,'0');
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
}

let _zxP = null;
function loadZX(){
  if(window.ZXing) return Promise.resolve();
  if(_zxP) return _zxP;
  _zxP = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = ZX_URL;
    s.onload = () => window.ZXing ? resolve() : reject(new Error('zxing'));
    s.onerror = () => { _zxP = null; reject(new Error('zxing-load')); };
    document.head.appendChild(s);
  });
  return _zxP;
}

/* محرك القراءة: native أو zxing — يعيد {kind, decode(source) → نص أو null} */
async function makeNativeEngine(){
  if(!('BarcodeDetector' in window)) return null;
  try{
    const sup = await window.BarcodeDetector.getSupportedFormats();
    const formats = NATIVE_FORMATS.filter(f => sup.indexOf(f) >= 0);
    if(formats.indexOf('qr_code') < 0 || formats.indexOf('code_128') < 0) return null;
    const det = new window.BarcodeDetector({ formats });
    return {
      kind: 'native',
      async decode(src){
        const r = await det.detect(src);
        return (r && r[0] && r[0].rawValue) ? String(r[0].rawValue) : null;
      }
    };
  }catch(e){ return null; }
}
async function makeZxEngine(){
  await loadZX();
  const Z = window.ZXing;
  const F = Z.BarcodeFormat;
  const hints = new Map();
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [
    F.QR_CODE, F.CODE_128, F.CODE_39, F.CODE_93, F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.ITF, F.CODABAR, F.DATA_MATRIX
  ]);
  hints.set(Z.DecodeHintType.TRY_HARDER, true);
  const reader = new Z.MultiFormatReader();
  reader.setHints(hints);
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  return {
    kind: 'zxing',
    async decode(src){
      const w = src.videoWidth || src.naturalWidth || src.width;
      const h = src.videoHeight || src.naturalHeight || src.height;
      if(!w || !h) return null;
      const sc = Math.min(1, 960 / Math.max(w, h));
      cv.width = Math.max(1, Math.round(w * sc));
      cv.height = Math.max(1, Math.round(h * sc));
      ctx.drawImage(src, 0, 0, cv.width, cv.height);
      try{
        const lum = new Z.HTMLCanvasElementLuminanceSource(cv);
        const bmp = new Z.BinaryBitmap(new Z.HybridBinarizer(lum));
        return String(reader.decode(bmp).getText());
      }catch(e){ return null; }
    }
  };
}
async function makeEngine(){
  return (await makeNativeEngine()) || (await makeZxEngine());
}

/* ───────────────────────── مطابقة الرمز مع البيانات ───────────────────────── */
/* QR قد يحمل رابطاً أو JSON أو بادئة؛ نستخرج كل الاحتمالات المعقولة للرقم */
function candidates(raw){
  const s = String(raw == null ? '' : raw).trim();
  const out = [s];
  try{
    const j = JSON.parse(s);
    if(j && typeof j === 'object'){
      ['barcode','code','id','b','c'].forEach(k => { if(j[k] != null) out.push(String(j[k]).trim()); });
    }
  }catch(e){}
  const q = s.match(/[?&#](?:b|c|code|barcode)=([^&#\s]+)/i);
  if(q){ try{ out.push(decodeURIComponent(q[1])); }catch(e){ out.push(q[1]); } }
  const pref = s.match(/^muzn[:\/_\-]+(?:[a-z]+[:\/_\-]+)?(.+)$/i);
  if(pref) out.push(pref[1].trim());
  const tail = s.split(/[:\/|#\s]+/).filter(Boolean).pop();
  if(tail) out.push(tail);
  const digits = s.replace(/\D/g, '');
  if(digits && digits !== s) out.push(digits);
  return Array.from(new Set(out.filter(Boolean)));
}
function sameCode(a, b){
  a = String(a).trim(); b = String(b).trim();
  if(a === b) return true;
  if(/^\d+$/.test(a) && /^\d+$/.test(b)) return a.replace(/^0+/, '') === b.replace(/^0+/, '');
  return false;
}
const TABLES = { product: 'products', customer: 'customers', distributor: 'distributors' };
function lookup(store, code, mode){
  const types = TABLES[mode] ? [mode] : ['product', 'customer', 'distributor'];
  const cands = candidates(code);
  for(const type of types){
    const list = (store && store[TABLES[type]]) || [];
    for(const c of cands){
      const hit = list.find(x => x.barcode != null && String(x.barcode).trim() !== '' && sameCode(x.barcode, c));
      if(hit) return { entity: hit, type };
    }
  }
  return { entity: null, type: null };
}

/* ───────────────────────── تنسيق الواجهة ───────────────────────── */
function injectCSS(){
  if(document.getElementById('mzs-css')) return;
  const st = document.createElement('style');
  st.id = 'mzs-css';
  st.textContent = `
.mzs{direction:rtl;text-align:center}
.mzs-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
.mzs-head h3{margin:0;font-size:18px;font-weight:800}
.mzs-chip{font-size:12px;font-weight:700;padding:4px 12px;border-radius:99px;white-space:nowrap;
  background:rgba(243,224,43,.16);color:var(--accent,#f3e02b)}
.mzs-view{position:relative;width:100%;aspect-ratio:4/3;max-height:56vh;border-radius:22px;overflow:hidden;
  background:#05070b;box-shadow:0 0 0 1px var(--line,#3b4050),0 14px 34px rgba(0,0,0,.35);isolation:isolate}
.mzs-view video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000}
.mzs-frame{position:absolute;left:50%;top:50%;width:76%;height:46%;transform:translate(-50%,-50%);border-radius:18px;
  box-shadow:0 0 0 999px rgba(0,0,0,.5);pointer-events:none;transition:box-shadow .25s}
.mzs-frame i{position:absolute;width:26px;height:26px;border:4px solid var(--accent,#f3e02b);transition:border-color .2s}
.mzs-frame i:nth-child(1){top:-2px;right:-2px;border-left:0;border-bottom:0;border-top-right-radius:16px}
.mzs-frame i:nth-child(2){top:-2px;left:-2px;border-right:0;border-bottom:0;border-top-left-radius:16px}
.mzs-frame i:nth-child(3){bottom:-2px;right:-2px;border-left:0;border-top:0;border-bottom-right-radius:16px}
.mzs-frame i:nth-child(4){bottom:-2px;left:-2px;border-right:0;border-top:0;border-bottom-left-radius:16px}
.mzs-laser{position:absolute;left:5%;right:5%;height:2px;border-radius:2px;
  background:linear-gradient(90deg,transparent,var(--accent,#f3e02b),transparent);
  box-shadow:0 0 14px var(--accent,#f3e02b);animation:mzs-sweep 1.9s ease-in-out infinite}
@keyframes mzs-sweep{0%,100%{top:6%}50%{top:92%}}
.mzs-tools{position:absolute;top:10px;left:10px;right:10px;display:flex;justify-content:space-between;gap:8px;z-index:3}
.mzs-tools .grp{display:flex;gap:8px}
.mzs-ib{width:42px;height:42px;border-radius:50%;border:0;display:grid;place-items:center;cursor:pointer;font-size:19px;
  background:rgba(15,17,23,.62);color:#fff;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.mzs-ib.on{background:var(--accent,#f3e02b);color:#15171d}
.mzs-ib[hidden]{display:none}
.mzs-status{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);z-index:3;max-width:92%;
  padding:7px 16px;border-radius:99px;font-size:13px;font-weight:700;color:#fff;white-space:nowrap;
  background:rgba(15,17,23,.7);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);transition:background .2s}
.mzs-view.ok .mzs-status{background:rgba(22,163,74,.92)}
.mzs-view.bad .mzs-status{background:rgba(220,38,38,.92)}
.mzs-view.ok .mzs-frame i{border-color:#22c55e}
.mzs-view.bad .mzs-frame i{border-color:#ef4444}
.mzs-view.ok .mzs-laser,.mzs-view.bad .mzs-laser{animation-play-state:paused;opacity:.25}
.mzs-view.ok::after{content:'✓';position:absolute;inset:0;display:grid;place-items:center;z-index:2;font-size:84px;font-weight:800;
  color:#fff;background:rgba(22,163,74,.38);animation:mzs-pop .35s ease-out}
@keyframes mzs-pop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}
.mzs-msg{position:absolute;inset:0;z-index:4;display:none;flex-direction:column;align-items:center;justify-content:center;gap:8px;
  padding:24px;background:#0b0e14;color:#cbd0dc;font-size:14px;line-height:1.7}
.mzs-msg.show{display:flex}
.mzs-msg b{font-size:17px;color:#ff8f84}
.mzs-msg .big{font-size:42px}
.mzs-zoom{display:none;align-items:center;gap:10px;margin-top:12px;padding:0 6px}
.mzs-zoom.show{display:flex}
.mzs-zoom input{flex:1;accent-color:var(--accent,#f3e02b)}
.mzs-zoom span{font-size:12px;color:var(--muted,#a1a7b6);min-width:34px}
.mzs-manual{display:flex;gap:8px;margin-top:12px}
.mzs-manual input{flex:1;min-width:0;text-align:center;letter-spacing:1px;direction:ltr}
.mzs-row{display:flex;gap:8px;margin-top:10px}
.mzs-row .btn-ghost,.mzs-row .btn-primary{flex:1}
.mzs-hist{margin-top:14px;text-align:right}
.mzs-hist h4{margin:0 0 6px;font-size:12.5px;color:var(--muted,#a1a7b6);font-weight:700}
.mzs-hist div.it{display:flex;align-items:center;gap:8px;padding:7px 10px;margin-bottom:6px;border-radius:12px;
  background:var(--card,#1d212d);border:1px solid var(--line,#3b4050);font-size:13px}
.mzs-hist .it b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mzs-hist .it small{direction:ltr;color:var(--muted,#a1a7b6)}
@media (prefers-reduced-motion:reduce){.mzs-laser{animation:none;top:50%}}
`;
  document.head.appendChild(st);
}

/* ───────────────────────── صوت واهتزاز ───────────────────────── */
let _ac = null;
function beep(freq, dur, vol){
  try{
    _ac = _ac || new (window.AudioContext || window.webkitAudioContext)();
    if(_ac.state === 'suspended') _ac.resume();
    const o = _ac.createOscillator(), g = _ac.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.16, _ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, _ac.currentTime + dur / 1000);
    o.connect(g); g.connect(_ac.destination);
    o.start(); o.stop(_ac.currentTime + dur / 1000);
  }catch(e){}
}
function vibrate(p){ try{ if(navigator.vibrate) navigator.vibrate(p); }catch(e){} }

/* ───────────────────────── مدير الجلسة ───────────────────────── */
const Scanner = {
  active: null,
  async stop(){
    const a = this.active;
    this.active = null;
    if(a){ try{ await a.stop(); }catch(e){} }
  }
};

/* =====================================================================
   openScanner
   ===================================================================== */
window.openScanner = function(options){
  const opts = Object.assign({
    title: 'مسح الباركود', mode: 'auto', screen: 'general',
    onFound: function(){}, onNotFound: null, continuous: false
  }, options);
  const store = opts.store, toast = opts.toast, escHtml = opts.escHtml,
        adapter = opts.adapter, user = opts.user, uuid = opts.uuid;
  const esc = escHtml || (s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));

  injectCSS();
  Scanner.stop();

  const modeLabel = { product: '🏷️ المنتجات', customer: '🏪 العملاء', distributor: '🚚 الموزعون' }[opts.mode] || '🎯 منتجات · عملاء · موزعون';
  const rid = 'mzs-' + Math.random().toString(36).slice(2, 8);

  opts.openSheet(
    '<div class="mzs" id="' + rid + '">' +
      '<div class="mzs-head"><h3>' + esc(opts.title) + '</h3><span class="mzs-chip">' + modeLabel + '</span></div>' +
      '<div class="mzs-view" data-v>' +
        '<video playsinline muted autoplay></video>' +
        '<div class="mzs-frame"><i></i><i></i><i></i><i></i><div class="mzs-laser"></div></div>' +
        '<div class="mzs-tools"><div class="grp">' +
          '<button type="button" class="mzs-ib" data-torch hidden aria-label="الفلاش">🔦</button>' +
          '<button type="button" class="mzs-ib" data-flip hidden aria-label="تبديل الكاميرا">🔄</button>' +
        '</div><div class="grp"><button type="button" class="mzs-ib" data-close aria-label="إغلاق">✕</button></div></div>' +
        '<div class="mzs-status" data-status>جارٍ تشغيل الكاميرا…</div>' +
        '<div class="mzs-msg" data-msg></div>' +
      '</div>' +
      '<div class="mzs-zoom" data-zoomwrap><span>🔍</span><input type="range" data-zoom min="1" max="3" step="0.1" value="1"><span data-zoomv>1×</span></div>' +
      '<div class="mzs-manual"><input class="in" data-manual inputmode="text" autocomplete="off" placeholder="أو اكتب الرقم يدوياً"><button type="button" class="btn-primary" data-go>بحث</button></div>' +
      '<div class="mzs-row"><button type="button" class="btn-ghost" data-pick>🖼️ من صورة</button><button type="button" class="btn-ghost" data-cancel>إلغاء</button></div>' +
      '<input type="file" accept="image/*" data-file hidden>' +
      '<div class="mzs-hist" data-hist hidden></div>' +
    '</div>'
  );

  let root = null;
  const q = sel => root.querySelector(sel);

  /* حالة الجلسة */
  let engine = null, stream = null, stopped = false, paused = false, busy = false;
  let timer = null, watch = null, torchOn = false, track = null;
  let devices = [], devIdx = -1, lastCode = '', lastTime = 0, statusTimer = null;
  const history = [];

  function setStatus(txt, kind, hold){
    const v = q('[data-v]'); if(!v) return;
    const s = q('[data-status]'); if(s) s.textContent = txt;
    v.classList.remove('ok', 'bad');
    if(kind) v.classList.add(kind);
    clearTimeout(statusTimer);
    if(kind && !hold){
      statusTimer = setTimeout(() => { if(!stopped) setStatus('وجّه الكاميرا نحو الباركود أو QR'); }, 1600);
    }
  }
  function showMsg(html){
    const m = q('[data-msg]'); if(!m) return;
    m.innerHTML = html; m.classList.add('show');
    const st = q('[data-status]'); if(st) st.style.display = 'none';
    const f = q('.mzs-frame'); if(f) f.style.display = 'none';
  }

  /* ---------- تسجيل العملية ---------- */
  function logScan(code, found, entity, type, manual){
    try{
      const row = {
        id: uuid ? uuid() : (Date.now() + '-' + Math.random().toString(36).slice(2)),
        date: localToday(),
        user_id: user ? user.id : null, user_name: user ? user.name : '',
        barcode: code, entity_type: type || 'unknown', entity_id: entity ? entity.id : null,
        found: !!found, screen: opts.screen + (manual ? '/manual' : ''), ts: Date.now()
      };
      if(adapter && adapter.saveSimple) adapter.saveSimple('scan_log', row).catch(e => console.warn('scan log failed', e));
      if(store && store.scan_log) store.scan_log.unshift(row);
    }catch(e){}
  }

  function renderHistory(){
    const h = q('[data-hist]'); if(!h) return;
    if(!history.length){ h.hidden = true; return; }
    h.hidden = false;
    h.innerHTML = '<h4>آخر عمليات المسح</h4>' + history.slice(0, 4).map(x =>
      '<div class="it"><span>' + (x.ok ? '✅' : '❌') + '</span><b>' + esc(x.name) + '</b><small>' + esc(x.code) + '</small></div>'
    ).join('');
  }

  /* ---------- معالجة رمز مقروء ---------- */
  async function handle(raw, manual){
    const code = String(raw || '').trim();
    if(!code) return;
    const now = Date.now();
    if(!manual && code === lastCode && now - lastTime < 1800) return;
    lastCode = code; lastTime = now;

    const r = lookup(store, code, opts.mode);
    logScan(code, !!r.entity, r.entity, r.type, manual);

    if(r.entity){
      beep(988, 90); vibrate(45);
      history.unshift({ code, name: r.entity.name || code, ok: true });
      renderHistory();
      setStatus('✓ ' + (r.entity.name || code), 'ok', true);
      if(opts.continuous){
        try{ opts.onFound(r.entity, code, r.type); }catch(e){ console.error(e); }
        setTimeout(() => { if(!stopped) setStatus('وجّه الكاميرا نحو الباركود أو QR'); }, 1100);
        return;
      }
      await sleep(320);
      await Scanner.stop();
      opts.closeSheet();
      opts.onFound(r.entity, code, r.type);
    }else{
      beep(200, 220, 0.2); vibrate([70, 50, 70]);
      history.unshift({ code, name: 'غير مسجَّل في النظام', ok: false });
      renderHistory();
      setStatus('✕ غير مسجَّل: ' + (code.length > 22 ? code.slice(0, 22) + '…' : code), 'bad');
      if(opts.onNotFound) opts.onNotFound(code);
      else if(toast) toast('لم يُعثر على: ' + code, 'err');
    }
  }

  /* ---------- الكاميرا ---------- */
  async function openStream(deviceId){
    const base = { width: { ideal: 1280 }, height: { ideal: 720 } };
    const tries = deviceId
      ? [{ video: Object.assign({ deviceId: { exact: deviceId } }, base) }]
      : [{ video: Object.assign({ facingMode: { ideal: 'environment' } }, base) }, { video: true }];
    let lastErr = null;
    for(const c of tries){
      try{ return await navigator.mediaDevices.getUserMedia(c); }catch(e){ lastErr = e; if(e && e.name === 'NotAllowedError') break; }
    }
    throw lastErr || new Error('camera');
  }

  async function attachStream(deviceId){
    if(stream){ stream.getTracks().forEach(t => t.stop()); stream = null; }
    stream = await openStream(deviceId);
    const video = q('video');
    video.srcObject = stream;
    try{ await video.play(); }catch(e){}
    track = stream.getVideoTracks()[0] || null;
    torchOn = false;
    const tb = q('[data-torch]'); if(tb){ tb.hidden = true; tb.classList.remove('on'); }
    const zw = q('[data-zoomwrap]'); if(zw) zw.classList.remove('show');
    try{
      const caps = (track && track.getCapabilities) ? track.getCapabilities() : {};
      const adv = [];
      if(caps.focusMode && caps.focusMode.indexOf('continuous') >= 0) adv.push({ focusMode: 'continuous' });
      if(adv.length) await track.applyConstraints({ advanced: adv }).catch(() => {});
      if(caps.torch && tb) tb.hidden = false;
      if(caps.zoom && zw){
        const z = q('[data-zoom]');
        z.min = caps.zoom.min; z.max = Math.min(caps.zoom.max, caps.zoom.min * 6 || caps.zoom.max);
        z.step = caps.zoom.step || 0.1; z.value = caps.zoom.min;
        q('[data-zoomv]').textContent = Number(z.value).toFixed(1) + '×';
        zw.classList.add('show');
      }
    }catch(e){}
    try{
      const all = await navigator.mediaDevices.enumerateDevices();
      devices = all.filter(d => d.kind === 'videoinput');
      const cur = track && track.getSettings ? track.getSettings().deviceId : null;
      devIdx = Math.max(0, devices.findIndex(d => d.deviceId === cur));
      const fb = q('[data-flip]'); if(fb) fb.hidden = devices.length < 2;
    }catch(e){}
  }

  function loop(){
    if(stopped) return;
    const video = q('video');
    const delay = engine && engine.kind === 'native' ? 70 : 120;
    const run = async () => {
      if(stopped) return;
      if(!busy && !paused && video && video.readyState >= 2){
        busy = true;
        try{
          const txt = await engine.decode(video);
          if(txt && !stopped) await handle(txt, false);
        }catch(e){}
        busy = false;
      }
      if(!stopped) timer = setTimeout(run, delay);
    };
    timer = setTimeout(run, delay);
  }

  async function stop(){
    if(stopped) return;
    stopped = true;
    clearTimeout(timer); clearTimeout(statusTimer); clearInterval(watch);
    document.removeEventListener('visibilitychange', onVis);
    if(torchOn && track){ try{ await track.applyConstraints({ advanced: [{ torch: false }] }); }catch(e){} }
    if(stream){ stream.getTracks().forEach(t => { try{ t.stop(); }catch(e){} }); stream = null; }
    const v = root && root.querySelector('video'); if(v){ try{ v.srcObject = null; }catch(e){} }
  }
  function onVis(){
    if(document.hidden){ paused = true; }
    else { paused = false; const v = root && root.querySelector('video'); if(v && v.paused) v.play().catch(() => {}); }
  }

  /* ---------- قراءة من صورة ---------- */
  async function decodeFile(file){
    setStatus('جارٍ قراءة الصورة…', null, true);
    try{
      let bmp;
      try{ bmp = await createImageBitmap(file); }
      catch(e){
        bmp = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(file); });
      }
      let txt = engine ? await engine.decode(bmp) : null;
      if(!txt && engine && engine.kind === 'native'){
        try{ const zx = await makeZxEngine(); txt = await zx.decode(bmp); }catch(e){}
      }
      if(txt) await handle(txt, true);
      else { setStatus('لم يُعثر على باركود في الصورة', 'bad'); beep(200, 200, 0.2); if(toast) toast('لم يُعثر على باركود في الصورة', 'err'); }
    }catch(e){ setStatus('تعذرت قراءة الصورة', 'bad'); }
  }

  /* ---------- ربط الأزرار ---------- */
  function wire(){
    q('[data-close]').onclick = q('[data-cancel]').onclick = async () => { await Scanner.stop(); opts.closeSheet(); };

    const tb = q('[data-torch]');
    tb.onclick = async () => {
      if(!track) return;
      try{
        torchOn = !torchOn;
        await track.applyConstraints({ advanced: [{ torch: torchOn }] });
        tb.classList.toggle('on', torchOn);
      }catch(e){ torchOn = false; tb.classList.remove('on'); }
    };

    q('[data-flip]').onclick = async () => {
      if(devices.length < 2) return;
      devIdx = (devIdx + 1) % devices.length;
      try{ await attachStream(devices[devIdx].deviceId); }
      catch(e){ if(toast) toast('تعذر تبديل الكاميرا', 'err'); }
    };

    const z = q('[data-zoom]');
    z.oninput = async () => {
      q('[data-zoomv]').textContent = Number(z.value).toFixed(1) + '×';
      try{ await track.applyConstraints({ advanced: [{ zoom: Number(z.value) }] }); }catch(e){}
    };

    const man = q('[data-manual]');
    const go = () => { const v = man.value.trim(); if(!v) return; man.value = ''; handle(v, true); };
    q('[data-go]').onclick = go;
    man.onkeydown = e => { if(e.key === 'Enter'){ e.preventDefault(); go(); } };

    const fi = q('[data-file]');
    q('[data-pick]').onclick = () => fi.click();
    fi.onchange = () => { const f = fi.files && fi.files[0]; fi.value = ''; if(f) decodeFile(f); };

    document.addEventListener('visibilitychange', onVis);
    // إيقاف الكاميرا تلقائياً إذا أُغلقت النافذة بأي طريقة
    watch = setInterval(() => { if(!root.isConnected){ Scanner.stop(); } }, 500);
  }

  /* ---------- الإقلاع ---------- */
  (async function boot(){
    for(let i = 0; i < 20 && !root; i++){ root = document.getElementById(rid); if(!root) await sleep(25); }
    if(!root) return;
    Scanner.active = { stop };
    wire();

    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
      showMsg('<div class="big">🔒</div><b>الكاميرا غير متاحة</b>يتطلب المسح فتح التطبيق عبر HTTPS ومتصفحاً يدعم الكاميرا.<br>يمكنك الكتابة يدوياً أو اختيار صورة.');
      setStatus('الكاميرا غير متاحة', 'bad', true);
      try{ engine = await makeEngine(); }catch(e){}
      return;
    }
    try{ engine = await makeEngine(); }
    catch(e){
      showMsg('<div class="big">📡</div><b>تعذر تحميل وحدة القراءة</b>تحقق من الاتصال بالإنترنت ثم أعد المحاولة.<br>يمكنك الكتابة يدوياً.');
      return;
    }
    try{ await attachStream(null); }
    catch(e){
      const name = e && e.name;
      const why = name === 'NotAllowedError' ? 'تم رفض إذن الكاميرا — فعّله من إعدادات المتصفح للموقع.'
                : name === 'NotFoundError' ? 'لا توجد كاميرا في هذا الجهاز.'
                : name === 'NotReadableError' ? 'الكاميرا مستخدمة في تطبيق آخر.'
                : 'تأكد من إذن الكاميرا ومن الاتصال عبر HTTPS.';
      showMsg('<div class="big">📷</div><b>تعذر تشغيل الكاميرا</b>' + esc(why) + '<br>يمكنك الكتابة يدوياً أو اختيار صورة.');
      if(toast) toast('تعذر تشغيل الكاميرا', 'err');
      return;
    }
    if(stopped) return;
    setStatus('وجّه الكاميرا نحو الباركود أو QR');
    loop();
  })();
};

window.__barcodeScanner = Scanner;
window.MZNScanner = { open: window.openScanner, stop: () => Scanner.stop(), parse: candidates, lookup };

})();
