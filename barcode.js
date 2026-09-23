/* =====================================================================
   MUZN — Barcode Scanner Module
   =====================================================================
   يوفر:
   - openScanner(options)    → يفتح نافذة المسح
   - Code128 + جميع الأنواع
   - وضع ليلي (torch) إذا توفر
   - إدخال يدوي كبديل
   - تسجيل العمليات في scan_log
   ===================================================================== */
(function(){
'use strict';

// تحميل مكتبة html5-qrcode عند الحاجة
let _libLoaded = false;
function loadLib(){
  if(_libLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
    s.onload = () => { _libLoaded = true; resolve(); };
    s.onerror = () => reject(new Error('فشل تحميل مكتبة الماسح'));
    document.head.appendChild(s);
  });
}

// مدير الماسح
const Scanner = {
  active: null,     // Html5Qrcode instance
  stream: null,
  torchOn: false,
  torchTrack: null,

  async start(containerId, onDetected){
    await loadLib();
    const { Html5Qrcode, Html5QrcodeSupportedFormats } = window;

    // تنسيقات مقترحة (Code128 أولاً)
    const formats = [
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.QR_CODE,
      Html5QrcodeSupportedFormats.CODE_93,
      Html5QrcodeSupportedFormats.ITF
    ];

    const html5 = new Html5Qrcode(containerId, {
      formatsToSupport: formats,
      verbose: false
    });

    this.active = html5;

    let lastScan = '';
    let lastTime = 0;

    await html5.start(
      { facingMode: 'environment' },
      {
        fps: 15,
        qrbox: { width: 280, height: 160 },
        aspectRatio: 1.777
      },
      (decodedText) => {
        const now = Date.now();
        // منع التسجيل المزدوج (خلال ثانية)
        if(decodedText === lastScan && now - lastTime < 1200) return;
        lastScan = decodedText;
        lastTime = now;
        onDetected(decodedText);
      },
      () => {} // تجاهل أخطاء الإطار
    );

    // محاولة تفعيل الفلاش إن وُجد
    try{
      const video = document.querySelector('#' + containerId + ' video');
      if(video && video.srcObject){
        const track = video.srcObject.getVideoTracks()[0];
        this.torchTrack = track;
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        if(caps.torch){
          this.hasTorch = true;
        }
      }
    }catch(e){ /* تجاهل */ }
  },

  async toggleTorch(){
    if(!this.torchTrack) return false;
    try{
      this.torchOn = !this.torchOn;
      await this.torchTrack.applyConstraints({ advanced: [{ torch: this.torchOn }] });
      return this.torchOn;
    }catch(e){ return false; }
  },

  async stop(){
    if(this.active){
      try{
        await this.active.stop();
        this.active.clear();
      }catch(e){ /* تجاهل */ }
      this.active = null;
    }
    this.torchOn = false;
    this.torchTrack = null;
  }
};

/* =====================================================================
   API العام — openScanner
   =====================================================================
   options = {
     title: 'مسح الباركود',
     mode: 'product' | 'customer' | 'distributor' | 'auto',
     screen: 'sales' | 'withdrawals' | 'production' | 'management',
     onFound: (entity, rawCode) => { ... },
     onNotFound: (rawCode) => { ... },  // اختياري
     store: store,                       // مرجع للبيانات
     toast: toast,                        // مرجع للتنبيهات
     closeSheet: closeSheet,
     openSheet: openSheet,
     escHtml: escHtml,
     adapter: adapter,
     user: user,
     uuid: uuid
   }
   ===================================================================== */
window.openScanner = function(options){
  const opts = Object.assign({
    title: 'مسح الباركود',
    mode: 'auto',
    screen: 'general',
    onFound: () => {},
    onNotFound: null
  }, options);

  const { store, toast, escHtml, adapter, user, uuid } = opts;

  // ===== HTML للنافذة =====
  const html = `
    <div style="text-align:center">
      <h3 style="margin-bottom:8px">${escHtml(opts.title)}</h3>
      <p class="muted" style="margin:0 0 12px;font-size:13px">
        ${opts.mode === 'product' ? '🎯 المنتجات' :
          opts.mode === 'customer' ? '🎯 العملاء' :
          opts.mode === 'distributor' ? '🎯 الموزعون' :
          '🎯 المنتجات · العملاء · الموزعون'}
      </p>

      <!-- حاوية الكاميرا -->
      <div id="scanner-container"
           style="width:100%;max-width:400px;margin:0 auto;border-radius:12px;overflow:hidden;background:#000;min-height:240px;position:relative">
        <div style="padding:40px;text-align:center;color:#999">
          <div style="font-size:40px;margin-bottom:8px">📷</div>
          <div>جارٍ تشغيل الكاميرا...</div>
        </div>
      </div>

      <!-- أزرار التحكم -->
      <div style="display:flex;gap:8px;margin-top:12px;justify-content:center;flex-wrap:wrap">
        <button class="btn-ghost sm" id="scan-torch" style="display:none">
          🔦 الفلاش
        </button>
        <button class="btn-ghost sm" id="scan-manual">
          ⌨️ إدخال يدوي
        </button>
        <button class="btn-ghost sm" id="scan-cancel">
          ❌ إلغاء
        </button>
      </div>

      <!-- سجل آخر عمليات المسح -->
      <div id="scan-history" style="margin-top:14px;text-align:right;font-size:12px;color:var(--muted);display:none">
      </div>
    </div>
  `;

  opts.openSheet(html);

  // ===== بدء المسح =====
  const history = [];

  Scanner.start('scanner-container', async (code) => {
    const trimmed = String(code).trim();
    if(!trimmed) return;

    // 🔍 البحث في قاعدة البيانات
    let entity = null;
    let entityType = null;

    if(opts.mode === 'product' || opts.mode === 'auto'){
      const p = store.products.find(x => x.barcode === trimmed);
      if(p){ entity = p; entityType = 'product'; }
    }
    if(!entity && (opts.mode === 'customer' || opts.mode === 'auto')){
      const c = store.customers.find(x => x.barcode === trimmed);
      if(c){ entity = c; entityType = 'customer'; }
    }
    if(!entity && (opts.mode === 'distributor' || opts.mode === 'auto')){
      const d = store.distributors.find(x => x.barcode === trimmed);
      if(d){ entity = d; entityType = 'distributor'; }
    }

    // 📝 سجل العملية
    try{
      const logRow = {
        id: uuid(),
        date: today(),
        user_id: user ? user.id : null,
        user_name: user ? user.name : '',
        barcode: trimmed,
        entity_type: entityType || 'unknown',
        entity_id: entity ? entity.id : null,
        found: !!entity,
        screen: opts.screen,
        ts: Date.now()
      };
      if(adapter && adapter.saveSimple){
        adapter.saveSimple('scan_log', logRow).catch(e => console.warn('log scan fail', e));
      }
      if(store.scan_log) store.scan_log.unshift(logRow);
    }catch(e){ /* تجاهل */ }

    // ✅ أو ❌
    if(entity){
      // صوت نجاح
      beep(880, 80);
      // إضافة للسجل
      history.unshift({ code: trimmed, name: entity.name, ok: true });
      renderHistory();

      await Scanner.stop();
      opts.closeSheet();
      opts.onFound(entity, trimmed, entityType);
    } else {
      // صوت فشل
      beep(220, 200);
      history.unshift({ code: trimmed, name: '— غير موجود —', ok: false });
      renderHistory();

      if(opts.onNotFound){
        opts.onNotFound(trimmed);
      } else {
        toast('لم يُعثر على: ' + trimmed, 'err');
      }
    }
  }).then(() => {
    // إظهار زر الفلاش إن وُجد
    setTimeout(() => {
      const torchBtn = document.getElementById('scan-torch');
      if(Scanner.hasTorch && torchBtn){
        torchBtn.style.display = '';
      }
    }, 500);
  }).catch(err => {
    console.error('scanner start error:', err);
    const container = document.getElementById('scanner-container');
    if(container){
      container.innerHTML = `
        <div style="padding:30px;text-align:center;color:#ff6f61">
          <div style="font-size:40px;margin-bottom:8px">⚠️</div>
          <div style="font-weight:700;margin-bottom:6px">تعذر تشغيل الكاميرا</div>
          <div style="font-size:12px;opacity:0.8">${escHtml(err.message || '')}</div>
          <div style="font-size:12px;margin-top:8px">تأكد من:
            <br>• منح إذن الكاميرا
            <br>• الاتصال بـ HTTPS
            <br>• عدم استخدامها في تطبيق آخر
          </div>
        </div>
      `;
    }
    toast('تعذر تشغيل الكاميرا', 'err');
  });

  // ===== الأزرار =====
  setTimeout(() => {
    const torchBtn = document.getElementById('scan-torch');
    const manualBtn = document.getElementById('scan-manual');
    const cancelBtn = document.getElementById('scan-cancel');

    if(torchBtn) torchBtn.onclick = async () => {
      const on = await Scanner.toggleTorch();
      torchBtn.textContent = on ? '🔦 إطفاء' : '🔦 الفلاش';
    };

    if(manualBtn) manualBtn.onclick = () => {
      manualEntry();
    };

    if(cancelBtn) cancelBtn.onclick = async () => {
      await Scanner.stop();
      opts.closeSheet();
    };
  }, 100);

  // ===== إدخال يدوي =====
  async function manualEntry(){
    await Scanner.stop();
    const code = prompt('أدخل الباركود يدوياً:');
    if(!code) return;
    const trimmed = code.trim();
    if(!trimmed) return;

    // نفس منطق البحث
    let entity = null;
    let entityType = null;
    if(opts.mode === 'product' || opts.mode === 'auto'){
      const p = store.products.find(x => x.barcode === trimmed);
      if(p){ entity = p; entityType = 'product'; }
    }
    if(!entity && (opts.mode === 'customer' || opts.mode === 'auto')){
      const c = store.customers.find(x => x.barcode === trimmed);
      if(c){ entity = c; entityType = 'customer'; }
    }
    if(!entity && (opts.mode === 'distributor' || opts.mode === 'auto')){
      const d = store.distributors.find(x => x.barcode === trimmed);
      if(d){ entity = d; entityType = 'distributor'; }
    }

    // سجل
    try{
      const logRow = {
        id: uuid(), date: today(),
        user_id: user ? user.id : null,
        user_name: user ? user.name : '',
        barcode: trimmed,
        entity_type: entityType || 'unknown',
        entity_id: entity ? entity.id : null,
        found: !!entity,
        screen: opts.screen + '/manual',
        ts: Date.now()
      };
      if(adapter && adapter.saveSimple){
        adapter.saveSimple('scan_log', logRow).catch(e => console.warn(e));
      }
      if(store.scan_log) store.scan_log.unshift(logRow);
    }catch(e){}

    if(entity){
      opts.closeSheet();
      opts.onFound(entity, trimmed, entityType);
    } else {
      toast('لم يُعثر على: ' + trimmed, 'err');
      // أعد فتح الماسح
      setTimeout(() => window.openScanner(opts), 300);
    }
  }

  // ===== سجل العمليات =====
  function renderHistory(){
    const el = document.getElementById('scan-history');
    if(!el) return;
    if(!history.length){ el.style.display = 'none'; return; }
    el.style.display = '';
    el.innerHTML = '<b>آخر عمليات المسح:</b>' +
      history.slice(0, 5).map(h =>
        `<div style="padding:4px 0;border-bottom:1px dashed var(--line)">
          ${h.ok ? '✅' : '❌'} ${escHtml(h.code)} — ${escHtml(h.name)}
        </div>`
      ).join('');
  }

  // ===== صوت =====
  function beep(freq, duration){
    try{
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration / 1000);
      osc.start();
      osc.stop(ctx.currentTime + duration / 1000);
      setTimeout(() => ctx.close(), duration + 100);
    }catch(e){ /* تجاهل */ }
  }
};

// إغلاق الكاميرا عند إغلاق النافذة
const originalCloseSheet = window.closeSheet;
if(originalCloseSheet){
  // سنعتمد على closeSheet الأصلي، لكن نوقف الكاميرا عند أي إغلاق
  document.addEventListener('click', (e) => {
    if(e.target.closest('#sheetBg') || e.target.closest('#scan-cancel')){
      Scanner.stop().catch(() => {});
    }
  });
}

window.__barcodeScanner = Scanner;

})();
