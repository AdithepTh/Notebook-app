import * as L from './logic.js';
const app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => { const d = new Date(); return `${d.getFullYear()}-${L.pad(d.getMonth() + 1)}-${L.pad(d.getDate())}`; };
const stars = n => n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '';
const row = (a, b, cls = '') => `<div class="r ${cls}"><span>${a}</span><span>${b}</span></div>`;
const sha = async p => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('mm1:' + p)))].map(b => b.toString(16).padStart(2, '0')).join('');
function toast(t) { const e = document.createElement('div'); e.className = 'toast'; e.textContent = t; document.body.append(e); setTimeout(() => e.remove(), 1800); }

// ---------- ฐานข้อมูลในเครื่อง (IndexedDB) ----------
const STORES = ['settings', 'items', 'places'];
let db;
const openDB = () => new Promise((ok, no) => { const r = indexedDB.open('mymoney', 4);
  r.onupgradeneeded = () => STORES.forEach(n => { if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n, { keyPath: 'id' }); });
  r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
const run = (n, mode, f) => new Promise((ok, no) => { const t = db.transaction(n, mode); const o = f(t.objectStore(n));
  t.oncomplete = () => ok(o && o.result); t.onerror = () => no(t.error); });
const all = n => run(n, 'readonly', s => s.getAll());
const put = (n, v) => run(n, 'readwrite', s => s.put(v));
const del = (n, id) => run(n, 'readwrite', s => s.delete(id));
const clear = n => run(n, 'readwrite', s => s.clear());

const S = { st: null, items: [], places: [], view: 'home', sb: innerWidth >= 900, locked: false, iform: null, pform: null,
  iq: '', iown: '', istat: '', isort: 'new', igroup: false, cmp: [], showCmp: false, prov: '', pq: '', ptype: '', pmin: 0, pdist: '', tq: '' };
async function load() {
  db = await openDB();
  const s0 = (await all('settings'))[0]; S.st = { ...L.DEFAULT_SETTINGS, ...(s0 || {}) }; if (!s0) await put('settings', S.st);
  S.items = await all('items'); S.places = await all('places'); S.locked = !!S.st.pinHash; navigator.storage?.persist?.();
}
const wOf = i => L.warranty(i, today(), S.st.warnDays);
const WCOL = { ok: 'ok', soon: 'warn', out: 'bad', none: 'mu', expired_product: 'bad' };

// ---------- ของใช้ ----------
function itemRow(i) { const w = wOf(i);
  return `<div class="tx"><input type="checkbox" class="ck" data-act="cmp" data-id="${i.id}" ${S.cmp.includes(i.id) ? 'checked' : ''}>
  <div data-act="edititem" data-id="${i.id}" style="flex:1"><b>${esc(i.name)}</b>${i.status && i.status !== 'ใช้งานอยู่' ? ` <span class="mu">[${esc(i.status)}]</span>` : ''}
  <div class="mu">${[i.owner, i.category, i.setName && '📦' + i.setName, i.location && '📍' + i.location, i.date ? L.dateTH(i.date) : 'ไม่ทราบวันที่ซื้อ'].filter(Boolean).map(esc).join(' · ')}</div>
  ${w.status !== 'none' ? `<div class="${WCOL[w.status]}" style="font-size:14px">${L.WSTATUS[w.status]}${w.end ? ` · ${w.start ? L.dateTH(w.start) + ' – ' : ''}${L.dateTH(w.end)}${w.left >= 0 ? ` (อีก ${w.left} วัน)` : ''}` : ''}</div>` : ''}</div>
  <div class="a" data-act="edititem" data-id="${i.id}">${L.baht(i.price)}</div></div>`; }
function itemList() { const q = S.iq.trim().toLowerCase();
  const k = x => { const l = wOf(x).left; return l == null ? 2e9 : l < 0 ? 1e9 - l : l; };
  const sorts = { new: (a, b) => (b.date || '').localeCompare(a.date || ''), price: (a, b) => b.price - a.price, end: (a, b) => k(a) - k(b), name: (a, b) => a.name.localeCompare(b.name, 'th') };
  return S.items.filter(i => (!S.iown || i.owner === S.iown) && (!S.istat || wOf(i).status === S.istat) &&
    (!q || [i.name, i.owner, i.category, i.store, i.serial, i.note, i.setName, i.location, i.status].join(' ').toLowerCase().includes(q))).sort(sorts[S.isort]); }
function itemListHTML() { const l = itemList(), head = `<div class="mu">${l.length} รายการ · มูลค่ารวม ${L.baht(l.reduce((s, i) => s + i.price, 0))} บาท</div>`;
  if (!l.length) return head + '<div class="mu">ไม่พบรายการ แตะ + เพื่อเพิ่ม</div>';
  if (!S.igroup) return head + l.map(itemRow).join('');
  return head + L.groupBySet(l).map(g => `<div class="r" style="margin-top:8px"><b>📦 ${esc(g.name || 'ไม่ได้จัดชุด')} <span class="mu">${g.items.length} ชิ้น · ${L.baht(g.total)}</span></b>${g.name ? `<button class="chip" data-act="renset" data-v="${esc(g.name)}">เปลี่ยนชื่อ</button>` : ''}</div>${g.items.map(itemRow).join('')}`).join(''); }
const opts = (arr, cur) => arr.map(([k, v]) => `<option value="${esc(k)}" ${String(cur) === String(k) ? 'selected' : ''}>${esc(v)}</option>`).join('');
const vItems = () => `<input id="iq" placeholder="ค้นหา ชื่อ/ชุด/หมวด/ร้าน/S-N/ที่เก็บ" value="${esc(S.iq)}">
  <div class="chips">${['', ...S.st.owners].map(o => `<button class="chip ${S.iown === o ? 'on' : ''}" data-act="iown" data-v="${esc(o)}">${esc(o) || 'ทั้งหมด'}</button>`).join('')}</div>
  <div class="two"><select data-f="istat">${opts([['', 'ประกันทุกสถานะ'], ...Object.entries(L.WSTATUS)], S.istat)}</select><select data-f="isort">${opts([['new', 'ใหม่สุด'], ['price', 'ราคาสูงสุด'], ['end', 'ประกันใกล้หมดก่อน'], ['name', 'ชื่อ ก-ฮ']], S.isort)}</select></div>
  <div class="two"><button class="btn alt" data-act="igroup">${S.igroup ? '☰ แสดงเป็นรายการ' : '📦 จัดกลุ่มตามชุด'}</button><button class="btn" id="cmpbtn" data-act="showcmp">⚖️ เปรียบเทียบ (${S.cmp.length})</button></div>
  <div class="card" id="ilist" style="margin-top:12px">${itemListHTML()}</div>`;
function cmpHTML() { const it = S.cmp.map(id => S.items.find(i => i.id === id)).filter(Boolean), t = today();
  const age = i => i.date ? L.daysBetween(i.date, t) / 365.25 : null, d = x => x ? L.dateTH(x) : '';
  const R = [['เจ้าของ', i => i.owner], ['หมวด', i => i.category], ['ชุด', i => i.setName], ['ที่เก็บ', i => i.location], ['ร้าน', i => i.store], ['รุ่น/S-N', i => i.serial], ['สถานะ', i => i.status],
    ['วันที่ซื้อ', i => d(i.date)], ['ราคา (บาท)', i => L.baht(i.price)], ['ประกัน (ปี)', i => i.warrantyYears || ''], ['เริ่มประกัน', i => d(wOf(i).start)], ['หมดประกัน', i => d(wOf(i).end)],
    ['สถานะประกัน', i => L.WSTATUS[wOf(i).status]], ['เหลือ (วัน)', i => wOf(i).left ?? ''], ['อายุใช้งาน (ปี)', i => age(i) == null ? '' : age(i).toFixed(1)], ['ราคา/ปีที่ใช้', i => age(i) > 0.05 ? L.baht(Math.round(i.price / age(i))) : '']];
  return `<div class="bg" data-act="closeform"></div><div class="sheet"><b>เปรียบเทียบ ${it.length} รายการ</b><div style="overflow:auto"><table><tr><th></th>${it.map(i => `<th>${esc(i.name)}</th>`).join('')}</tr>
  ${R.map(([n, f]) => `<tr><td class="mu">${n}</td>${it.map(i => { const v = f(i); return `<td>${v === '' || v == null ? '—' : esc(v)}</td>`; }).join('')}</tr>`).join('')}</table></div><button class="btn alt" data-act="clrcmp">ล้างที่เลือก</button></div>`; }
const blankItem = () => ({ name: '', price: '', owner: '', category: '', setName: '', location: '', status: 'ใช้งานอยู่', store: '', date: today(), wstart: '', years: '', expiry: '', serial: '', link: '', note: '' });
function iformHTML() { const f = S.iform, v = k => esc(f[k]), uniq = k => [...new Set(S.items.map(i => i[k]).filter(Boolean))];
  const sel = (id, arr, cur, blank) => `<select id="${id}"><option value="">${blank}</option>${arr.map(x => `<option ${x === cur ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
  return `<div class="bg" data-act="closeform"></div><div class="sheet"><b>${f.id ? 'แก้ไขของใช้' : 'เพิ่มของใช้'}</b>
  <input id="i-name" placeholder="ชื่อสิ่งของ เช่น จอคอมพิวเตอร์ 27 นิ้ว" value="${v('name')}"><input id="i-price" inputmode="decimal" placeholder="ราคา (บาท)" value="${v('price')}">
  <div class="two">${sel('i-owner', S.st.owners, f.owner, 'เจ้าของ')}${sel('i-cat', S.st.itemCats, f.category, 'หมวด')}</div>
  <input id="i-set" list="dl-set" placeholder="ชุด/กลุ่ม เช่น คอมพิวเตอร์ (ของชุดเดียวกันใช้ชื่อเดียวกัน)" value="${v('setName')}"><datalist id="dl-set">${uniq('setName').map(x => `<option value="${esc(x)}">`).join('')}</datalist>
  <div class="two"><input id="i-loc" list="dl-loc" placeholder="ที่เก็บ/ห้อง" value="${v('location')}"><datalist id="dl-loc">${uniq('location').map(x => `<option value="${esc(x)}">`).join('')}</datalist>${sel('i-status', L.ITEM_STATUS, f.status, 'สถานะ')}</div>
  <input id="i-store" placeholder="ซื้อจากที่ไหน" value="${v('store')}"><label class="mu">วันที่ซื้อ</label><input type="date" id="i-date" value="${v('date')}">
  <div class="two"><input id="i-years" inputmode="decimal" placeholder="ประกัน (ปี) เช่น 0.5 / 1 / 5" value="${v('years')}"><input id="i-sn" placeholder="รุ่น / S-N" value="${v('serial')}"></div>
  <label class="mu">วันเริ่มประกัน (ว่าง = วันที่ซื้อ)</label><input type="date" id="i-wstart" value="${v('wstart')}"><div class="prev" id="iprev"></div>
  <label class="mu">วันหมดอายุสินค้า (ถ้ามี)</label><input type="date" id="i-exp" value="${v('expiry')}"><input id="i-link" placeholder="ลิงก์ใบเสร็จ/ใบประกัน" value="${v('link')}"><textarea id="i-note" rows="2" placeholder="หมายเหตุ">${v('note')}</textarea>
  <button class="btn" data-act="saveitem">บันทึก</button>${f.id ? '<button class="btn alt" data-act="dupitem">คัดลอกเป็นรายการใหม่</button><button class="btn del" data-act="delitem">ลบรายการนี้</button>' : ''}</div>`; }
function syncI() { const g = i => document.getElementById(i)?.value; if (!document.getElementById('i-name') || !S.iform) return;
  Object.assign(S.iform, { name: g('i-name'), price: g('i-price'), owner: g('i-owner'), category: g('i-cat'), setName: g('i-set'), location: g('i-loc'), status: g('i-status'), store: g('i-store'), date: g('i-date'), years: g('i-years'), serial: g('i-sn'), wstart: g('i-wstart'), expiry: g('i-exp'), link: g('i-link'), note: g('i-note') }); }
const yrs = s => parseFloat(String(s).replace(',', '.')) || 0;
function updateIPrev() { syncI(); const f = S.iform, p = document.getElementById('iprev'); if (!p) return;
  const w = L.warranty({ date: f.date, warrantyStart: f.wstart, warrantyYears: yrs(f.years), expiry: f.expiry }, today(), S.st.warnDays);
  p.textContent = w.end ? `ประกัน ${L.dateTH(w.start)} – ${L.dateTH(w.end)} (${w.left >= 0 ? 'เหลือ ' + w.left + ' วัน' : 'หมดแล้ว'})` : 'ยังไม่มีประกัน (ใส่จำนวนปีและวันที่ซื้อ)'; }

// ---------- ท่องเที่ยว ----------
const placeRow = (p, showProv) => `<div class="tx" data-act="editp" data-id="${p.id}"><div style="flex:1"><b>${L.PLACE_ICON[p.type]} ${esc(p.name)}</b> <span class="warn">${stars(p.rating)}</span>
  <div class="mu">${[showProv && p.province, p.district, p.date && L.dateTH(p.date), p.cost != null && L.baht(p.cost) + ' บาท', ...(p.tags || []).map(t => '#' + t)].filter(Boolean).map(esc).join(' · ')}</div>
  ${p.note ? `<div class="mu">${esc(p.note.slice(0, 100))}</div>` : ''}${p.type === 'stay' ? nearHTML(p) : ''}</div></div>`;
const nearHTML = s => { const f = L.nearbyFood(S.places, s).filter(x => S.view !== 'prov' || (x.rating || 0) >= S.pmin).slice(0, 3); return f.length ? `<div class="ok" style="font-size:14px">🍜 ใกล้ที่พักนี้: ${f.map(x => `${esc(x.name)}${x.rating ? ' ' + x.rating + '★' : ''}`).join(', ')}</div>` : ''; };
const provGridHTML = vis => Object.entries(L.PROVINCES).map(([r, ps]) => `<h2>ภาค${r} · ${ps.filter(p => vis.has(p)).length}/${ps.length}</h2><div class="chips wrap">${ps.map(p => { const c = S.places.filter(x => x.province === p).length;
  return `<button class="chip ${c ? 'on' : ''}" data-act="prov" data-v="${p}">${p}${c ? ` (${c})` : ''}</button>`; }).join('')}</div>`).join('');
const placeResultsHTML = () => { const l = L.filterPlaces(S.places, { q: S.tq }); return `<div class="card">${l.map(p => placeRow(p, true)).join('') || '<div class="mu">ไม่พบ</div>'}</div>`; };
function vTravel() { const vis = L.visitedProvinces(S.places);
  return `<input id="tq" placeholder="ค้นหาทั้งหมด: จังหวัด/อำเภอ/ชื่อที่/แท็ก/รีวิว" value="${esc(S.tq)}">
  <div class="card"><b>ไปแล้ว ${vis.size}/77 จังหวัด</b><div class="bar" style="width:${vis.size / 77 * 100}%;background:var(--mint)"></div></div>
  <div id="tres">${S.tq.trim() ? placeResultsHTML() : provGridHTML(vis)}</div>`; }
function provListHTML() { const l = L.filterPlaces(S.places, { province: S.prov, type: S.ptype, minRating: S.pmin, district: S.pdist, q: S.pq });
  if (!l.length) return '<div class="mu">ไม่พบบันทึก แตะ + เพื่อเพิ่ม</div>';
  return L.PLACE_TYPES.map(([k, lb]) => { const g = l.filter(p => p.type === k); return g.length ? `<div class="mu" style="margin-top:8px">${lb} · ${g.length}</div>${g.map(p => placeRow(p, false)).join('')}` : ''; }).join(''); }
function vProv() { const p = S.prov, mine = S.places.filter(x => x.province === p), dists = [...new Set(mine.map(x => x.district).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));
  return `<div class="nav2"><button data-act="view" data-v="travel">‹</button><b>${p}</b><span style="width:44px"></span></div><div class="mu">ภาค${L.regionOf(p)} · ${mine.length} บันทึก</div>
  <input id="pq" placeholder="ค้นหาในจังหวัดนี้" value="${esc(S.pq)}">
  <div class="chips">${[['', 'ทั้งหมด'], ...L.PLACE_TYPES].map(([k, l]) => `<button class="chip ${S.ptype === k ? 'on' : ''}" data-act="ptypef" data-v="${k}">${l}</button>`).join('')}</div>
  <div class="two"><select data-f="pmin">${opts([[0, 'ทุกคะแนน'], [3, '★3 ขึ้นไป'], [4, '★4 ขึ้นไป'], [5, '★5 เท่านั้น']], S.pmin)}</select><select data-f="pdist">${opts([['', 'ทุกอำเภอ/ย่าน'], ...dists.map(x => [x, x])], S.pdist)}</select></div>
  <div class="card" id="plist">${provListHTML()}</div>`; }
const blankPlace = () => ({ type: 'stay', province: S.prov || '', district: '', name: '', date: today(), rating: '0', cost: '', near: '', tags: '', link: '', note: '' });
function pformHTML() { const f = S.pform, v = k => esc(f[k]), stays = S.places.filter(p => p.type === 'stay' && p.province === f.province && p.id !== f.id);
  return `<div class="bg" data-act="closeform"></div><div class="sheet"><b>${f.id ? 'แก้ไข' : 'เพิ่ม'}บันทึกท่องเที่ยว</b>
  <div class="seg3">${L.PLACE_TYPES.map(([k, l]) => `<button class="${f.type === k ? 'on' : ''}" data-act="ptype" data-v="${k}">${l}</button>`).join('')}</div>
  <select id="p-prov"><option value="">เลือกจังหวัด</option>${Object.entries(L.PROVINCES).map(([r, ps]) => `<optgroup label="ภาค${r}">${ps.map(p => `<option ${p === f.province ? 'selected' : ''}>${p}</option>`).join('')}</optgroup>`).join('')}</select>
  <input id="p-dist" placeholder="อำเภอ/ย่าน เช่น บางแสน" value="${v('district')}"><input id="p-name" placeholder="ชื่อที่พัก / ร้าน / สถานที่ / ทริป" value="${v('name')}">
  <div class="two"><input type="date" id="p-date" value="${v('date')}"><select id="p-rate">${[0, 1, 2, 3, 4, 5].map(n => `<option value="${n}" ${+f.rating === n ? 'selected' : ''}>${n ? stars(n) : 'ไม่ให้คะแนน'}</option>`).join('')}</select></div>
  <input id="p-cost" inputmode="decimal" placeholder="ค่าใช้จ่าย (บาท ไม่บังคับ)" value="${v('cost')}">
  ${f.type !== 'stay' && stays.length ? `<select id="p-near"><option value="">ใกล้ที่พักไหน (ไม่บังคับ)</option>${stays.map(s => `<option value="${s.id}" ${s.id === f.near ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>` : ''}
  <input id="p-tags" placeholder="แท็ก เช่น ทะเล, ครอบครัว (คั่นด้วย ,)" value="${v('tags')}"><input id="p-link" placeholder="ลิงก์แผนที่/เว็บ" value="${v('link')}">
  <textarea id="p-note" rows="3" placeholder="รีวิว/รายละเอียด เช่น ห้องสะอาด อาหารอร่อย ที่จอดรถ">${v('note')}</textarea>
  <button class="btn" data-act="savep">บันทึก</button>${f.id ? '<button class="btn del" data-act="delp">ลบบันทึกนี้</button>' : ''}</div>`; }
function syncP() { const g = i => document.getElementById(i)?.value; if (!document.getElementById('p-name') || !S.pform) return;
  Object.assign(S.pform, { province: g('p-prov'), district: g('p-dist'), name: g('p-name'), date: g('p-date'), rating: g('p-rate'), cost: g('p-cost'), near: g('p-near') ?? S.pform.near, tags: g('p-tags'), link: g('p-link'), note: g('p-note') }); }

// ---------- หน้าแรก / ตั้งค่า / โครงหน้า ----------
function vHome() { const tot = S.items.reduce((s, i) => s + i.price, 0), vis = L.visitedProvinces(S.places), own = {};
  S.items.forEach(i => { const o = i.owner || 'ไม่ระบุ'; own[o] = (own[o] || 0) + i.price; }); const mx = Math.max(1, ...Object.values(own));
  const ws = S.items.map(i => [i, wOf(i)]), soon = ws.filter(([, w]) => w.status === 'soon').sort((a, b) => a[1].left - b[1].left), out = ws.filter(([, w]) => w.status === 'out').length;
  const old = S.items.length + S.places.length && (!S.st.lastBackupAt || Date.now() - new Date(S.st.lastBackupAt) > 14 * 864e5);
  const recent = [...S.places].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);
  return `${old ? '<div class="card warn">ยังไม่ได้สำรองข้อมูลเกิน 2 สัปดาห์ — ไปที่ ตั้งค่า → สำรองข้อมูล</div>' : ''}
  <div class="two"><button class="btn" data-act="additem">＋ ของใช้</button><button class="btn alt" data-act="addplace">＋ ท่องเที่ยว</button></div><div style="height:12px"></div>
  ${soon.length ? `<div class="card"><b class="warn">ต้องทำเร็วๆ นี้ · ประกันใกล้หมด</b>${soon.slice(0, 5).map(([i, w]) => `<div class="tx" data-act="edititem" data-id="${i.id}"><span>${esc(i.name)}</span><span class="warn">อีก ${w.left} วัน</span></div>`).join('')}</div>` : ''}
  <div class="card"><b>🎒 ของใช้</b>${row('จำนวน', S.items.length + ' ชิ้น')}${row('มูลค่ารวม', L.baht(tot) + ' บาท')}${row('หมดประกันแล้ว', out + ' ชิ้น', out ? 'bad' : '')}
  ${Object.entries(own).sort((a, b) => b[1] - a[1]).map(([o, v]) => `<div class="r sub"><span>${esc(o)}</span><span>${L.baht(v)}</span></div><div class="bar" style="width:${v / mx * 100}%;background:var(--lav)"></div>`).join('')}</div>
  <div class="card"><b>🧳 ท่องเที่ยว</b>${row('ไปแล้ว', vis.size + '/77 จังหวัด')}<div class="bar" style="width:${vis.size / 77 * 100}%;background:var(--mint)"></div>
  ${recent.map(p => placeRow(p, true)).join('')}</div>`; }
const si = (k, label) => `<label class="mu">${label}</label><input data-set="${k}" type="number" value="${esc(S.st[k])}">`;
const vSettings = () => `<div class="card"><b>ค่าตั้งต้น</b>${si('warnDays', 'เตือนก่อนหมดประกัน (วัน)')}<label class="mu">เจ้าของ/ขอบเขต (คั่นด้วย ,)</label><input data-set="owners" value="${esc(S.st.owners.join(', '))}">
  <label class="mu">หมวดของใช้ (คั่นด้วย ,)</label><input data-set="itemCats" value="${esc(S.st.itemCats.join(', '))}"></div>
  <div class="card"><b>ล็อกแอป (PIN)</b><button class="btn alt" data-act="setpin">${S.st.pinHash ? 'เปลี่ยน PIN' : 'ตั้ง PIN'}</button>${S.st.pinHash ? '<button class="btn del" data-act="rmpin">ปิดการล็อก</button>' : ''}</div>
  <div class="card"><b>สำรองข้อมูล</b><div class="mu">เก็บไฟล์ไว้ใน iCloud Drive/Files เท่านั้น ห้ามอัปโหลดขึ้น GitHub</div>
  <button class="btn" data-act="exportJson">สำรองทั้งหมดเป็น JSON</button><button class="btn alt" data-act="exportCsvI">ส่งออกของใช้ (CSV/Excel)</button><button class="btn alt" data-act="exportCsvP">ส่งออกท่องเที่ยว (CSV/Excel)</button>
  <button class="btn alt" data-act="import">นำเข้าจากไฟล์ JSON</button><input type="file" id="imp" accept=".json,application/json" hidden></div>
  <div class="card"><b>ปฏิทิน (iPhone)</b><div class="mu">ส่งออกวันหมดประกัน/หมดอายุเป็นไฟล์ .ics แล้วเปิดด้วยแอปปฏิทิน</div><button class="btn alt" data-act="exportIcs">ส่งออกวันครบกำหนด (.ics)</button></div>
  <div class="card"><button class="btn del" data-act="wipe">ลบข้อมูลทั้งหมด</button></div><div class="mu" style="text-align:center">เวอร์ชัน ${L.APP_VERSION}</div>`;
const MENU = [['home', '🏠', 'ภาพรวม'], ['items', '🎒', 'ของใช้'], ['sets', '📦', 'ของใช้แบบจัดชุด'], ['travel', '🧳', 'ท่องเที่ยว 77 จังหวัด'], ['settings', '⚙️', 'ตั้งค่า / สำรองข้อมูล']];
function render() {
  if (S.locked) { app.innerHTML = `<div class="lock"><div style="font-size:48px">🔒</div><b>ใส่ PIN</b><input id="pin" type="password" inputmode="numeric" maxlength="6" autofocus></div>`; return; }
  const v = { home: vHome, items: vItems, travel: vTravel, prov: vProv, settings: vSettings }[S.view](), act = S.view === 'prov' ? 'travel' : S.view === 'items' && S.igroup ? 'sets' : S.view;
  app.innerHTML = `<div class="shell ${S.sb ? 'sb-open' : ''}"><aside><div class="brand">📒 คลังของฉัน</div>${MENU.map(([k, i, l]) => `<button class="mi ${act === k ? 'on' : ''}" data-act="view" data-v="${k}">${i} ${l}</button>`).join('')}</aside><div class="bgm" data-act="sb"></div>
  <div class="content"><header><button class="burger" data-act="sb">☰</button><b>${MENU.find(m => m[0] === act)[2]}</b></header><main>${v}</main></div></div>
  ${['items', 'travel', 'prov'].includes(S.view) ? '<button class="fab" data-act="add">＋</button>' : ''}${S.iform ? iformHTML() : ''}${S.pform ? pformHTML() : ''}${S.showCmp ? cmpHTML() : ''}`;
  if (S.iform) updateIPrev(); }

// ---------- การกระทำ ----------
const num = s => { const v = L.toSatang(s || ''); return isNaN(v) ? null : v; };
const A = {
  sb: () => { S.sb = !S.sb; render(); },
  view: d => { S.view = d.v === 'sets' ? 'items' : d.v; if (d.v === 'sets') S.igroup = true; else if (d.v === 'items') S.igroup = false; if (innerWidth < 900) S.sb = false; render(); window.scrollTo?.(0, 0); },
  iown: d => { S.iown = d.v; render(); }, igroup: () => { S.igroup = !S.igroup; render(); },
  cmp: (d, el) => { const i = S.cmp.indexOf(d.id);
    if (el.checked && i < 0) { if (S.cmp.length >= 4) { el.checked = false; return toast('เปรียบเทียบได้สูงสุด 4 ชิ้น'); } S.cmp.push(d.id); } else if (!el.checked && i >= 0) S.cmp.splice(i, 1);
    const b = document.getElementById('cmpbtn'); if (b) b.textContent = `⚖️ เปรียบเทียบ (${S.cmp.length})`; },
  showcmp: () => S.cmp.length < 2 ? toast('ติ๊กช่องหน้ารายการอย่างน้อย 2 ชิ้น') : (S.showCmp = true, render()),
  clrcmp: () => { S.cmp = []; S.showCmp = false; render(); },
  add: () => { if (S.view === 'items') S.iform = blankItem(); else S.pform = blankPlace(); render(); },
  additem: () => { S.iform = blankItem(); render(); }, addplace: () => { S.pform = blankPlace(); render(); },
  closeform: () => { S.iform = null; S.pform = null; S.showCmp = false; render(); },
  edititem: d => { const i = S.items.find(x => x.id === d.id); S.iform = { id: i.id, name: i.name, price: String(i.price / 100), owner: i.owner || '', category: i.category || '', setName: i.setName || '', location: i.location || '', status: i.status || 'ใช้งานอยู่', store: i.store || '', date: i.date || '', wstart: i.warrantyStart || '', years: i.warrantyYears ? String(i.warrantyYears) : '', expiry: i.expiry || '', serial: i.serial || '', link: i.link || '', note: i.note || '' }; render(); },
  async saveitem() { syncI(); const f = S.iform, p = L.toSatang(f.price || '0');
    if (!f.name.trim() || !(p >= 0)) return toast('กรอกชื่อและราคาให้ถูกต้อง');
    await put('items', { id: f.id || crypto.randomUUID(), name: f.name.trim(), owner: f.owner, category: f.category, setName: f.setName.trim(), location: f.location.trim(), status: f.status, store: f.store.trim(), date: f.date, price: p, warrantyStart: f.wstart, warrantyYears: yrs(f.years), expiry: f.expiry, serial: f.serial.trim(), link: f.link.trim(), note: f.note });
    S.items = await all('items'); S.iform = null; render(); toast('บันทึกแล้ว'); },
  dupitem: () => { syncI(); const f = { ...S.iform }; delete f.id; f.serial = ''; S.iform = f; render(); toast('คัดลอกแล้ว แก้ไขแล้วกดบันทึก'); },
  async delitem() { if (!confirm('ลบของใช้ชิ้นนี้?')) return; await del('items', S.iform.id); S.cmp = S.cmp.filter(x => x !== S.iform.id); S.items = await all('items'); S.iform = null; render(); },
  async renset(d) { const n = prompt('ชื่อชุดใหม่', d.v); if (n == null || !n.trim()) return; for (const i of S.items.filter(x => x.setName === d.v)) await put('items', { ...i, setName: n.trim() }); S.items = await all('items'); render(); },
  prov: d => { S.prov = d.v; S.view = 'prov'; S.pq = ''; S.ptype = ''; S.pmin = 0; S.pdist = ''; render(); window.scrollTo?.(0, 0); },
  ptypef: d => { S.ptype = d.v; render(); },
  ptype: d => { syncP(); S.pform.type = d.v; render(); },
  editp: d => { const p = S.places.find(x => x.id === d.id); S.pform = { id: p.id, type: p.type, province: p.province, district: p.district || '', name: p.name, date: p.date || '', rating: String(p.rating || 0), cost: p.cost == null ? '' : String(p.cost / 100), near: p.nearId || '', tags: (p.tags || []).join(', '), link: p.link || '', note: p.note || '' }; render(); },
  async savep() { syncP(); const f = S.pform; if (!f.province || !f.name.trim()) return toast('เลือกจังหวัดและใส่ชื่อ');
    await put('places', { id: f.id || crypto.randomUUID(), type: f.type, province: f.province, district: f.district.trim(), name: f.name.trim(), date: f.date, rating: +f.rating || 0, cost: num(f.cost), nearId: f.type === 'stay' ? '' : f.near || '', tags: f.tags.split(',').map(s => s.trim()).filter(Boolean), link: f.link.trim(), note: f.note });
    S.places = await all('places'); S.prov = f.province; S.view = 'prov'; S.pform = null; render(); toast('บันทึกแล้ว'); },
  async delp() { if (!confirm('ลบบันทึกนี้?')) return; await del('places', S.pform.id); S.places = await all('places'); S.pform = null; render(); },
  async setpin() { const p = prompt('ตั้ง PIN ตัวเลข 4–6 หลัก'); if (!p) return; if (!/^\d{4,6}$/.test(p)) return toast('PIN ต้องเป็นตัวเลข 4–6 หลัก');
    if (prompt('ใส่ PIN อีกครั้งเพื่อยืนยัน') !== p) return toast('PIN ไม่ตรงกัน'); S.st.pinHash = await sha(p); await put('settings', S.st); render(); toast('ตั้ง PIN แล้ว'); },
  async rmpin() { if (!confirm('ปิดการล็อกแอป?')) return; S.st.pinHash = null; await put('settings', S.st); render(); },
  async exportJson() { if (await saveFile(`mylibrary-${today()}.json`, 'application/json', JSON.stringify(backupData()))) { S.st.lastBackupAt = new Date().toISOString(); await put('settings', S.st); toast('สำรองแล้ว'); } },
  async exportCsvI() { await saveFile(`items-${today()}.csv`, 'text/csv', csv([['ชื่อ', 'เจ้าของ', 'หมวด', 'ชุด', 'ที่เก็บ', 'สถานะ', 'ร้าน', 'วันที่ซื้อ', 'ราคา', 'ประกัน(ปี)', 'เริ่มประกัน', 'หมดประกัน', 'รุ่น/S-N', 'หมายเหตุ'],
    ...S.items.map(i => { const w = wOf(i); return [i.name, i.owner, i.category, i.setName, i.location, i.status, i.store, i.date, i.price / 100, i.warrantyYears || '', w.start, w.end, i.serial, i.note]; })])); },
  async exportCsvP() { await saveFile(`travel-${today()}.csv`, 'text/csv', csv([['จังหวัด', 'อำเภอ/ย่าน', 'ประเภท', 'ชื่อ', 'วันที่', 'คะแนน', 'ค่าใช้จ่าย', 'ใกล้ที่พัก', 'แท็ก', 'ลิงก์', 'หมายเหตุ'],
    ...S.places.map(p => [p.province, p.district, p.type, p.name, p.date, p.rating || '', p.cost == null ? '' : p.cost / 100, S.places.find(x => x.id === p.nearId)?.name || '', (p.tags || []).join(' '), p.link, p.note])])); },
  async exportIcs() { const t = today(), ev = [];
    for (const i of S.items) { const w = wOf(i);
      if (w.end && w.end >= t) ev.push({ uid: 'w-' + i.id, date: w.end, title: `หมดประกัน: ${i.name}`, remindDays: S.st.warnDays, note: [i.owner, i.store].filter(Boolean).join(' · ') });
      if (i.expiry && i.expiry >= t) ev.push({ uid: 'x-' + i.id, date: i.expiry, title: `สินค้าหมดอายุ: ${i.name}`, remindDays: 7 }); }
    if (!ev.length) return toast('ยังไม่มีวันครบกำหนดข้างหน้า'); await saveFile('mylibrary-due.ics', 'text/calendar', L.buildICS(ev)); },
  import: () => document.getElementById('imp').click(),
  async wipe() { if (!confirm('ลบข้อมูลทั้งหมดในเครื่อง? (สำรองไว้แล้วใช่ไหม)') || !confirm('ยืนยันอีกครั้ง: ลบทั้งหมดและกู้คืนไม่ได้')) return;
    for (const n of ['items', 'places']) await clear(n); S.items = []; S.places = []; S.cmp = []; render(); },
  doupdate: () => { if ((S.iform || S.pform) && !confirm('มีรายการที่กรอกค้างอยู่ จะหายถ้าอัปเดตตอนนี้ อัปเดตเลยไหม?')) return; updating = true; waitingSW.postMessage('SKIP_WAITING'); },
};
const csv = rows => '\ufeff' + rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
const backupData = () => ({ app: 'mymoney', version: 3, exportedAt: new Date().toISOString(), settings: { ...S.st, pinHash: null }, items: S.items, places: S.places });
async function importBackup(file) {
  let d; try { d = JSON.parse(await file.text()); } catch { return toast('ไฟล์ไม่ใช่ JSON'); }
  const err = L.validateBackup(d); if (err) return toast(err);       // ตรวจก่อนแตะข้อมูลเดิม
  if (!confirm(`นำเข้า ${d.items.length} ของใช้, ${(d.places || []).length} บันทึกท่องเที่ยว? ข้อมูลเดิมในเครื่องจะถูกแทนที่`)) return;
  const snap = {}; for (const s of STORES) snap[s] = await all(s);   // สแนปชอตไว้กู้คืนถ้าพัง
  if (S.items.length + S.places.length && !(await saveFile(`mylibrary-ก่อนนำเข้า-${today()}.json`, 'application/json', JSON.stringify(backupData()))) && !confirm('ยังไม่ได้บันทึกไฟล์สำรองของข้อมูลเดิม นำเข้าต่อเลยไหม?')) return;
  try { const pin = S.st.pinHash; for (const n of STORES) await clear(n);
    await put('settings', { ...L.DEFAULT_SETTINGS, ...d.settings, pinHash: pin });
    for (const [n, a] of [['items', d.items], ['places', d.places || []]]) for (const x of a) await put(n, x);
    await load(); S.locked = false; render(); toast('นำเข้าแล้ว');
  } catch { for (const s of STORES) { await clear(s); for (const x of snap[s]) await put(s, x); } await load(); S.locked = false; render(); toast('นำเข้าไม่สำเร็จ กู้ข้อมูลเดิมคืนแล้ว'); }
}
async function saveFile(name, type, text) { const file = new File([text], name, { type });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file] }); return true; } catch (e) { if (e.name === 'AbortError') return false; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click(); return true; }

document.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) A[b.dataset.act]?.(b.dataset, b); });
document.addEventListener('input', async e => { const t = e.target, id = t.id;
  if (id === 'iq') { S.iq = t.value; document.getElementById('ilist').innerHTML = itemListHTML(); }
  else if (id === 'tq') { S.tq = t.value; document.getElementById('tres').innerHTML = S.tq.trim() ? placeResultsHTML() : provGridHTML(L.visitedProvinces(S.places)); }
  else if (id === 'pq') { S.pq = t.value; document.getElementById('plist').innerHTML = provListHTML(); }
  else if (S.iform && t.closest('.sheet')) updateIPrev();
  else if (id === 'pin' && t.value.length >= 4) { if (await sha(t.value) === S.st.pinHash) { S.locked = false; render(); } else if (t.value.length === 6) t.value = ''; }
});
document.addEventListener('change', async e => { const t = e.target, f = t.dataset.f, k = t.dataset.set;
  if (f) { S[f] = f === 'pmin' ? +t.value : t.value; return render(); }
  if (k) { let v = t.value; if (k === 'warnDays') v = Math.max(0, +v || 0); else v = v.split(',').map(s => s.trim()).filter(Boolean);
    S.st[k] = v; await put('settings', S.st); toast('บันทึกการตั้งค่าแล้ว'); }
  if (t.id === 'p-prov' && S.pform) { syncP(); render(); }
  if (t.id === 'imp' && t.files[0]) { await importBackup(t.files[0]); t.value = ''; }
});
document.addEventListener('visibilitychange', () => { syncI(); syncP(); // เก็บร่างที่พิมพ์ค้างไว้ก่อนเสมอ แล้วค่อยล็อก (ร่างไม่หาย)
  if (document.hidden && S.st?.pinHash) S.locked = true; else render(); });

let updating = false, waitingSW = null;
function showUpdate(w) { waitingSW = w; if (document.querySelector('.upd')) return; const b = document.createElement('div'); b.className = 'upd';
  b.innerHTML = '<span>มีเวอร์ชันใหม่</span><button data-act="doupdate">อัปเดต</button>'; document.body.append(b); } // อยู่นอก render() ร่างที่พิมพ์ค้างจึงไม่ถูกรีเซ็ต
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (updating) location.reload(); });
  navigator.serviceWorker.register('sw.js').then(reg => {
    const watch = w => w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(w); });
    if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => watch(reg.installing));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update(); });
  });
}
load().then(render);
