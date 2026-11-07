'use strict';
/* ==========================================================================
   Kāla-Cakra — data & pure logic (no DOM)
   All durations are BigInt PICOSECONDS so that counts stay exact from
   paramāṇu (~26 µs) all the way to Dvi-parārdha (~9.7 × 10^21 s).
   ========================================================================== */

const PS = 1000000000000n;          // 1 second
const AH = 86400n * PS;             // ahorātra: 24 h
const HY = 360n * AH;               // human year (saṃvatsara)
const DY = 360n * HY;               // divya-varṣa (divine year)
const CY = 12000n * DY;             // caturyuga / mahāyuga
const SANDHYA = 4800n * DY;         // manvantara-sandhyā (= Satya Yuga length)
const MV = 71n * CY;                // manvantara core: 71 caturyuga
const MVS = MV + SANDHYA;           // full manvantara (core + its sandhyā)
const KALPA = 1000n * CY;           // Brahmā's day = 14 manvantara + 15 sandhyā
const BR_AH = 2n * KALPA;           // Brahmā day + night
const BR_YR = 720n * KALPA;         // Brahmā's year (360 × 2 kalpa)
const PARARDHA = 36000n * KALPA;    // 50 Brahmā years
const DVI = 72000n * KALPA;         // 100 Brahmā years → mahāpralaya

const E_SATYA = 4800n * DY;
const E_TRETA = 8400n * DY;
const E_DVAPARA = 10800n * DY;

if (14n * MVS + SANDHYA !== KALPA) throw new Error('Kalpa structure mismatch');

const CHAINS = {
  bhagavata: { label: 'Bhāgavata Purāṇa', N: 202500n }, // nimeṣa = day / 202,500
  manu:      { label: 'Manusmṛti',        N: 486000n }, // nimeṣa = day / 486,000
  vishnu:    { label: 'Viṣṇu Purāṇa',     N: 405000n }  // nimeṣa = day / 405,000
};

const MANUS = [
  'Svāyambhuva', 'Svārociṣa', 'Auttami', 'Tāmasa', 'Raivata', 'Cākṣuṣa',
  'Vaivasvata (present Manu)', 'Sāvarṇi', 'Dakṣa-sāvarṇi', 'Brahma-sāvarṇi',
  'Dharma-sāvarṇi', 'Rudra-sāvarṇi', 'Deva-sāvarṇi (Raucya)', 'Indra-sāvarṇi (Bhautya)'
];

const GROUPS = [
  { id: 'atomic', dev: 'सूक्ष्म काल', en: 'Sūkṣma-kāla · Atomic time' },
  { id: 'ghati',  dev: 'निमेष से अहोरात्र', en: 'Nimeṣa → Ahorātra' },
  { id: 'manava', dev: 'मानव काल', en: 'Human time' },
  { id: 'divya',  dev: 'दिव्य काल', en: 'Divine time' },
  { id: 'yuga',   dev: 'युग-व्यवस्था', en: 'Yuga system · Manvantara' },
  { id: 'kalpa',  dev: 'ब्रह्मा का काल', en: 'Brahmā\'s time · Kalpa → Mahāpralaya' }
];

/* ---------- number formatting ---------- */
function indian(s) {
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return rest + ',' + last3;
}
function fmtNum(n) { return indian(n.toString()); }
function fmtBigHTML(n) {
  const s = n.toString();
  if (s.length <= 15) return indian(s);
  return s[0] + '.' + s.slice(1, 5) + ' ×10<sup>' + (s.length - 1) + '</sup>';
}
function fmtDur(s) {
  const f = (x) => Number(x.toPrecision(4)).toLocaleString('en-US', { maximumFractionDigits: 6 });
  if (s < 1e-3) return f(s * 1e6) + ' µs';
  if (s < 0.1) return f(s * 1e3) + ' ms';
  if (s < 60) return f(s) + ' s';
  if (s < 3600) return f(s / 60) + ' min';
  if (s < 86400) return f(s / 3600) + ' hr';
  const days = s / 86400;
  if (days < 360) return f(days) + ' days';
  const y = s / 31104000;
  if (y < 1e6) return f(y) + ' yrs';
  if (y < 1e9) return f(y / 1e6) + ' million yrs';
  if (y < 1e12) return f(y / 1e9) + ' billion yrs';
  if (y < 1e15) return f(y / 1e12) + ' trillion yrs';
  return y.toExponential(3).replace('e+', ' ×10^') + ' yrs';
}
function fmtElapsed(T) {
  if (T < PS) return fmtDur(Number(T) / 1e12);
  const secs = T / PS;
  const YS = 31104000n;
  const y = secs / YS;
  let r = secs % YS;
  const d = r / 86400n; r %= 86400n;
  const h = r / 3600n; r %= 3600n;
  const m = r / 60n; const s = r % 60n;
  const parts = [];
  if (y > 0n) parts.push(fmtBigHTML(y) + ' varṣa');
  if (y < 1000000n) {
    if (d > 0n || y > 0n) parts.push(d + ' din');
    parts.push(h + 'h ' + m + 'm ' + s + 's');
  }
  return parts.join(' · ');
}
function frac(T, dur) { return Number(((T % dur) * 1000000n) / dur) / 1e6; }

/* ---------- Brahmā's-day state machine ----------
   Brahmā's day (kalpa) = S M S M … S  (15 sandhyā + 14 manvantara).
   The following night (equal length) is pralaya: no yuga/manvantara runs.   */
function computeState(T) {
  const d = T / BR_AH;
  const tk = T % BR_AH;
  const night = tk >= KALPA;
  const st = {
    daysDone: d + (night ? 1n : 0n),
    nightsDone: d,
    night, phase: 'night', mvIndex: 0,
    mvDone: 0n, cyPart: 0n, sandhyaDone: 0n, pc: 0n,
    yp: [0n, 0n, 0n, 0n]
  };
  if (night) return st;
  if (tk >= 14n * MVS) {
    st.phase = 'sandhya'; st.mvDone = 14n; st.sandhyaDone = 14n; st.mvIndex = 15;
    return st;
  }
  const j = tk / MVS, r = tk % MVS;
  st.mvDone = j;
  st.mvIndex = Number(j) + 1;
  if (r < SANDHYA) {
    st.phase = 'sandhya'; st.sandhyaDone = j;
  } else {
    st.phase = 'manvantara'; st.sandhyaDone = j + 1n;
    const tm = r - SANDHYA;
    st.cyPart = tm / CY;
    st.pc = tm % CY;
    st.yp = [st.pc >= E_SATYA ? 1n : 0n, st.pc >= E_TRETA ? 1n : 0n,
             st.pc >= E_DVAPARA ? 1n : 0n, 0n];
  }
  return st;
}
function yugaName(st) {
  if (st.phase !== 'manvantara') return null;
  if (st.pc < E_SATYA) return 'Satya (Kṛta) Yuga';
  if (st.pc < E_TRETA) return 'Tretā Yuga';
  if (st.pc < E_DVAPARA) return 'Dvāpara Yuga';
  return 'Kali Yuga';
}

/* ---------- units (depend on chosen scriptural chain) ---------- */
function buildUnits(key) {
  const N = CHAINS[key].N;
  const den = N * 16200n;            // paramāṇu per day (16,200 paramāṇu = 1 nimeṣa)
  const m = (x) => AH * x / den;     // multiples of paramāṇu
  const k = (x) => AH * x / N;       // multiples of nimeṣa
  const u = [];
  const add = (id, name, dev, rel, dur, group, count, msg) =>
    u.push({ id, name, dev, rel, dur, group, count: count || ((T) => T / dur), msg });

  add('paramanu', 'Paramāṇu', 'परमाणु', 'smallest particle · base unit', m(1n), 'atomic');
  add('anu', 'Aṇu', 'अणु', '2 paramāṇu', m(2n), 'atomic');
  add('trasarenu', 'Trasareṇu', 'त्रसरेणु', '3 aṇu', m(6n), 'atomic');
  add('truti', 'Truṭi', 'त्रुटि', '3 trasareṇu', m(18n), 'atomic');
  add('vedha', 'Vedha', 'वेध', '100 truṭi', m(1800n), 'atomic');
  add('lava', 'Lava', 'लव', '3 vedha', m(5400n), 'atomic');
  add('nimesha', 'Nimeṣa', 'निमेष', '3 lava', m(16200n), 'atomic');

  if (key === 'bhagavata') {
    add('kshana', 'Kṣaṇa', 'क्षण', '3 nimeṣa', k(3n), 'ghati');
    add('kashtha', 'Kāṣṭhā', 'काष्ठा', '5 kṣaṇa', k(15n), 'ghati');
    add('laghu', 'Laghu', 'लघु', '15 kāṣṭhā', k(225n), 'ghati');
    add('nadika', 'Nāḍikā / Ghaṭikā', 'नाडिका', '15 laghu', k(3375n), 'ghati');
    add('muhurta', 'Muhūrta', 'मुहूर्त', '2 nāḍikā', k(6750n), 'ghati');
    add('yama', 'Yāma / Prahara', 'याम', '6–7 nāḍikā ≈ ⅛ day', AH / 8n, 'ghati');
    add('ahoratra', 'Ahorātra', 'अहोरात्र', '4 day-yāma + 4 night-yāma', AH, 'ghati');
  } else {
    const kashtha = key === 'manu' ? k(18n) : k(15n);
    const kala = key === 'manu' ? k(540n) : k(450n);
    const muh = key === 'manu' ? k(16200n) : k(13500n);
    add('kashtha', 'Kāṣṭhā', 'काष्ठा', (key === 'manu' ? '18' : '15') + ' nimeṣa', kashtha, 'ghati');
    add('kala', 'Kalā', 'कला', '30 kāṣṭhā', kala, 'ghati');
    add('muhurta', 'Muhūrta', 'मुहूर्त', '30 kalā', muh, 'ghati');
    add('ahoratra', 'Ahorātra', 'अहोरात्र', '30 muhūrta', AH, 'ghati');
  }

  add('paksha', 'Pakṣa', 'पक्ष', '15 ahorātra (śukla / kṛṣṇa)', 15n * AH, 'manava');
  add('masa', 'Māsa', 'मास', '2 pakṣa · = 1 day-night of the pitṛs', 30n * AH, 'manava');
  add('ritu', 'Ṛtu', 'ऋतु', '2 māsa', 60n * AH, 'manava');
  add('ayana', 'Ayana', 'अयन', '3 ṛtu · 6 māsa (day / night of devas)', 180n * AH, 'manava');
  add('samvatsara', 'Saṃvatsara / Varṣa', 'संवत्सर', '12 māsa · = 1 divine day-night', HY, 'manava');

  add('divyavarsha', 'Divya-varṣa', 'दिव्य वर्ष', '360 human years', DY, 'divya');

  const base = (st) => st.daysDone * 994n + st.mvDone * 71n + st.cyPart;
  add('satya', 'Satya / Kṛta Yuga', 'सत्य युग', '4,000 + 400 + 400 = 4,800 divya-varṣa', 4800n * DY, 'yuga',
    (T, st) => base(st) + st.yp[0],
    (n) => `Satya Yuga #${fmtNum(n)} completed — Tretā Yuga begins`);
  add('treta', 'Tretā Yuga', 'त्रेता युग', '3,600 divya-varṣa', 3600n * DY, 'yuga',
    (T, st) => base(st) + st.yp[1],
    (n) => `Tretā Yuga #${fmtNum(n)} completed — Dvāpara Yuga begins`);
  add('dvapara', 'Dvāpara Yuga', 'द्वापर युग', '2,400 divya-varṣa', 2400n * DY, 'yuga',
    (T, st) => base(st) + st.yp[2],
    (n) => `Dvāpara Yuga #${fmtNum(n)} completed — Kali Yuga begins`);
  add('kali', 'Kali Yuga', 'कलि युग', '1,200 divya-varṣa', 1200n * DY, 'yuga',
    (T, st) => base(st),
    (n) => `Kali Yuga #${fmtNum(n)} completed — the four-yuga wheel turns; Satya returns`);
  add('caturyuga', 'Caturyuga / Mahāyuga', 'चतुर्युग', '12,000 divya-varṣa = 4.32 million yrs', CY, 'yuga',
    (T, st) => base(st),
    (n) => `Caturyuga (Mahāyuga) #${fmtNum(n)} completed — 4.32 million human years`);
  add('sandhya', 'Manvantara-sandhyā', 'मन्वन्तर-सन्ध्या', '4,800 divya-varṣa (= Satya length)', SANDHYA, 'yuga',
    (T, st) => st.daysDone * 15n + st.sandhyaDone,
    (n) => `Manvantara-sandhyā #${fmtNum(n)} completed`);
  add('manvantara', 'Manvantara', 'मन्वन्तर', '71 caturyuga + sandhyā = 308,448,000 yrs', MVS, 'yuga',
    (T, st) => st.daysDone * 14n + st.mvDone,
    (n) => `Manvantara #${fmtNum(n)} completed — the reign of ${MANUS[Number((n - 1n) % 14n)]} ends`);

  add('kalpa', 'Kalpa (Brahmā\'s Day)', 'कल्प', '1,000 caturyuga = 4.32 billion yrs', KALPA, 'kalpa',
    (T, st) => st.daysDone,
    (n) => `Kalpa #${fmtNum(n)} completed — NAIMITTIKA PRALAYA: the three worlds dissolve; Brahmā's night begins`);
  add('ratri', 'Brahmā-rātri (Night)', 'ब्रह्म-रात्रि', 'equal to one kalpa', KALPA, 'kalpa',
    (T, st) => st.nightsDone,
    (n) => `Brahmā-rātri #${fmtNum(n)} completed — Brahmā awakens; creation (sarga) begins anew`);
  add('brahmaahoratra', 'Brahmā Ahorātra', 'ब्रह्म-अहोरात्र', 'day + night = 2,000 caturyuga', BR_AH, 'kalpa',
    (T, st) => st.nightsDone,
    (n) => `Brahmā's day-and-night #${fmtNum(n)} completed (8.64 billion yrs)`);
  add('brahmavarsha', 'Brahmā Varṣa', 'ब्रह्म वर्ष', '360 Brahmā day-nights = 3.1104 trillion yrs', BR_YR, 'kalpa',
    null,
    (n) => `Brahmā's year #${fmtNum(n)} of 100 completed`);
  add('parardha', 'Parārdha', 'परार्ध', '50 Brahmā years · half of Brahmā\'s life', PARARDHA, 'kalpa',
    null,
    (n) => n === 1n ? `Parārdha #1 completed — half of Brahmā's life is over` : `Parārdha #${fmtNum(n)} completed`);
  add('dviparardha', 'Dvi-parārdha → Mahāpralaya', 'द्विपरार्ध · महाप्रलय', '100 Brahmā years = 311.04 trillion yrs', DVI, 'kalpa',
    null,
    (n) => `MAHĀPRALAYA #${fmtNum(n)} — Brahmā's full life is complete; prākṛtika pralaya. Only Brahman remains.`);
  return u;
}

if (typeof module !== 'undefined') {
  module.exports = { PS, AH, HY, DY, CY, KALPA, BR_AH, BR_YR, PARARDHA, DVI, SANDHYA, MVS, CHAINS, buildUnits, computeState, fmtDur, fmtElapsed, fmtBigHTML };
}
