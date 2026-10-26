// ชื่อแคชต้องตรงกับ APP_VERSION ใน logic.js (เปลี่ยนทั้งสองที่พร้อมกันทุกครั้งที่อัปเดต)
const V = 'mymoney-3.2.0', FILES = ['./', 'index.html', 'app.js', 'logic.js', 'manifest.json', 'icon-192.png', 'icon-512.png', 'icon-180.png'];
// cache:'reload' = ดึงไฟล์ใหม่จากเซิร์ฟเวอร์จริง ไม่ใช้ HTTP cache เก่า
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))));
// ไม่ skipWaiting เอง: รอให้ผู้ใช้กดอัปเดตในแอป (กันร่างที่กรอกค้างหาย)
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));
