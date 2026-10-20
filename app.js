import * as L from './logic.js';
const app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => { const d = new Date(); return `${d.getFullYear()}-${L.pad(d.getMonth() + 1)}-${L.pad(d.getDate())}`; };
const nowT = () => { const d = new Date(); return `${L.pad(d.getHours())}:${L.pad(d.getMinutes())}`; };
const TL = Object.fromEntries(L.TYPES);

// ---------- ฐานข้อมูลในเครื่อง (IndexedDB) ----------
const STORES = ['settings', 'transactions', 'categories', 'presets', 'items', 'utilities'];
let db;
const openDB = () => new Promise((ok, no) => { const r = indexedDB.open('mymoney', 3);
  r.onupgradeneeded = () => STORES.forEach(n => { if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n, { keyPath: 'id' }); });
  r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
const run = (n, mode, f) => new Promise((ok, no) => { const t = db.transaction(n, mode); const o = f(t.objectStore(n));
  t.oncomplete = () => ok(o && o.result); t.onerror = () => no(t.error); });
const all = n => run(n, 'readonly', s => s.getAll());
const put = (n, v) => run(n, 'readwrite', s => s.put(v));
const del = (n, id) => run(n, 'readwrite', s => s.delete(id));
const clear = n => run(n, 'readwrite', s => s.clear());

const S = { st: null, cats: [], presets: [], txs: [], items: [], utils: [], um: '', uy1: 0, uy2: 0, uform: null, iq: '', iown: '', iform: null, tab: 'home', ym: today().slice(0, 7), q: '', form: null, locked: false };
const catName = id => S.cats.find(c => c.id === id)?.name || 'ไม่ระบุ';
const sha = async p => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('mm1:' + p)))].map(b => b.toString(16).padStart(2, '0')).join('');
function toast(t) { const e = document.createElement('div'); e.className = 'toast'; e.textContent = t; document.body.append(e); setTimeout(() => e.remove(), 1800); }

async function load() {
  db = await openDB();
  S.st = (await all('settings'))[0];
  if (!S.st) {
    S.st = { ...L.DEFAULT_SETTINGS }; await put('settings', S.st);
    const ex = ['อาหาร', 'เดินทาง', 'ของใช้', 'ค่าสาธารณูปโภค', 'สุขภาพ', 'ท่องเที่ยว', 'อื่นๆ'], inc = ['เงินเดือน', 'โบนัส', 'รายรับอื่นๆ'];
    for (const [i, n] of [...ex.map(n => [n, 'expense']), ...inc.map(n => [n, 'income'])].entries())
      await put('categories', { id: crypto.randomUUID(), name: n[0], kind: n[1], sortOrder: i });
  }
  S.st = { ...L.DEFAULT_SETTINGS, ...S.st };
  S.cats = (await all('categories')).sort((a, b) => a.sortOrder - b.sortOrder);
  S.presets = await all('presets'); S.txs = await all('transactions'); S.items = await all('items'); S.utils = await all('utilities');
  S.locked = !!S.st.pinHash;
  navigator.storage?.persist?.();
}
const saveSettings = () => put('settings', S.st);
async function recompute() { // เปลี่ยนการตั้งค่ารอบบัตร → คำนวณเดือนของทุกรายการใหม่
  for (const t of S.txs) { t.billMonth = L.billMonth(t.date, t.time, t.type, S.st); await put('transactions', t); }
}

// ---------- หน้าจอ ----------
const row = (a, b, cls = '') => `<div class="r ${cls}"><span>${a}</span><span>${b}</span></div>`;
function sumCard(ym) {
  const r = L.summarize(S.txs, ym, S.st);
  return `<div class="card"><div class="r"><b>${L.ymLabel(ym)}</b><span class="badge ${r.ok ? 'ok' : 'bad'}">${r.ok ? 'พอ' : 'ไม่พอ'}</span></div>
  ${row('รายการบัตร', L.baht(r.card), 'sub')}${row('หัก เครดิตคืน', '−' + L.baht(r.credit), 'sub')}
  ${row('ยอดบัตรสุทธิ', L.baht(r.netCard))}
  ${r.excessCredit ? `<div class="mu">เครดิตเกินยอดบัตร ${L.baht(r.excessCredit)} บาท (ไม่นำมารวม)</div>` : ''}
  ${row('ภาระผ่อน/ประจำ <span class="mu">(เฟส 3)</span>', L.baht(r.fixed), 'sub')}${row('โอน/เงินสด', L.baht(r.cash), 'sub')}
  ${row('รวมรายจ่าย', L.baht(r.expense), 'big')}
  ${row('รายรับ' + (r.autoSalary ? ' <span class="mu">(รวมเงินเดือนอัตโนมัติ)</span>' : ''), L.baht(r.incomeTotal))}
  ${row('คงเหลือ', `<span class="${r.ok ? 'ok' : 'bad'}">${L.baht(r.balance)}</span>`, 'big')}</div>`;
}
function txRow(t) {
  const isCard = t.type === 'card' || t.type === 'card_credit';
  const col = t.type === 'income' ? 'ok' : t.type === 'card_credit' ? 'lav' : '';
  return `<div class="tx" data-act="edit" data-id="${t.id}"><div><b>${esc(t.item) || TL[t.type]}</b><div class="mu">${L.dateTH(t.date)} ${t.time || ''} · ${esc(catName(t.categoryId))} · ${TL[t.type]}${isCard ? ` · รอบ ${L.TH_S[+t.billMonth.slice(5) - 1]}` : ''}</div></div>
  <div class="a ${col}">${t.type === 'card_credit' ? '−' : ''}${L.baht(t.amount)}</div></div>`;
}
const sorted = () => [...S.txs].sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
function soonCard() { const l = S.items.map(i => [i, wOf(i)]).filter(([, w]) => w.status === 'soon').sort((a, b) => a[1].left - b[1].left).slice(0, 5);
  return l.length ? `<div class="card"><b class="warn">ต้องทำเร็วๆ นี้</b>${l.map(([i, w]) => `<div class="tx" data-act="edititem" data-id="${i.id}"><span>ประกัน ${esc(i.name)}</span><span class="warn">อีก ${w.left} วัน</span></div>`).join('')}</div>` : ''; }
function vHome() {
  const old = !S.st.lastBackupAt || Date.now() - new Date(S.st.lastBackupAt) > 14 * 864e5;
  return `<h1>สมุดเงิน</h1>${S.txs.length && old ? `<div class="card" style="color:var(--peach)">ยังไม่ได้สำรองข้อมูลเกิน 2 สัปดาห์ — ไปที่ ตั้งค่า → สำรองข้อมูล</div>` : ''}
  ${soonCard()}<button class="btn alt" data-act="tab" data-v="util" style="margin:0 0 12px">💧⚡ ค่าน้ำ-ค่าไฟ</button>${sumCard(L.billMonth(today(), '', 'income', S.st))}<h2>รายการล่าสุด</h2><div class="card">${sorted().slice(0, 5).map(txRow).join('') || '<div class="mu">ยังไม่มีรายการ แตะ + เพื่อเพิ่ม</div>'}</div>`;
}
const listHTML = () => { const q = S.q.trim().toLowerCase();
  const l = sorted().filter(t => !q || (t.item + catName(t.categoryId) + (t.tags || []).join(' ') + (t.note || '')).toLowerCase().includes(q)).slice(0, 300);
  return l.map(txRow).join('') || '<div class="mu">ไม่พบรายการ</div>'; };
const vLedger = () => `<h1>สมุดบัญชี</h1><input id="q" placeholder="ค้นหา รายการ/หมวด/แท็ก" value="${esc(S.q)}"><div class="card" id="list">${listHTML()}</div>`;
function vSummary() {
  const r = L.summarize(S.txs, S.ym, S.st), by = {};
  for (const t of S.txs) if (t.billMonth === S.ym && (t.type === 'card' || t.type === 'transfer_cash')) by[t.categoryId] = (by[t.categoryId] || 0) + t.amount;
  const cats = Object.entries(by).sort((a, b) => b[1] - a[1]), mx = Math.max(1, ...cats.map(c => c[1]));
  const y = S.ym.slice(0, 4), ms = Array.from({ length: 12 }, (_, i) => `${y}-${L.pad(i + 1)}`).map(m => [m, L.summarize(S.txs, m, S.st)]);
  const my = Math.max(1, ...ms.map(([, s]) => Math.max(s.expense, s.incomeTotal)));
  return `<div class="nav2"><button data-act="mprev">‹</button><b>${L.ymLabel(S.ym)}</b><button data-act="mnext">›</button></div>${sumCard(S.ym)}
  <h2>แยกตามหมวด</h2><div class="card">${cats.map(([id, v]) => `<div class="r"><span>${esc(catName(id))}</span><span>${L.baht(v)}</span></div><div class="bar" style="width:${v / mx * 100}%;background:var(--lav)"></div>`).join('') || '<div class="mu">ไม่มีรายจ่ายในเดือนนี้</div>'}</div>
  <h2>ภาพรวมปี ${+y + 543}</h2><div class="card"><div class="mu">แท่งชมพู = รายจ่าย · เขียวมิ้นต์ = รายรับ</div>${ms.map(([m, s]) => `<div class="mo"><span>${L.TH_S[+m.slice(5) - 1]}</span>
  <div><div class="bar" style="width:${s.incomeTotal / my * 100}%;background:var(--mint)"></div><div class="bar" style="width:${s.expense / my * 100}%;background:var(--pink)"></div></div>
  <span class="${s.ok ? 'ok' : 'bad'}" style="text-align:right">${L.baht(s.balance)}</span></div>`).join('')}</div>`;
}
const si = (k, label, type = 'number') => `<label class="mu">${label}</label><input data-set="${k}" type="${type}" value="${esc(S.st[k])}">`;
function vSettings() {
  const cl = S.cats.map(c => `<div class="r"><span>${esc(c.name)} <span class="mu">${c.kind === 'income' ? 'รายรับ' : 'รายจ่าย'}</span></span><button class="chip" data-act="delcat" data-id="${c.id}">ลบ</button></div>`).join('');
  const pl = S.presets.map(p => `<div class="r"><span>${esc(p.label)}</span><button class="chip" data-act="delpreset" data-id="${p.id}">ลบ</button></div>`).join('') || '<div class="mu">ยังไม่มี (ติ๊ก "บันทึกเป็นรายการด่วน" ตอนเพิ่มรายการ)</div>';
  return `<h1>ตั้งค่า</h1><div class="card"><b>รอบบัตรเครดิต</b>${si('cardCutoffDay', 'วันตัดรอบ (1–31)')}${si('cardCutoffTime', 'เวลาตัดรอบ', 'time')}
  <label class="mu">ตัดรอบวันนั้นแต่ไม่ระบุเวลา</label><select data-set="cardNoTimeRule"><option value="next" ${S.st.cardNoTimeRule === 'next' ? 'selected' : ''}>นับเป็นรอบถัดไป</option><option value="current" ${S.st.cardNoTimeRule === 'current' ? 'selected' : ''}>นับเป็นรอบนี้</option></select>
  <label class="mu">โอน/เงินสด/รายรับ นับตาม</label><select data-set="cashRule"><option value="calendar" ${S.st.cashRule === 'calendar' ? 'selected' : ''}>เดือนปฏิทิน</option><option value="salary" ${S.st.cashRule === 'salary' ? 'selected' : ''}>รอบเงินเดือน</option></select>
  ${si('salaryDay', 'วันที่เงินเดือนเข้า')}<label class="mu">เติมเงินเดือนอัตโนมัติตั้งแต่เดือน (ว่าง = ทุกเดือน)</label><input data-set="salaryFrom" type="month" value="${esc(S.st.salaryFrom)}"><label class="mu">เงินเดือนอัตโนมัติ (บาท, 0 = ไม่ใช้)</label><input data-set="salaryAmount" type="number" inputmode="decimal" value="${S.st.salaryAmount / 100}"></div>
  <div class="card"><b>ค่าน้ำ-ค่าไฟ</b>${si('splitCount', 'จำนวนคนหาร (ค่าเริ่มต้น)')}</div>
  <div class="card"><b>ของใช้</b>${si('warnDays', 'เตือนก่อนหมดประกัน (วัน)')}<label class="mu">เจ้าของ (คั่นด้วย ,)</label><input data-set="owners" value="${esc(S.st.owners.join(', '))}">
  <label class="mu">หมวดของใช้ (คั่นด้วย ,)</label><input data-set="itemCats" value="${esc(S.st.itemCats.join(', '))}"></div>
  <div class="card"><b>ล็อกแอป (PIN)</b><button class="btn alt" data-act="setpin">${S.st.pinHash ? 'เปลี่ยน PIN' : 'ตั้ง PIN'}</button>${S.st.pinHash ? '<button class="btn del" data-act="rmpin">ปิดการล็อก</button>' : ''}</div>
  <div class="card"><b>สำรองข้อมูล</b><div class="mu">เก็บไฟล์ไว้ใน iCloud Drive/Files เท่านั้น ห้ามอัปโหลดขึ้น GitHub</div>
  <button class="btn" data-act="exportJson">สำรองเป็น JSON</button><button class="btn alt" data-act="exportCsv">ส่งออก CSV (Excel)</button>
  <button class="btn alt" data-act="import">นำเข้าจากไฟล์ JSON</button><input type="file" id="imp" accept=".json,application/json" hidden></div>
  <div class="card"><b>หมวดหมู่</b>${cl}<div class="two"><input id="nc" placeholder="ชื่อหมวดใหม่"><select id="nk" style="width:120px"><option value="expense">รายจ่าย</option><option value="income">รายรับ</option></select></div><button class="btn alt" data-act="addcat">เพิ่มหมวด</button></div>
  <div class="card"><b>รายการด่วน</b>${pl}</div>
  <div class="card"><b>ข้อมูล</b><button class="btn alt" data-act="sample">โหลดข้อมูลตัวอย่างทดสอบ</button><button class="btn del" data-act="wipe">ลบข้อมูลทั้งหมด</button></div>`;
}
function formHTML() {
  const f = S.form, kind = f.type === 'income' ? 'income' : 'expense';
  return `<div class="bg" data-act="closeform"></div><div class="sheet">
  ${S.presets.length ? `<div class="chips">${S.presets.map(p => `<button class="chip" data-act="preset" data-id="${p.id}">${esc(p.label)}</button>`).join('')}</div>` : ''}
  <div class="seg">${L.TYPES.map(([k, l]) => `<button class="${f.type === k ? 'on' : ''}" data-act="ftype" data-v="${k}">${l}</button>`).join('')}</div>
  <input id="f-amount" inputmode="decimal" placeholder="จำนวนเงิน (บาท)" value="${esc(f.amount)}"><input id="f-item" placeholder="รายการ" value="${esc(f.item)}">
  <select id="f-cat">${S.cats.filter(c => c.kind === kind).map(c => `<option value="${c.id}" ${c.id === f.cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
  <div class="two"><input type="date" id="f-date" value="${f.date}"><input type="time" id="f-time" value="${f.time}"></div><div class="prev" id="prev"></div>
  <input id="f-tags" placeholder="แท็ก เช่น ทริป, ลูก (คั่นด้วย ,)" value="${esc(f.tags)}"><input id="f-note" placeholder="หมายเหตุ" value="${esc(f.note)}">
  <label class="mu"><input type="checkbox" id="f-preset" style="width:auto"> บันทึกเป็นรายการด่วน</label>
  <button class="btn" data-act="save">บันทึก</button>${f.id ? '<button class="btn del" data-act="del">ลบรายการนี้</button>' : ''}</div>`;
}
function render() {
  if (S.locked) { app.innerHTML = `<div class="lock"><div style="font-size:48px">🔒</div><b>ใส่ PIN</b><input id="pin" type="password" inputmode="numeric" maxlength="6" autofocus></div>`; return; }
  const v = { home: vHome, ledger: vLedger, items: vItems, util: vUtil, summary: vSummary, settings: vSettings }[S.tab]();
  const tb = ([k, i, l]) => `<button class="${S.tab === k ? 'on' : ''}" data-act="tab" data-v="${k}"><span>${i}</span>${l}</button>`;
  app.innerHTML = `<main>${v}</main><nav>${[['home', '🏠', 'หน้าแรก'], ['ledger', '📒', 'สมุด']].map(tb).join('')}<button class="fab" data-act="add">＋</button>${[['items', '🎒', 'ของใช้'], ['summary', '📊', 'สรุป'], ['settings', '⚙️', 'ตั้งค่า']].map(tb).join('')}</nav>${S.form ? formHTML() : ''}${S.iform ? iformHTML() : ''}${S.uform ? uformHTML() : ''}`;
  if (S.form) updatePrev(); if (S.iform) updateIPrev(); if (S.uform) updateUPrev();
}


// ---------- ของใช้ ----------
const WCOL = { ok: 'ok', soon: 'warn', out: 'bad', none: 'mu', expired_product: 'bad' };
const wOf = i => L.warranty(i, today(), S.st.warnDays);
function itemRow(i) { const w = wOf(i);
  return `<div class="tx" data-act="edititem" data-id="${i.id}"><div><b>${esc(i.name)}</b><div class="mu">${[i.owner, i.category, i.store, i.date ? L.dateTH(i.date) : 'ไม่ทราบวันที่ซื้อ'].filter(Boolean).map(esc).join(' · ')}</div>
  ${w.status !== 'none' ? `<div class="${WCOL[w.status]}" style="font-size:14px">${L.WSTATUS[w.status]}${w.end ? ` · ถึง ${L.dateTH(w.end)}${w.left >= 0 ? ` (อีก ${w.left} วัน)` : ''}` : ''}</div>` : ''}</div><div class="a">${L.baht(i.price)}</div></div>`; }
function itemList() { const q = S.iq.trim().toLowerCase();
  return S.items.filter(i => (!S.iown || i.owner === S.iown) && (!q || [i.name, i.owner, i.category, i.store, i.serial, i.note].join(' ').toLowerCase().includes(q)))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '')); }
const itemListHTML = () => { const l = itemList();
  return `<div class="mu">${l.length} รายการ · มูลค่ารวม ${L.baht(l.reduce((s, i) => s + i.price, 0))} บาท</div>` + (l.map(itemRow).join('') || '<div class="mu">ไม่พบรายการ แตะ + เพื่อเพิ่ม</div>'); };
const vItems = () => `<h1>ของใช้</h1><input id="iq" placeholder="ค้นหา ชื่อ/หมวด/ร้าน/S-N" value="${esc(S.iq)}">
  <div class="chips">${['', ...S.st.owners].map(o => `<button class="chip" style="${S.iown === o ? 'background:var(--lav);color:#2d2b4a' : ''}" data-act="iown" data-v="${esc(o)}">${o || 'ทั้งหมด'}</button>`).join('')}</div>
  <div class="card" id="ilist">${itemListHTML()}</div>`;
const blankItem = () => ({ name: '', price: '', owner: '', category: '', store: '', date: today(), expiry: '', years: '', serial: '', link: '', note: '' });
function iformHTML() { const f = S.iform, v = k => esc(f[k]);
  const opt = (arr, cur, blank) => `<option value="">${blank}</option>` + arr.map(x => `<option ${x === cur ? 'selected' : ''}>${esc(x)}</option>`).join('');
  return `<div class="bg" data-act="closeform"></div><div class="sheet"><b>${f.id ? 'แก้ไขของใช้' : 'เพิ่มของใช้'}</b>
  <input id="i-name" placeholder="ชื่อสิ่งของ เช่น แอร์ห้องนอน" value="${v('name')}"><input id="i-price" inputmode="decimal" placeholder="ราคา (บาท)" value="${v('price')}">
  <div class="two"><select id="i-owner">${opt(S.st.owners, f.owner, 'เจ้าของ')}</select><select id="i-cat">${opt(S.st.itemCats, f.category, 'หมวด')}</select></div>
  <input id="i-store" placeholder="ซื้อจากที่ไหน" value="${v('store')}"><label class="mu">วันที่ซื้อ</label><input type="date" id="i-date" value="${v('date')}">
  <div class="two"><input id="i-years" inputmode="decimal" placeholder="ประกัน (ปี) เช่น 0.5 / 1 / 5" value="${v('years')}"><input id="i-sn" placeholder="S/N หรือรุ่น" value="${v('serial')}"></div><div class="prev" id="iprev"></div>
  <label class="mu">วันหมดอายุสินค้า (ถ้ามี)</label><input type="date" id="i-exp" value="${v('expiry')}"><input id="i-link" placeholder="ลิงก์ไฟล์ประกัน/ใบเสร็จ (ถ้ามี)" value="${v('link')}"><input id="i-note" placeholder="หมายเหตุ" value="${v('note')}">
  <button class="btn" data-act="saveitem">บันทึก</button>${f.id ? '<button class="btn del" data-act="delitem">ลบรายการนี้</button>' : ''}</div>`; }
function syncI() { const g = i => document.getElementById(i)?.value; if (!document.getElementById('i-name')) return;
  Object.assign(S.iform, { name: g('i-name'), price: g('i-price'), owner: g('i-owner'), category: g('i-cat'), store: g('i-store'), date: g('i-date'), years: g('i-years'), serial: g('i-sn'), expiry: g('i-exp'), link: g('i-link'), note: g('i-note') }); }
const yrs = s => parseFloat(String(s).replace(',', '.')) || 0;
function updateIPrev() { syncI(); const f = S.iform, p = document.getElementById('iprev'); if (!p) return;
  const w = L.warranty({ date: f.date, warrantyYears: yrs(f.years), expiry: f.expiry }, today(), S.st.warnDays);
  p.textContent = w.end ? `หมดประกัน ${L.dateTH(w.end)} (${w.left >= 0 ? 'เหลือ ' + w.left + ' วัน' : 'หมดแล้ว'})` : 'ยังไม่มีประกัน (ใส่จำนวนปีและวันที่ซื้อ)'; }


// ---------- ค่าน้ำ-ค่าไฟ ----------
const uLabel = m => `${L.TH_S[+m.slice(5) - 1]} ${+m.slice(0, 4) + 543}`;
const B = v => v == null ? '—' : L.baht(v);
const num = s => { const v = parseFloat(String(s).replace(/,/g, '')); return isNaN(v) ? null : v; };
const mny = s => { if (String(s).trim() === '') return null; const v = L.toSatang(s); return isNaN(v) ? null : v; };
function shareHTML(u) { const sh = L.splitShare(u);
  return `<div class="card"><b>ค่าน้ำ-ค่าไฟ ${uLabel(u.month)}</b>
  ${row('💧 ค่าน้ำ' + (u.waterUnits != null ? ` <span class="mu">(${u.waterUnits} ลบ.ม.)</span>` : ''), B(u.water))}
  ${row('⚡ ค่าไฟ' + (u.electricUnits != null ? ` <span class="mu">(${u.electricUnits} หน่วย)</span>` : ''), B(u.electric))}
  ${u.deduct ? row('หัก (เช่น ค่าชาร์จรถ)', '−' + B(u.deduct), 'sub') : ''}${row(`หาร ${u.split || 2} คน`, '', 'sub')}
  ${row('แต่ละคนจ่าย', sh == null ? '<span class="mu">กรอกค่าน้ำ/ค่าไฟให้ครบ</span>' : `<span class="ok">${B(sh)} บาท</span>`, 'big')}</div>`; }
function cmpTxt(c, money, icon, name) { if (c.a == null && c.b == null) return '';
  const f = v => v == null ? '—' : money ? L.baht(v) : v; let t = `${icon} ${name}: ${f(c.a)} → ${f(c.b)}`;
  if (c.diff != null) { const up = c.diff > 0, p = c.pct == null ? '' : `, ${up ? '+' : ''}${(c.pct * 100).toFixed(1)}%`;
    t += ` <span class="${c.diff === 0 ? 'mu' : up ? 'bad' : 'ok'}">(${up ? '+' : ''}${money ? L.baht(c.diff) : +c.diff.toFixed(2)}${p})</span>`; }
  return `<div class="r sub"><span>${t}</span></div>`; }
function vUtil() {
  const list = [...S.utils].sort((a, b) => b.month.localeCompare(a.month)), cur = list.find(u => u.month === S.um) || list[0];
  const years = [...new Set(list.map(u => +u.month.slice(0, 4)))].sort(), y2 = S.uy2 || years[years.length - 1] || new Date().getFullYear(), y1 = S.uy1 || y2 - 1;
  const yopt = sel => [...new Set([...years, y1, y2])].sort().map(y => `<option value="${y}" ${y === sel ? 'selected' : ''}>${y + 543}</option>`).join('');
  const ys = L.yearSummary(S.utils, y2), cmp = L.compareYears(S.utils, y1, y2).map(r => { const h = [cmpTxt(r.electricUnits, 0, '⚡', 'หน่วยไฟ'), cmpTxt(r.electric, 1, '⚡', 'ค่าไฟ'), cmpTxt(r.waterUnits, 0, '💧', 'หน่วยน้ำ'), cmpTxt(r.water, 1, '💧', 'ค่าน้ำ')].join('');
    return h ? `<div class="card"><b>${L.TH_M[r.m - 1]}</b>${h}</div>` : ''; }).join('');
  const sm = (nm, p, avg) => p ? row(nm + ` <span class="mu">(${p.n} เดือน)</span>`, B(Math.round(p.total))) + row('เฉลี่ย/เดือน', B(Math.round(avg)), 'sub') + (p.perUnit ? row('บาทต่อหน่วย', (p.perUnit / 100).toFixed(2), 'sub') : '') : '';
  return `<div class="nav2"><button data-act="tab" data-v="home">‹</button><b>💧⚡ ค่าน้ำ-ค่าไฟ</b><span style="width:44px"></span></div>
  ${cur ? `<select data-u="um">${list.map(u => `<option value="${u.month}" ${u === cur ? 'selected' : ''}>${uLabel(u.month)}</option>`).join('')}</select>${shareHTML(cur)}
  <button class="btn" data-act="copyutil" data-m="${cur.month}">คัดลอกข้อความไปส่งญาติ</button><button class="btn alt" data-act="editu" data-m="${cur.month}">แก้ไขเดือนนี้</button>` : '<div class="card mu">ยังไม่มีข้อมูล แตะ + เพื่อเพิ่ม</div>'}
  <div class="mu" style="margin-top:10px">อย่าลืมลงค่าไฟ/ค่าน้ำในสมุดบัญชีตามช่องทางที่จ่ายจริง (บัตรหรือโอน)</div>
  <h2>สรุปรายปี และเทียบเดือนเดียวกัน</h2><div class="two"><select data-u="uy1">${yopt(y1)}</select><select data-u="uy2">${yopt(y2)}</select></div>
  <div class="card"><b>ปี ${y2 + 543}</b>${sm('⚡ ค่าไฟรวม', ys.e, ys.avgE)}${sm('💧 ค่าน้ำรวม', ys.w, ys.avgW)}${ys.e || ys.w ? row('น้ำ+ไฟ รวม', B(ys.all), 'big') : '<div class="mu">ไม่มีข้อมูลปีนี้</div>'}</div>
  <div class="mu">เทียบ ${y1 + 543} → ${y2 + 543} (แดง = ใช้/จ่ายเพิ่ม, เขียว = ลดลง, — = ไม่มีข้อมูล)</div>${cmp || '<div class="card mu">ยังไม่มีเดือนที่เทียบได้</div>'}`;
}
const blankU = () => ({ month: today().slice(0, 7), electric: '', water: '', electricUnits: '', waterUnits: '', deduct: '', split: String(S.st.splitCount), note: '' });
function uformHTML() { const f = S.uform, v = k => esc(f[k]);
  return `<div class="bg" data-act="closeform"></div><div class="sheet"><b>ค่าน้ำ-ค่าไฟ รายเดือน</b><label class="mu">เดือน</label><input type="month" id="u-month" value="${v('month')}">
  <div class="two"><input id="u-e" inputmode="decimal" placeholder="ค่าไฟ (บาท)" value="${v('electric')}"><input id="u-w" inputmode="decimal" placeholder="ค่าน้ำ (บาท)" value="${v('water')}"></div>
  <div class="two"><input id="u-eu" inputmode="decimal" placeholder="หน่วยไฟ (kWh)" value="${v('electricUnits')}"><input id="u-wu" inputmode="decimal" placeholder="หน่วยน้ำ (ลบ.ม.)" value="${v('waterUnits')}"></div>
  <div class="two"><input id="u-d" inputmode="decimal" placeholder="หัก เช่น ค่าชาร์จรถ (บาท)" value="${v('deduct')}"><input id="u-s" inputmode="numeric" placeholder="จำนวนคนหาร" value="${v('split')}"></div><div class="prev" id="uprev"></div>
  <input id="u-note" placeholder="หมายเหตุ" value="${v('note')}"><button class="btn" data-act="saveu">บันทึก</button>${S.utils.some(u => u.month === f.month) && f.editing ? '<button class="btn del" data-act="delu">ลบเดือนนี้</button>' : ''}</div>`; }
const readU = () => { const g = i => document.getElementById(i)?.value; if (!document.getElementById('u-month')) return null; const f = S.uform;
  Object.assign(f, { month: g('u-month'), electric: g('u-e'), water: g('u-w'), electricUnits: g('u-eu'), waterUnits: g('u-wu'), deduct: g('u-d'), split: g('u-s'), note: g('u-note') });
  return { month: f.month, electric: mny(f.electric), water: mny(f.water), electricUnits: num(f.electricUnits), waterUnits: num(f.waterUnits), deduct: mny(f.deduct) ?? 0, split: Math.max(1, parseInt(f.split) || 2), note: f.note }; };
function updateUPrev() { const u = readU(), p = document.getElementById('uprev'); if (!u || !p) return; const sh = L.splitShare(u);
  p.textContent = (sh == null ? 'กรอกค่าไฟและค่าน้ำให้ครบเพื่อคำนวณ' : `แต่ละคนจ่าย ${L.baht(sh)} บาท`) + (S.utils.some(x => x.month === u.month) && !S.uform.editing ? ' · เดือนนี้มีข้อมูลแล้ว จะบันทึกทับ' : ''); }

// ---------- ฟอร์มเพิ่ม/แก้ไขรายการ ----------
const blank = () => ({ type: 'card', date: today(), time: nowT(), item: '', cat: '', amount: '', note: '', tags: '' });
function syncForm() { const g = i => document.getElementById(i)?.value;
  if (!document.getElementById('f-amount')) return; const f = S.form;
  Object.assign(f, { amount: g('f-amount'), item: g('f-item'), cat: g('f-cat'), date: g('f-date'), time: g('f-time'), tags: g('f-tags'), note: g('f-note') }); }
function updatePrev() { syncForm(); const f = S.form, p = document.getElementById('prev'); if (!p || !f.date) return;
  const m = L.billMonth(f.date, f.time, f.type, S.st); p.textContent = (f.type === 'card' || f.type === 'card_credit' ? 'นับเข้ารอบเดือน ' : 'นับเป็นเดือน ') + L.ymLabel(m); }
function openForm(f) { S.form = f; const kind = f.type === 'income' ? 'income' : 'expense'; if (!f.cat) f.cat = S.cats.find(c => c.kind === kind)?.id || ''; render(); }

const A = {
  tab: d => { S.tab = d.v; render(); },
  add: () => S.tab === 'items' ? (S.iform = blankItem(), render()) : S.tab === 'util' ? (S.uform = blankU(), render()) : openForm(blank()),
  editu: d => { const u = S.utils.find(x => x.month === d.m), s = v => v == null ? '' : String(v);
    S.uform = { month: u.month, electric: u.electric == null ? '' : String(u.electric / 100), water: u.water == null ? '' : String(u.water / 100), electricUnits: s(u.electricUnits), waterUnits: s(u.waterUnits), deduct: u.deduct ? String(u.deduct / 100) : '', split: String(u.split || 2), note: u.note || '', editing: true }; render(); },
  async saveu() { const u = readU(); if (!u || !u.month || (u.electric == null && u.water == null)) return toast('กรอกเดือน และค่าไฟหรือค่าน้ำอย่างน้อยหนึ่งอย่าง');
    await put('utilities', { id: u.month, ...u }); S.utils = await all('utilities'); S.um = u.month; S.uform = null; render(); toast('บันทึกแล้ว'); },
  async delu() { if (!confirm('ลบข้อมูลเดือนนี้?')) return; await del('utilities', S.uform.month); S.utils = await all('utilities'); S.uform = null; render(); },
  async copyutil(d) { const u = S.utils.find(x => x.month === d.m), sh = L.splitShare(u);
    const t = `ค่าน้ำ-ค่าไฟ ${uLabel(u.month)}\nค่าน้ำ ${B(u.water)} บาท\nค่าไฟ ${B(u.electric)} บาท${u.deduct ? `\nหัก ${B(u.deduct)} บาท` : ''}\nหาร ${u.split || 2} คน = แต่ละคนจ่าย ${B(sh)} บาท`;
    try { await navigator.clipboard.writeText(t); toast('คัดลอกแล้ว'); } catch { prompt('คัดลอกข้อความนี้', t); } },
  iown: d => { S.iown = d.v; render(); },
  edititem: d => { const i = S.items.find(x => x.id === d.id); S.iform = { id: i.id, name: i.name, price: String(i.price / 100), owner: i.owner || '', category: i.category || '', store: i.store || '', date: i.date || '', expiry: i.expiry || '', years: i.warrantyYears ? String(i.warrantyYears) : '', serial: i.serial || '', link: i.link || '', note: i.note || '' }; render(); },
  async saveitem() { syncI(); const f = S.iform, p = L.toSatang(f.price || '0');
    if (!f.name.trim() || !(p >= 0)) return toast('กรอกชื่อและราคาให้ถูกต้อง');
    await put('items', { id: f.id || crypto.randomUUID(), name: f.name.trim(), owner: f.owner, category: f.category, store: f.store.trim(), date: f.date, price: p, expiry: f.expiry, warrantyYears: yrs(f.years), serial: f.serial.trim(), link: f.link.trim(), note: f.note });
    S.items = await all('items'); S.iform = null; render(); toast('บันทึกแล้ว'); },
  async delitem() { if (!confirm('ลบของใช้ชิ้นนี้?')) return; await del('items', S.iform.id); S.items = await all('items'); S.iform = null; render(); toast('ลบแล้ว'); },
  edit: d => { const t = S.txs.find(x => x.id === d.id); openForm({ id: t.id, type: t.type, date: t.date, time: t.time || '', item: t.item, cat: t.categoryId, amount: String(t.amount / 100), note: t.note || '', tags: (t.tags || []).join(', ') }); },
  closeform: () => { S.form = null; S.iform = null; S.uform = null; render(); },
  ftype: d => { syncForm(); S.form.type = d.v; const kind = d.v === 'income' ? 'income' : 'expense'; if (S.cats.find(c => c.id === S.form.cat)?.kind !== kind) S.form.cat = S.cats.find(c => c.kind === kind)?.id || ''; render(); },
  preset: d => { syncForm(); const p = S.presets.find(x => x.id === d.id); Object.assign(S.form, { type: p.type, item: p.item, cat: p.cat, amount: p.amount ? String(p.amount / 100) : '' }); render(); },
  async save() { syncForm(); const f = S.form, amt = L.toSatang(f.amount);
    if (!(amt > 0) || !f.date) return toast('กรอกจำนวนเงินและวันที่ให้ถูกต้อง');
    const tags = f.tags.split(',').map(s => s.trim()).filter(Boolean);
    const t = { id: f.id || crypto.randomUUID(), date: f.date, time: f.time || '', type: f.type, item: f.item.trim(), categoryId: f.cat, amount: amt, note: f.note, tags,
      isSalary: f.type === 'income' && catName(f.cat) === 'เงินเดือน', billMonth: L.billMonth(f.date, f.time, f.type, S.st) };
    await put('transactions', t);
    if (document.getElementById('f-preset').checked) await put('presets', { id: crypto.randomUUID(), label: f.item.trim() || TL[f.type], type: f.type, item: f.item.trim(), cat: f.cat, amount: amt });
    S.txs = await all('transactions'); S.presets = await all('presets'); S.form = null; render(); toast('บันทึกแล้ว'); },
  async del() { if (!confirm('ลบรายการนี้?')) return; await del('transactions', S.form.id); S.txs = await all('transactions'); S.form = null; render(); toast('ลบแล้ว'); },
  mprev: () => { S.ym = L.addMonth(S.ym, -1); render(); }, mnext: () => { S.ym = L.addMonth(S.ym, 1); render(); },
  async addcat() { const n = document.getElementById('nc').value.trim(); if (!n) return;
    await put('categories', { id: crypto.randomUUID(), name: n, kind: document.getElementById('nk').value, sortOrder: S.cats.length }); S.cats = (await all('categories')).sort((a, b) => a.sortOrder - b.sortOrder); render(); },
  async delcat(d) { if (S.txs.some(t => t.categoryId === d.id) && !confirm('มีรายการใช้หมวดนี้อยู่ ลบแล้วรายการเหล่านั้นจะแสดงเป็น "ไม่ระบุ" ต้องการลบ?')) return; await del('categories', d.id); S.cats = await all('categories'); render(); },
  async delpreset(d) { await del('presets', d.id); S.presets = await all('presets'); render(); },
  async setpin() { const p = prompt('ตั้ง PIN ตัวเลข 4–6 หลัก'); if (!p) return; if (!/^\d{4,6}$/.test(p)) return toast('PIN ต้องเป็นตัวเลข 4–6 หลัก');
    if (prompt('ใส่ PIN อีกครั้งเพื่อยืนยัน') !== p) return toast('PIN ไม่ตรงกัน'); S.st.pinHash = await sha(p); await saveSettings(); render(); toast('ตั้ง PIN แล้ว'); },
  async rmpin() { if (!confirm('ปิดการล็อกแอป?')) return; S.st.pinHash = null; await saveSettings(); render(); },
  async exportJson() { const data = { app: 'mymoney', version: 1, exportedAt: new Date().toISOString(), settings: { ...S.st, pinHash: null }, categories: S.cats, presets: S.presets, transactions: S.txs, items: S.items, utilities: S.utils };
    if (await saveFile(`mymoney-${today()}.json`, 'application/json', JSON.stringify(data))) { S.st.lastBackupAt = new Date().toISOString(); await saveSettings(); toast('สำรองแล้ว'); } },
  async exportCsv() { const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['วันที่', 'เวลา', 'ประเภท', 'รายการ', 'หมวด', 'จำนวนเงิน', 'เดือนที่นับ', 'หมายเหตุ', 'แท็ก'], ...sorted().map(t => [t.date, t.time, TL[t.type], t.item, catName(t.categoryId), t.amount / 100, t.billMonth, t.note, (t.tags || []).join(' ')])];
    await saveFile(`mymoney-${today()}.csv`, 'text/csv', '\ufeff' + rows.map(r => r.map(q).join(',')).join('\n')); },
  import: () => document.getElementById('imp').click(),
  async sample() { if (!confirm('เพิ่มข้อมูลตัวอย่าง 3 รายการและเงินเดือน 30,000 ?')) return; S.st.salaryAmount = 3000000; await saveSettings();
    const c = S.cats.find(x => x.kind === 'expense')?.id; const s = (date, time, type, item, b) => put('transactions', { id: crypto.randomUUID(), date, time, type, item, categoryId: c, amount: b * 100, tags: [], note: 'ตัวอย่าง', billMonth: L.billMonth(date, time, type, S.st) });
    await s('2026-10-18', '', 'card', 'ค่ากาแฟ', 120); await s('2026-10-17', '15:00', 'card', 'ค่าไฟ', 4500); await s('2026-10-10', '', 'card_credit', 'เครดิตคืน', 300);
    S.txs = await all('transactions'); render(); toast('เพิ่มตัวอย่างแล้ว'); },
  async wipe() { if (!confirm('ลบข้อมูลทั้งหมดในเครื่อง? (สำรองไว้แล้วใช่ไหม)') || !confirm('ยืนยันอีกครั้ง: ลบทั้งหมดและกู้คืนไม่ได้')) return;
    for (const n of ['transactions', 'presets', 'items', 'utilities']) await clear(n); S.txs = []; S.presets = []; S.items = []; S.utils = []; render(); },
};
async function saveFile(name, type, text) { const file = new File([text], name, { type });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file] }); return true; } catch (e) { if (e.name === 'AbortError') return false; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click(); return true; }

document.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) A[b.dataset.act]?.(b.dataset); });
document.addEventListener('input', async e => {
  if (e.target.id === 'q') { S.q = e.target.value; document.getElementById('list').innerHTML = listHTML(); }
  else if (e.target.id === 'iq') { S.iq = e.target.value; document.getElementById('ilist').innerHTML = itemListHTML(); }
  else if (e.target.closest('.sheet')) S.iform ? updateIPrev() : S.uform ? updateUPrev() : updatePrev();
  else if (e.target.id === 'pin' && e.target.value.length >= 4) { if (await sha(e.target.value) === S.st.pinHash) { S.locked = false; render(); } else if (e.target.value.length === 6) e.target.value = ''; }
});
document.addEventListener('change', async e => {
  const ku = e.target.dataset.u; if (ku) { S[ku] = ku === 'um' ? e.target.value : +e.target.value; return render(); }
  const k = e.target.dataset.set;
  if (k) { let v = e.target.value; if (k === 'salaryAmount') v = Math.max(0, L.toSatang(v) || 0); else if (k === 'cardCutoffDay' || k === 'salaryDay') v = Math.min(31, Math.max(1, +v || 1));
    else if (k === 'warnDays') v = Math.max(0, +v || 0);
    else if (k === 'splitCount') v = Math.min(20, Math.max(1, Math.round(+v) || 2));
    else if (k === 'owners' || k === 'itemCats') v = v.split(',').map(s => s.trim()).filter(Boolean);
    S.st[k] = v; await saveSettings(); await recompute(); toast('บันทึกการตั้งค่าแล้ว'); }
  if (e.target.id === 'imp' && e.target.files[0]) { try { const d = JSON.parse(await e.target.files[0].text());
      if (d.app !== 'mymoney') throw 0; if (!confirm(`นำเข้า ${d.transactions.length} รายการ? ข้อมูลเดิมในเครื่องจะถูกแทนที่`)) return;
      for (const n of STORES) await clear(n); const pin = S.st.pinHash;
      await put('settings', { ...L.DEFAULT_SETTINGS, ...d.settings, pinHash: pin });
      for (const [n, a] of [['categories', d.categories], ['presets', d.presets], ['transactions', d.transactions], ['items', d.items || []], ['utilities', d.utilities || []]]) for (const x of a) await put(n, x);
      await load(); await recompute(); S.locked = false; render(); toast('นำเข้าแล้ว'); } catch { toast('ไฟล์ไม่ถูกต้อง'); } }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && S.st?.pinHash) { S.locked = true; S.form = null; } else render(); });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
load().then(render);
