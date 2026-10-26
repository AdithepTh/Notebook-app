// กฎคำนวณทั้งหมดอยู่ที่ไฟล์นี้ (ไม่ยุ่งกับหน้าจอ) เพื่อให้ทดสอบได้ — เงินเก็บเป็นสตางค์ (จำนวนเต็ม)
export const APP_VERSION = '3.0.0'; // ต้องตรงกับชื่อแคชใน sw.js (มีเทสต์เช็ก)
export const TH_M = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
export const TH_S = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
export const TYPES = [['card','บัตร'],['card_credit','เครดิตคืน'],['transfer_cash','โอน/เงินสด'],['income','รายรับ']];
export const DEFAULT_SETTINGS = { id:'main', cardCutoffDay:17, cardCutoffTime:'13:00', cardNoTimeRule:'next',
  salaryDay:25, salaryAmount:0, salaryFrom:'', cashRule:'calendar', pinHash:null, lastBackupAt:null, warnDays:90, splitCount:2,
  owners:['ส่วนตัว','ภายในบ้าน','ภรรยา','ลูก','ครอบครัว (ใช้ร่วมกัน)'],
  itemCats:['เครื่องใช้ไฟฟ้า','เฟอร์นิเจอร์/ของใช้บ้าน','ของเด็ก','ของเล่น/โมเดล','เสื้อผ้า/รองเท้า','ยานยนต์/จักรยาน','อุปกรณ์ไอที','ของใช้ส่วนตัว','ประกัน/กรมธรรม์','อื่นๆ'] };

export const pad = n => String(n).padStart(2, '0');
export function addMonth(ym, n) {
  let [y, m] = ym.split('-').map(Number); m += n - 1; y += Math.floor(m / 12);
  return `${y}-${pad(((m % 12) + 12) % 12 + 1)}`;
}
export const ymLabel = ym => `${TH_M[+ym.slice(5) - 1]} ${+ym.slice(0, 4) + 543}`;
export const dateTH = d => `${+d.slice(8)} ${TH_S[+d.slice(5, 7) - 1]} ${+d.slice(0, 4) + 543}`;

// กฎ A: เดือนเงินเดือนของรายการ (card/card_credit ใช้รอบบัตร, อื่นๆ ใช้เดือนปฏิทิน)
export function billMonth(date, time, type, s) {
  const ym = date.slice(0, 7), d = +date.slice(8, 10);
  if (type === 'card' || type === 'card_credit') {
    if (d < s.cardCutoffDay) return ym;
    if (d > s.cardCutoffDay) return addMonth(ym, 1);
    if (!time) return s.cardNoTimeRule === 'current' ? ym : addMonth(ym, 1);
    return time < s.cardCutoffTime ? ym : addMonth(ym, 1);
  }
  if (s.cashRule === 'salary') return d >= s.salaryDay ? addMonth(ym, 1) : ym; // เผื่ออนาคต
  return ym;
}

// แปลงข้อความเป็นสตางค์ โดยไม่ใช้ทศนิยมลอยตัว (ปัดครึ่งขึ้น)
export function toSatang(str) {
  const m = String(str).replace(/,/g, '').trim().match(/^(-?)(\d*)(?:\.(\d*))?$/);
  if (!m || (!m[2] && !m[3])) return NaN;
  const f = (m[3] || '').padEnd(3, '0');
  let v = +(m[2] || 0) * 100 + +f.slice(0, 2);
  if (+f[2] >= 5) v++;
  return m[1] ? -v : v;
}
export const baht = s => (s / 100).toLocaleString('th-TH', { minimumFractionDigits: s % 100 ? 2 : 0, maximumFractionDigits: 2 });

// กฎ C: สรุปเดือน (fixed = ผ่อน+ภาระประจำ เพิ่มในเฟส 3)
export function summarize(txs, ym, s, fixed = 0) {
  const r = { card: 0, credit: 0, cash: 0, income: 0, hasSalary: false };
  for (const t of txs) {
    if (t.billMonth !== ym) continue;
    if (t.type === 'card') r.card += t.amount;
    else if (t.type === 'card_credit') r.credit += t.amount;
    else if (t.type === 'transfer_cash') r.cash += t.amount;
    else if (t.type === 'income') { r.income += t.amount; if (t.isSalary) r.hasSalary = true; }
  }
  const raw = r.card - r.credit;
  r.netCard = Math.max(0, raw);          // เครดิตเกินยอดบัตร = ปัดเป็น 0
  r.excessCredit = Math.max(0, -raw);
  r.fixed = fixed;
  r.expense = r.netCard + r.fixed + r.cash;
  r.autoSalary = !r.hasSalary && s.salaryAmount > 0 && (!s.salaryFrom || ym >= s.salaryFrom) ? s.salaryAmount : 0; // ไม่นับซ้ำ
  r.incomeTotal = r.income + r.autoSalary;
  r.balance = r.incomeTotal - r.expense;
  r.ok = r.balance >= 0;
  return r;
}

// ของใช้: วันหมดประกัน = วันซื้อ + (ปี×12) เดือน (วันที่เกินท้ายเดือนจะถอยมาวันสุดท้ายของเดือน)
export function addMonthsDate(iso, n) {
  const [y, m, d] = iso.split('-').map(Number), t = m - 1 + n;
  const yy = y + Math.floor(t / 12), mm = ((t % 12) + 12) % 12;
  return `${yy}-${pad(mm + 1)}-${pad(Math.min(d, new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate()))}`;
}
export const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
export const WSTATUS = { ok: 'ยังอยู่ในประกัน', soon: 'ใกล้หมดประกัน', out: 'หมดประกันแล้ว', none: 'ไม่มีประกัน', expired_product: 'สินค้าหมดอายุแล้ว' };
export function warranty(item, today, warnDays = 90) {
  const start = item.warrantyStart || item.date || '';   // วันเริ่มประกัน (ไม่กรอก = วันที่ซื้อ)
  const end = start && item.warrantyYears > 0 ? addMonthsDate(start, Math.round(item.warrantyYears * 12)) : '';
  const left = end ? daysBetween(today, end) : null;
  let status = 'ok';
  if (item.expiry && item.expiry < today) status = 'expired_product';
  else if (!end) status = 'none';
  else if (left < 0) status = 'out';
  else if (left <= warnDays) status = 'soon';
  return { start, end, left, status };
}

// ค่าน้ำ-ค่าไฟ (กฎ D) — เงินเป็นสตางค์, หน่วยเป็นตัวเลขธรรมดา, ช่องที่ไม่มีข้อมูล = null (ไม่ใช่ 0)
const halfUp = (t, n) => Math.floor((2 * t + n) / (2 * n)); // ปัดครึ่งขึ้นที่ 2 ตำแหน่ง (สตางค์)
export const splitShare = u => u.electric == null || u.water == null ? null : halfUp(u.electric + u.water - (u.deduct || 0), u.split || 2);
export const utilVal = (list, y, m, f) => { const u = list.find(x => x.month === `${y}-${pad(m)}`); return u && u[f] != null ? u[f] : null; };
export function compareYears(list, y1, y2) {
  return Array.from({ length: 12 }, (_, i) => { const row = { m: i + 1 };
    for (const f of ['electricUnits', 'electric', 'waterUnits', 'water']) {
      const a = utilVal(list, y1, i + 1, f), b = utilVal(list, y2, i + 1, f), diff = a == null || b == null ? null : b - a;
      row[f] = { a, b, diff, pct: diff == null || a === 0 ? null : diff / a };
    } return row; });
}
export function yearSummary(list, y) {
  const us = list.filter(u => u.month.startsWith(y + '-'));
  const part = (b, un) => { const x = us.filter(u => u[b] != null); if (!x.length) return null;
    const p = x.filter(u => u[un] > 0), units = p.reduce((s, u) => s + u[un], 0);
    return { total: x.reduce((s, u) => s + u[b], 0), n: x.length, units: p.length ? units : null, perUnit: units ? p.reduce((s, u) => s + u[b], 0) / units : null }; };
  const e = part('electric', 'electricUnits'), w = part('water', 'waterUnits');
  return { e, w, avgE: e && e.total / e.n, avgW: w && w.total / w.n, all: (e ? e.total : 0) + (w ? w.total : 0) };
}

// ตรวจไฟล์สำรองก่อนนำเข้า: คืนข้อความ error หรือ '' ถ้าใช้ได้ (รับไฟล์สำรองรุ่นเก่าที่มี items ได้)
export function validateBackup(d) {
  if (!d || d.app !== 'mymoney') return 'ไฟล์นี้ไม่ใช่ไฟล์สำรองของแอปนี้';
  if (!d.settings || typeof d.settings !== 'object' || Array.isArray(d.settings)) return 'ส่วน settings ไม่ถูกต้อง';
  const secs = { items: x => x.id && typeof x.name === 'string', places: x => x.id && typeof x.name === 'string' && ALL_PROVINCES.includes(x.province) && PLACE_TYPES.some(t => t[0] === x.type) };
  for (const [k, ok] of Object.entries(secs)) {
    if (d[k] === undefined && k === 'places') continue;
    if (!Array.isArray(d[k])) return `ส่วน ${k} ต้องเป็น array`;
    if (!d[k].every(x => x && typeof x === 'object' && ok(x))) return `ข้อมูลในส่วน ${k} ผิดรูปแบบ`;
  }
  return '';
}

// ส่งออกวันครบกำหนดเป็น .ics (all-day + เตือนล่วงหน้า remindDays วัน เวลา 09:00) events = [{uid,date,title,remindDays,note}]
export const addDays = (iso, n) => new Date(Date.parse(iso) + n * 864e5).toISOString().slice(0, 10);
export function buildICS(events, now = new Date()) {
  const esc = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const fold = ln => Array.from(ln).reduce((o, c, i) => o + (i && i % 70 === 0 ? '\r\n ' : '') + c, '');
  const d8 = iso => iso.replace(/-/g, ''), stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//mymoney//TH', 'CALSCALE:GREGORIAN'];
  for (const e of events) { const n = e.remindDays || 0;
    out.push('BEGIN:VEVENT', `UID:${e.uid}@mymoney.local`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d8(e.date)}`, `DTEND;VALUE=DATE:${d8(addDays(e.date, 1))}`,
      `SUMMARY:${esc(e.title)}`, ...(e.note ? [`DESCRIPTION:${esc(e.note)}`] : []),
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`, `TRIGGER:${n > 0 ? `-P${n - 1}DT15H` : 'PT9H'}`, 'END:VALARM', 'END:VEVENT'); }
  out.push('END:VCALENDAR'); return out.map(fold).join('\r\n') + '\r\n';
}

// ---------- ของใช้: สถานะ/จัดชุด ----------
export const ITEM_STATUS = ['ใช้งานอยู่', 'เก็บไว้', 'ชำรุด', 'ขายแล้ว', 'ทิ้ง/เลิกใช้'];
export function groupBySet(items) { // ของชุดเดียวกัน (เช่น คอมพิวเตอร์: เครื่อง/จอ/เมาส์) คืนชุดเรียงตามชื่อ ของที่ไม่มีชุดอยู่ท้ายสุด
  const m = new Map(); for (const i of items) { const k = i.setName || ''; if (!m.has(k)) m.set(k, []); m.get(k).push(i); }
  return [...m].map(([name, its]) => ({ name, items: its, total: its.reduce((s, i) => s + i.price, 0) }))
    .sort((a, b) => !a.name - !b.name || a.name.localeCompare(b.name, 'th'));
}
// ---------- ท่องเที่ยว 77 จังหวัด ----------
export const PROVINCES = {
  'เหนือ': ['เชียงราย', 'เชียงใหม่', 'น่าน', 'พะเยา', 'แพร่', 'แม่ฮ่องสอน', 'ลำปาง', 'ลำพูน', 'อุตรดิตถ์'],
  'ตะวันออกเฉียงเหนือ': ['กาฬสินธุ์', 'ขอนแก่น', 'ชัยภูมิ', 'นครพนม', 'นครราชสีมา', 'บึงกาฬ', 'บุรีรัมย์', 'มหาสารคาม', 'มุกดาหาร', 'ยโสธร', 'ร้อยเอ็ด', 'เลย', 'สกลนคร', 'สุรินทร์', 'ศรีสะเกษ', 'หนองคาย', 'หนองบัวลำภู', 'อุดรธานี', 'อุบลราชธานี', 'อำนาจเจริญ'],
  'กลาง': ['กรุงเทพมหานคร', 'กำแพงเพชร', 'ชัยนาท', 'นครนายก', 'นครปฐม', 'นครสวรรค์', 'นนทบุรี', 'ปทุมธานี', 'พระนครศรีอยุธยา', 'พิจิตร', 'พิษณุโลก', 'เพชรบูรณ์', 'ลพบุรี', 'สมุทรปราการ', 'สมุทรสงคราม', 'สมุทรสาคร', 'สิงห์บุรี', 'สุโขทัย', 'สุพรรณบุรี', 'สระบุรี', 'อ่างทอง', 'อุทัยธานี'],
  'ตะวันออก': ['จันทบุรี', 'ฉะเชิงเทรา', 'ชลบุรี', 'ตราด', 'ปราจีนบุรี', 'ระยอง', 'สระแก้ว'],
  'ตะวันตก': ['กาญจนบุรี', 'ตาก', 'ประจวบคีรีขันธ์', 'เพชรบุรี', 'ราชบุรี'],
  'ใต้': ['กระบี่', 'ชุมพร', 'ตรัง', 'นครศรีธรรมราช', 'นราธิวาส', 'ปัตตานี', 'พังงา', 'พัทลุง', 'ภูเก็ต', 'ระนอง', 'สงขลา', 'สตูล', 'สุราษฎร์ธานี', 'ยะลา'],
};
export const ALL_PROVINCES = Object.values(PROVINCES).flat();
export const regionOf = p => Object.keys(PROVINCES).find(r => PROVINCES[r].includes(p)) || '';
export const PLACE_TYPES = [['trip', '🧳 ทริป'], ['stay', '🏨 ที่พัก'], ['food', '🍜 ร้านอาหาร'], ['sight', '📍 ที่เที่ยว'], ['other', '📝 อื่นๆ']];
export const PLACE_ICON = Object.fromEntries(PLACE_TYPES.map(([k, l]) => [k, l.split(' ')[0]]));
export const visitedProvinces = places => new Set(places.map(p => p.province).filter(Boolean));
export function filterPlaces(places, { province = '', type = '', minRating = 0, district = '', q = '' } = {}) {
  const s = q.trim().toLowerCase();
  return places.filter(p => (!province || p.province === province) && (!type || p.type === type) && (p.rating || 0) >= minRating && (!district || p.district === district) &&
    (!s || [p.province, p.district, p.name, p.note, (p.tags || []).join(' ')].join(' ').toLowerCase().includes(s)))
    .sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.date || '').localeCompare(a.date || ''));
}
// ร้านอาหารที่เคยไปใกล้ที่พักนี้: ผูกไว้กับที่พัก หรืออยู่อำเภอ/ย่านเดียวกัน (จังหวัดเดียวกัน) เรียงคะแนนสูงสุดก่อน
export const nearbyFood = (places, stay) => filterPlaces(places, { province: stay.province, type: 'food' })
  .filter(f => f.nearId === stay.id || (stay.district && f.district === stay.district && !f.nearId));
