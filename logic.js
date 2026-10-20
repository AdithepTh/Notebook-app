// กฎคำนวณทั้งหมดอยู่ที่ไฟล์นี้ (ไม่ยุ่งกับหน้าจอ) เพื่อให้ทดสอบได้ — เงินเก็บเป็นสตางค์ (จำนวนเต็ม)
export const TH_M = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
export const TH_S = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
export const TYPES = [['card','บัตร'],['card_credit','เครดิตคืน'],['transfer_cash','โอน/เงินสด'],['income','รายรับ']];
export const DEFAULT_SETTINGS = { id:'main', cardCutoffDay:17, cardCutoffTime:'13:00', cardNoTimeRule:'next',
  salaryDay:25, salaryAmount:0, salaryFrom:'', cashRule:'calendar', pinHash:null, lastBackupAt:null, warnDays:90, splitCount:2,
  owners:['ผม','ภรรยา','ลูก','ใช้ร่วมกัน'],
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
  const end = item.date && item.warrantyYears > 0 ? addMonthsDate(item.date, Math.round(item.warrantyYears * 12)) : '';
  const left = end ? daysBetween(today, end) : null;
  let status = 'ok';
  if (item.expiry && item.expiry < today) status = 'expired_product';
  else if (!end) status = 'none';
  else if (left < 0) status = 'out';
  else if (left <= warnDays) status = 'soon';
  return { end, left, status };
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
