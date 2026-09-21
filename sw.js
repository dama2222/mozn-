/* خدمة العمل دون اتصال — غيّر رقم الإصدار عند تحديث التطبيق */
const V='muzn-v2';
const SHELL=['./','index.html','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;
  const u=new URL(r.url);
  if(u.hostname.indexOf('fonts.g')===0){ // الخطوط: من الذاكرة ثم تحديث
    e.respondWith(caches.open(V).then(c=>c.match(r).then(hit=>{const f=fetch(r).then(res=>{c.put(r,res.clone());return res}).catch(()=>hit);return hit||f})));return;
  }
  if(u.origin!==location.origin)return;
  if(r.mode==='navigate'){ // الصفحة: الشبكة أولاً ثم الذاكرة
    e.respondWith(fetch(r).then(res=>{const cp=res.clone();caches.open(V).then(c=>c.put('index.html',cp));return res}).catch(()=>caches.match('index.html')));return;
  }
  e.respondWith(caches.match(r).then(hit=>hit||fetch(r).then(res=>{const cp=res.clone();caches.open(V).then(c=>c.put(r,cp));return res})));
});
