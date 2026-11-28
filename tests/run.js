/* Тесты расчётов калькулятора. Запуск: node tests/run.js
   Обновить эталон после намеренного изменения доз: node tests/run.js --update

   1. Проверки ключевых сценариев (явные ожидаемые значения).
   2. Снимок всех расчётов вкладки «Амбулаторные формы»: каждый препарат × форма × режим × 6 пациентов.
      Любое изменение дозы, кратности или блокировки покажется как отличие от tests/snapshot.json.
   Тесты проверяют, что код считает так, как задумано. Клиническую верификацию они не заменяют. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SNAP = path.join(__dirname, 'snapshot.json');
const SNAP_KITS = path.join(__dirname, 'snapshot-kits.json');

// ---- загрузка кода калькулятора из исходника без браузера ----
function load() {
  const html = fs.readFileSync(path.join(ROOT, 'src', 'dose-calculator.html'), 'utf8');
  const i = html.indexOf('<script>', html.indexOf('<body')) + 8;
  const j = html.indexOf('/* ---------- events ----------', i);
  if (i < 8 || j < 0) throw new Error('Не найден основной скрипт в src/dose-calculator.html');
  const code = html.slice(i, j).replace("(function(){\n'use strict';", '');
  const el = new Proxy(function () {}, {
    get: (t, k) => k === 'value' ? '' : k === 'checked' ? false : k === 'dataset' || k === 'style' ? {} :
      k === 'classList' ? { toggle() {}, add() {}, remove() {} } : (() => el),
    apply: () => el, set: () => true
  });
  const store = {};
  const g = {
    document: { querySelector: () => el, querySelectorAll: () => [], getElementById: () => el, addEventListener() {}, createElement: () => el, documentElement: el },
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    location: { hash: '', search: '', pathname: '/' }, history: { replaceState() {} }, matchMedia: () => ({ matches: false }), navigator: {}
  };
  g.window = g;
  const fn = new Function(...Object.keys(g), code + ';return {DRUGS,convert,amt,burnMap,b64e,b64d,APP_VER,smpCalc,SMP,REANIM,ANEST,ABX};');
  return fn(...Object.values(g));
}
const C = load();

// ---- пациенты ----
const P = (o) => Object.assign({ ok: true, sex: 'm', h: 175, liver: false, preg: null, crcl: null, crclMethod: null }, o, { ageM: Math.round(o.ageY * 12) });
const PATIENTS = {
  infant: P({ ageY: 0.75, sex: 'f', w: 8.5, h: 71 }),
  child4: P({ ageY: 4, w: 16, h: 104 }),
  child10: P({ ageY: 10, sex: 'f', w: 32, h: 138 }),
  adult: P({ ageY: 35, w: 74, h: 178, crcl: 110, crclMethod: 'cg', scrU: 80 }),
  old82: P({ ageY: 82, sex: 'f', w: 55, h: 160, crcl: 28, crclMethod: 'cg', scrU: 140 }),
  renal12: P({ ageY: 70, w: 70, crcl: 12, crclMethod: 'cg', scrU: 400 })
};
const drug = id => { const d = C.DRUGS.find(x => x.id === id); if (!d) throw new Error('нет препарата ' + id); return d; };
function run(id, formId, mode, p) {
  const d = drug(id), f = d.forms.find(x => x.id === formId) || d.forms[0];
  const r = d.calc(p, f, mode);
  const stop = r.msgs.find(m => m.lvl === 'stop');
  if (stop || r.doseMin == null) return { stop: stop ? stop.t : 'нет дозы' };
  const c = C.convert(f, r.doseMin, r.doseMax);
  return { dose: [r.doseMin, r.doseMax], times: r.timesMax, freq: r.freq, amount: C.amt(f, c.a, c.b).replace(/ /g, ' '), fit: c.fit };
}

// ---- 1. ключевые сценарии ----
let fails = 0, passed = 0;
function check(name, got, want) {
  const ok = Object.entries(want).every(([k, v]) => JSON.stringify(got[k]) === JSON.stringify(v));
  if (ok) passed++; else { fails++; console.log('✗ ' + name + '\n   ожидалось ' + JSON.stringify(want) + '\n   получено  ' + JSON.stringify(got)); }
}
const isStop = (name, got) => { if (got.stop) passed++; else { fails++; console.log('✗ ' + name + ': ожидалась блокировка, получено ' + JSON.stringify(got)); } };

const A = PATIENTS.adult, O = PATIENTS.old82, K = PATIENTS.renal12;
// апиксабан при ФП: ≥ 2 критериев (возраст ≥ 80, масса ≤ 60, креатинин ≥ 133) → 2,5 мг × 2
check('апиксабан ФП, взрослый', run('at_apixaban', 't5', 'af', A), { dose: [5, 5], times: 2 });
check('апиксабан ФП, 82 года 55 кг креатинин 140', run('at_apixaban', 't2_5', 'af', O), { dose: [2.5, 2.5], times: 2 });
check('апиксабан ТГВ дни 1–7', run('at_apixaban', 't5', 'vte', A), { dose: [10, 10], times: 2 });
isStop('апиксабан при КК 12', run('at_apixaban', 't5', 'af', K));
// ривароксабан
check('ривароксабан ФП', run('at_rivaroxaban', 't20', 'af', A), { dose: [20, 20], times: 1 });
check('ривароксабан ФП, КК 28', run('at_rivaroxaban', 't15', 'af', O), { dose: [15, 15], times: 1 });
check('ривароксабан ТГВ дни 1–21', run('at_rivaroxaban', 't15', 'vte', A), { dose: [15, 15], times: 2 });
isStop('ривароксабан при КК 12', run('at_rivaroxaban', 't20', 'af', K));
// дабигатран
check('дабигатран ФП', run('at_dabigatran', 't150', 'af', A), { dose: [150, 150], times: 2 });
check('дабигатран ФП, 80 лет', run('at_dabigatran', 't110', 'af', P({ ageY: 80, w: 70, crcl: 60, crclMethod: 'cg' })), { dose: [110, 110], times: 2 });
isStop('дабигатран при КК 28', run('at_dabigatran', 't150', 'af', O));
// эдоксабан
check('эдоксабан ФП', run('at_edoxaban', 't60', 'af', A), { dose: [60, 60], times: 1 });
check('эдоксабан ФП, масса 55', run('at_edoxaban', 't30', 'af', O), { dose: [30, 30], times: 1 });
// эноксапарин
check('эноксапарин лечение 74 кг', run('at_enoxaparin', 'syr', 'tx', A), { dose: [74, 74], times: 2, amount: '0,7 мл' });
check('эноксапарин лечение, КК 28 → 1 раз', run('at_enoxaparin', 'syr', 'tx', O), { dose: [55, 55], times: 1 });
check('эноксапарин профилактика высокий риск', run('at_enoxaparin', 'syr', 'p_high', A), { dose: [40, 40], amount: '0,4 мл' });
check('эноксапарин профилактика, КК 28 → 20 мг', run('at_enoxaparin', 'syr', 'p_high', O), { dose: [20, 20] });
// надропарин, далтепарин, фондапаринукс — весовые группы
check('надропарин лечение 74 кг → 0,7 мл', run('at_nadroparin', 'syr', 'tx', A), { amount: '0,7 мл', times: 2 });
isStop('надропарин лечение при КК 28', run('at_nadroparin', 'syr', 'tx', O));
check('далтепарин лечение 74 кг → 15 000 МЕ', run('at_dalteparin', 'c25', 'tx', A), { dose: [15000, 15000], amount: '0,6 мл' });
check('далтепарин лечение 55 кг → 10 000 МЕ', run('at_dalteparin', 'c25', 'tx', O), { dose: [10000, 10000] });
check('фондапаринукс лечение 74 кг → 7,5 мг', run('at_fondaparinux', 't12', 'tx', A), { dose: [7.5, 7.5], amount: '0,6 мл' });
check('фондапаринукс лечение 120 кг → 10 мг', run('at_fondaparinux', 't12', 'tx', P({ ageY: 50, w: 120, crcl: 90, crclMethod: 'cg' })), { dose: [10, 10] });
check('фондапаринукс лечение 45 кг → 5 мг', run('at_fondaparinux', 't12', 'tx', P({ ageY: 50, w: 45, crcl: 90, crclMethod: 'cg' })), { dose: [5, 5] });
// исправления по сверке с РЛС 28.11.2026
check('надропарин ортопедия 50,5 кг → 0,2 мл (группа < 51 кг)', run('at_nadroparin', 'syr', 'p_ortho', P({ ageY: 50, w: 50.5 })), { amount: '0,2 мл' });
check('надропарин ортопедия 51 кг → 0,3 мл', run('at_nadroparin', 'syr', 'p_ortho', P({ ageY: 50, w: 51 })), { amount: '0,3 мл' });
check('надропарин постельный режим 70 кг → 0,4 мл', run('at_nadroparin', 'syr', 'p_med', P({ ageY: 50, w: 70 })), { amount: '0,4 мл' });
check('надропарин постельный режим 71 кг → 0,6 мл', run('at_nadroparin', 'syr', 'p_med', P({ ageY: 50, w: 71 })), { amount: '0,6 мл' });
isStop('фондапаринукс профилактика при КК 40 (нужно 1,5 мг)', run('at_fondaparinux', 'p25', 'proph', P({ ageY: 70, w: 70, crcl: 40, crclMethod: 'cg' })));
check('фондапаринукс ОКС при КК 40 — без коррекции', run('at_fondaparinux', 'p25', 'acs', P({ ageY: 70, w: 70, crcl: 40, crclMethod: 'cg' })), { dose: [2.5, 2.5] });
isStop('фондапаринукс при КК 15', run('at_fondaparinux', 'p25', 'acs', P({ ageY: 70, w: 70, crcl: 15, crclMethod: 'cg' })));
check('варфарин старт 5 мг и у 82-летней', run('at_warfarin', 't2_5', 'std', O), { dose: [5, 5], amount: '2 таблетки' });
// антиагреганты
check('тикагрелор нагрузочная', run('at_ticagrelor', 't90', 'load', A), { dose: [180, 180], amount: '2 таблетки' });
check('прасугрел поддерживающая, масса 55', run('at_prasugrel', 't5', 'maint', P({ ageY: 60, w: 55 })), { dose: [5, 5] });
// дети: антитромботики не считаются
for (const id of C.DRUGS.filter(d => d.id.startsWith('at_')).map(d => d.id)) {
  const d = drug(id);
  isStop(id + ' у ребёнка 10 лет', run(id, d.forms[0].id, d.modes ? d.modes[0].id : null, PATIENTS.child10));
}
// площадь ожога: области в сумме дают 100% в любом возрасте
for (const age of [0, 0.5, 2, 4, 7, 12, 14.9, 15, 40]) {
  const s = C.burnMap(age).v.reduce((a, b) => a + b, 0);
  check('площадь тела = 100% в ' + age + ' лет', { s: Math.round(s * 10) / 10 }, { s: 100 });
}
// ссылка на расчёт: кодирование туда и обратно, включая кириллицу
const sample = JSON.stringify({ t: 'main', i: 'at_apixaban', p: { y: '82', w: '55,5', note: 'проверка' } });
check('ссылка: кодирование и раскодирование', { back: C.b64d(C.b64e(sample)) }, { back: sample });
check('ссылка: только безопасные символы', { ok: /^[A-Za-z0-9_-]+$/.test(C.b64e(sample)) }, { ok: true });

// СМП: сверка с РЛС 28.11.2026
{
  const dx = C.SMP.find(d => d.id === 'dexamethasone'), reg = dx.regs.find(r => r.id === 'em');
  const r = C.smpCalc(dx, dx.forms[0], reg, Object.assign({}, PATIENTS.child10));
  check('дексаметазон ребёнку 32 кг — разовая 0,89–5,33 мг (РЛС 0,028–0,167 мг/кг)', { lo: Math.round(r.lo * 100) / 100, hi: Math.round(r.hi * 100) / 100 }, { lo: 0.89, hi: 5.33 });
}

// ---- 2. снимок всех расчётов ----
const snap = {};
for (const d of C.DRUGS) for (const m of (d.modes || [{ id: null }])) for (const f of d.forms) for (const [pn, p] of Object.entries(PATIENTS)) {
  let out;
  try { out = run(d.id, f.id, m.id, p); } catch (e) { out = { error: e.message }; }
  snap[[d.id, m.id || '-', f.id, pn].join('|')] = out.stop ? 'STOP: ' + out.stop : out.error ? 'ERROR: ' + out.error : `${out.dose.join('–')} → ${out.amount} ${out.freq} [${out.fit}]`;
}
const errors = Object.entries(snap).filter(([, v]) => v.startsWith('ERROR'));
errors.forEach(([k, v]) => { fails++; console.log('✗ сбой расчёта ' + k + ': ' + v); });

if (process.argv.includes('--update') || !fs.existsSync(SNAP)) {
  fs.writeFileSync(SNAP, JSON.stringify(snap, null, 1) + '\n');
  console.log('Эталон записан: ' + Object.keys(snap).length + ' расчётов.');
} else {
  const old = JSON.parse(fs.readFileSync(SNAP, 'utf8'));
  const keys = new Set([...Object.keys(old), ...Object.keys(snap)]);
  let diff = 0;
  for (const k of keys) if (old[k] !== snap[k]) {
    if (++diff <= 30) console.log('≠ ' + k + '\n   было:  ' + (old[k] ?? '—') + '\n   стало: ' + (snap[k] ?? '—'));
  }
  if (diff) { fails++; console.log(`Изменилось ${diff} расчётов. Если это намеренно — проверьте и запустите: node tests/run.js --update`); }
  else passed++;
}
// ---- 3. снимок укладок: СМП, реанимационная укладка, АиР, антибиотики в/в ----
const fmt = v => v == null ? '—' : Math.round(v * 1000) / 1000;
function kitOut(d, f, reg, p) {
  const r = C.smpCalc(d, f, reg, Object.assign({}, p));
  const stop = r.msgs.find(m => m.lvl === 'stop');
  if (stop) return 'STOP: ' + stop.t;
  if (r.kind === 'bolus') return `${fmt(r.lo)}–${fmt(r.hi)} ${r.u}${r.freq ? ' · ' + r.freq : ''}${r.maxT ? ' · макс ' + r.maxT : ''}`;
  if (r.kind === 'inf') return `инфузия ${fmt(r.inf.mlhLo)}–${fmt(r.inf.mlhHi)} мл/ч`;
  if (r.kind === 'custom') return 'расчёт: ' + (r.rows || []).map(x => x.k + ' ' + x.v).join('; ');
  return 'справка';
}
const kitSnap = {};
for (const [name, list] of [['smp', C.SMP], ['rean', C.REANIM], ['anest', C.ANEST], ['abx', C.ABX]]) {
  for (const d of list) for (const f of d.forms) {
    const regs = (d.regs || []).filter(g => !g.f || g.f.includes(f.id));
    for (const reg of (regs.length ? regs : [null])) for (const [pn, p] of Object.entries(PATIENTS)) {
      let out; try { out = kitOut(d, f, reg, p); } catch (e) { out = 'ERROR: ' + e.message; }
      kitSnap[[name, d.id, f.id, reg ? reg.id : '-', pn].join('|')] = String(out).replace(/ /g, ' ');
    }
  }
}
Object.entries(kitSnap).filter(([, v]) => v.startsWith('ERROR')).forEach(([k, v]) => { fails++; console.log('✗ сбой расчёта ' + k + ': ' + v); });
if (process.argv.includes('--update') || !fs.existsSync(SNAP_KITS)) {
  fs.writeFileSync(SNAP_KITS, JSON.stringify(kitSnap, null, 1) + '\n');
  console.log('Эталон укладок записан: ' + Object.keys(kitSnap).length + ' расчётов.');
} else {
  const old = JSON.parse(fs.readFileSync(SNAP_KITS, 'utf8'));
  let diff = 0;
  for (const k of new Set([...Object.keys(old), ...Object.keys(kitSnap)])) if (old[k] !== kitSnap[k]) {
    if (++diff <= 30) console.log('≠ ' + k + '\n   было:  ' + (old[k] ?? '—') + '\n   стало: ' + (kitSnap[k] ?? '—'));
  }
  if (diff) { fails++; console.log(`Изменилось ${diff} расчётов укладок. Если это намеренно — node tests/run.js --update`); } else passed++;
}

console.log(`\n${fails ? 'ОШИБКИ' : 'OK'}: проверок пройдено ${passed}, не пройдено ${fails}. Расчётов в снимке: ${Object.keys(snap).length} + укладки ${Object.keys(kitSnap).length}.`);
process.exit(fails ? 1 : 0);
