'use strict';
/* Kāla-Cakra — UI, simulation loop, notifications. Needs data.js loaded first. */
(function () {
  const $ = (s) => document.querySelector(s);
  const S = { T: 0n, speed: 1, running: false, started: false, ended: false, chain: 'bhagavata', cycle: 1, dirty: true };
  const SPEEDS = [1, 10, 100, 1000, 10000, 100000, 1000000, 10000000];
  const RING_COLORS = ['#ff3d2e', '#ff6a2b', '#ff8f2b', '#ffae2f', '#ffc94d', '#ffe08a', '#fff1c0'];

  let units = [], prev = [], rings = [];
  let lastToastAt = {}, skipped = {}, lastMinorAt = 0, lastFrame = 0;
  let lastElapsed = '', lastStatus = '';

  /* ------------------------------------------------------------ counters */
  function buildCounters() {
    const host = $('#counters');
    host.innerHTML = '';
    units = buildUnits(S.chain);
    const holders = {};
    GROUPS.forEach((g) => {
      const sec = document.createElement('section');
      sec.className = 'group';
      const en = g.id === 'ghati' ? `${g.en} · ${CHAINS[S.chain].label} chain` : g.en;
      sec.innerHTML = `<h3><span class="g-dev">${g.dev}</span><span class="g-en">${en}</span></h3>`;
      const cards = document.createElement('div');
      cards.className = 'cards';
      sec.appendChild(cards);
      host.appendChild(sec);
      holders[g.id] = cards;
    });
    units.forEach((u) => {
      u.tier = u.dur >= CY ? 'epic' : u.dur >= AH ? 'major' : 'minor';
      const el = document.createElement('article');
      el.className = 'card tier-' + u.tier;
      el.innerHTML =
        `<div class="c-head"><span class="c-dev">${u.dev}</span><span class="c-name">${u.name}</span></div>` +
        `<div class="c-count">0</div>` +
        `<div class="c-rel">${u.rel}</div>` +
        `<div class="c-dur">${fmtDur(Number(u.dur) / 1e12)}</div>`;
      holders[u.group].appendChild(el);
      u.el = el;
      u.countEl = el.querySelector('.c-count');
    });
    prev = units.map(() => 0n);
    buildMandala();
  }

  /* ------------------------------------------------------------ mandala */
  function unit(id) { return units.find((u) => u.id === id); }

  function buildMandala() {
    const defs = [
      { label: 'Brahmā\'s life (Dvi-parārdha)', life: true, dur: DVI },
      { label: 'Brahmā day-night (2 kalpa)', dur: BR_AH },
      { label: 'Caturyuga', dur: CY },
      { label: 'Saṃvatsara (year)', dur: HY },
      { label: 'Ahorātra (day)', dur: AH },
      { label: 'Muhūrta', dur: unit('muhurta').dur },
      { label: 'Nimeṣa', dur: unit('nimesha').dur }
    ];
    let petals = '', petals2 = '';
    for (let i = 0; i < 24; i++) {
      petals += `<ellipse cx="300" cy="-4" rx="15" ry="32" transform="rotate(${i * 15} 300 300)"/>`;
      petals2 += `<ellipse cx="300" cy="14" rx="9" ry="20" transform="rotate(${i * 15 + 7.5} 300 300)"/>`;
    }
    let ringSvg = '';
    defs.forEach((d, i) => {
      const r = 262 - i * 26;
      d.C = 2 * Math.PI * r;
      d.i = i;
      ringSvg += `<circle class="ring-track" cx="300" cy="300" r="${r}"/>` +
        `<circle class="ring-prog" id="ring${i}" cx="300" cy="300" r="${r}" stroke="${RING_COLORS[i]}" stroke-dasharray="0 ${d.C.toFixed(2)}" transform="rotate(-90 300 300)"/>`;
    });
    $('#mandala').innerHTML =
      `<defs><radialGradient id="core"><stop offset="0%" stop-color="#ffb347"/><stop offset="60%" stop-color="#e2611a"/><stop offset="100%" stop-color="#7a1f10"/></radialGradient></defs>` +
      `<g class="petals slow">${petals}</g><g class="petals2 slow-rev">${petals2}</g>` +
      ringSvg +
      `<circle cx="300" cy="300" r="76" fill="url(#core)" stroke="#f6c453" stroke-width="3"/>` +
      `<text x="300" y="327" text-anchor="middle" class="om">ॐ</text>` +
      `<circle id="bindu" cx="300" cy="356" r="5" class="bindu"/>`;
    rings = defs;
    $('#ringLegend').innerHTML = defs.map((d, i) =>
      `<div class="lg"><i style="background:${RING_COLORS[i]}"></i><span>${d.label}</span><b id="rp${i}">0%</b></div>`).join('');
  }

  function updateRings() {
    rings.forEach((d, i) => {
      const f = d.life ? Math.min(1, Number((S.T * 1000000000n) / DVI) / 1e9) : frac(S.T, d.dur);
      $('#ring' + i).setAttribute('stroke-dasharray', `${(f * d.C).toFixed(2)} ${d.C.toFixed(2)}`);
      $('#rp' + i).textContent = (d.life && f < 0.001) ? (f * 100).toExponential(1) + '%' : (f * 100).toFixed(1) + '%';
    });
  }

  /* ------------------------------------------------------------ status */
  function updateStatus(st) {
    let a, b, c, d;
    if (!S.started) {
      a = b = c = d = '— (press Start)';
    } else {
      const T = S.T;
      let yr = T / BR_YR + 1n; if (yr > 100n) yr = 100n;
      a = `Brahmā varṣa ${yr} of 100 · ${T >= PARARDHA ? 'second' : 'first'} parārdha`;
      if (st.night) {
        b = `Brahmā-rātri #${st.nightsDone + 1n} — Brahmā\'s night (pralaya)`;
        c = 'Dissolved — no Manvantara runs during the night';
        d = '—';
      } else {
        b = `Kalpa #${st.daysDone + 1n} — Brahmā\'s Day`;
        if (st.mvIndex <= 14) {
          c = `Manvantara ${st.mvIndex} · ${MANUS[st.mvIndex - 1]}` + (st.phase === 'sandhya' ? ' — sandhyā (twilight)' : '');
        } else {
          c = 'Closing sandhyā of the Kalpa';
        }
        d = st.phase === 'manvantara' ? `${yugaName(st)} · Caturyuga ${st.cyPart + 1n} of 71` : 'Between Manvantaras (sandhyā)';
      }
    }
    const key = a + b + c + d;
    if (key === lastStatus) return;
    lastStatus = key;
    $('#st-brahma').textContent = a;
    $('#st-kalpa').textContent = b;
    $('#st-manv').textContent = c;
    $('#st-yuga').textContent = d;
  }

  /* ------------------------------------------------------------ toasts + log */
  function toast(u, msg, loopTxt) {
    const box = $('#toasts');
    while (box.children.length >= 5) box.removeChild(box.firstChild);
    const t = document.createElement('div');
    t.className = 'toast ' + u.tier;
    t.innerHTML = `<div class="t-top"><span class="t-dev">${u.dev}</span><span class="t-loop">${loopTxt}</span></div><div class="t-msg">${msg}</div>`;
    box.appendChild(t);
    const life = u.tier === 'epic' ? 9000 : u.tier === 'major' ? 5500 : 3200;
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 450); }, life);
    const li = document.createElement('li');
    li.className = u.tier;
    li.innerHTML = `<time>${fmtElapsed(S.T)}</time><span>${msg}</span>`;
    const log = $('#log');
    log.prepend(li);
    while (log.children.length > 120) log.removeChild(log.lastChild);
  }

  function onComplete(u, c, diff, now) {
    const periodMs = Number(u.dur) / 1e9 / S.speed;
    const slow = periodMs >= 800;
    if (slow) {
      u.el.classList.remove('flash'); void u.el.offsetWidth; u.el.classList.add('flash');
    } else {
      skipped[u.id] = (skipped[u.id] || 0n) + diff;
      if (now - (lastToastAt[u.id] || 0) < 4000 || now - lastMinorAt < 700) return;
      lastMinorAt = now;
    }
    lastToastAt[u.id] = now;
    let msg = u.msg ? u.msg(c) : `${u.name} #${fmtNum(c)} completed`;
    if (!slow && skipped[u.id] > 1n) {
      msg = `${u.name} #${fmtNum(c)} completed (${fmtNum(skipped[u.id])} loops since last notice)`;
    }
    skipped[u.id] = 0n;
    toast(u, msg, 'Loop #' + fmtNum(c));
  }

  /* ------------------------------------------------------------ render */
  function render(silent) {
    const T = S.T, st = computeState(T), now = performance.now();
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      const c = u.count(T, st);
      if (c !== prev[i]) {
        u.countEl.innerHTML = fmtBigHTML(c);
        const diff = c - prev[i];
        prev[i] = c;
        if (!silent && S.started && diff > 0n) onComplete(u, c, diff, now);
      }
    }
    const el = fmtElapsed(T);
    if (el !== lastElapsed) { $('#elapsed').innerHTML = el; lastElapsed = el; }
    const lf = Number((T * 1000000000000n) / DVI) / 1e12 * 100;
    $('#lifePct').textContent = lf === 0 ? '0 %' : (lf < 0.001 ? lf.toExponential(3) : lf.toFixed(4)) + ' %';
    updateRings();
    updateStatus(st);
    if (T >= DVI && !S.ended) finish();
  }

  function loop(ts) {
    const dt = lastFrame ? Math.min(ts - lastFrame, 100) : 16;
    lastFrame = ts;
    if (S.running) {
      S.T += BigInt(Math.round(dt * S.speed * 1e9));   // ms × speed → ps
      if (S.T > DVI) S.T = DVI;
      render(false);
    } else if (S.dirty) {
      render(true);
    }
    S.dirty = false;
    requestAnimationFrame(loop);
  }

  /* ------------------------------------------------------------ controls */
  function setButtons() {
    $('#startBtn').disabled = S.started;
    $('#pauseBtn').disabled = !S.started || S.ended;
    $('#pauseBtn').textContent = S.running ? '❚❚ Pause' : '▶ Resume';
    $('#chainSel').disabled = S.started;
    $('#jumpSel').disabled = S.ended;
    document.body.classList.toggle('running', S.running);
    document.querySelectorAll('#speedBtns button').forEach((b) =>
      b.classList.toggle('active', Number(b.dataset.s) === S.speed));
    $('#speedNote').textContent = `1 real second ≈ ${fmtDur(S.speed)} of cosmic time`;
  }

  function start() {
    if (S.started) return;
    S.started = true; S.running = true;
    toast(unit('paramanu'), `Sṛṣṭi-kāla begins — counting from Paramāṇu (Brahmā #${S.cycle})`, 'Start');
    setButtons();
  }
  function reset() {
    S.T = 0n; S.running = false; S.started = false; S.ended = false; S.dirty = true;
    skipped = {}; lastToastAt = {}; lastElapsed = ''; lastStatus = '';
    $('#log').innerHTML = '';
    $('#toasts').innerHTML = '';
    $('#overlay').classList.remove('show');
    buildCounters();
    setButtons();
  }
  function finish() {
    S.ended = true; S.running = false;
    $('#overlay .cycle').textContent = `Brahmā #${S.cycle}`;
    $('#overlay').classList.add('show');
    setButtons();
  }

  function buildJumps() {
    const sel = $('#jumpSel');
    const items = [
      ['Muhūrta ends', () => unit('muhurta').dur],
      ['Ahorātra (day) ends', () => AH],
      ['Saṃvatsara (year) ends', () => HY],
      ['Satya Yuga #1 ends', () => SANDHYA + E_SATYA],
      ['Caturyuga #1 ends', () => SANDHYA + CY],
      ['Manvantara #1 ends', () => MVS],
      ['Kalpa #1 ends (Naimittika pralaya)', () => KALPA],
      ['Brahmā-rātri #1 ends', () => BR_AH],
      ['Brahmā varṣa #1 ends', () => BR_YR],
      ['Parārdha #1 ends', () => PARARDHA],
      ['MAHĀPRALAYA (Brahmā\'s life ends)', () => DVI]
    ];
    sel.innerHTML = '<option value="">⏭ Jump to just before…</option>' +
      items.map((it, i) => `<option value="${i}">${it[0]}</option>`).join('');
    sel.addEventListener('change', () => {
      if (sel.value === '') return;
      const at = items[Number(sel.value)][1]();
      let lead = BigInt(Math.round(4 * S.speed * 1e12));    // ≈ 4 real seconds before the event
      if (lead > at / 2n) lead = at / 2n;
      S.T = at - lead;
      if (S.T < 0n) S.T = 0n;
      if (!S.started) { S.started = true; }
      S.running = true;
      render(true);                                          // sync silently, no notification flood
      setButtons();
      sel.value = '';
    });
  }

  function init() {
    const sb = $('#speedBtns');
    SPEEDS.forEach((s) => {
      const b = document.createElement('button');
      b.dataset.s = s; b.textContent = s.toLocaleString('en-US') + '×';
      b.addEventListener('click', () => { S.speed = s; setButtons(); });
      sb.appendChild(b);
    });
    $('#startBtn').addEventListener('click', start);
    $('#pauseBtn').addEventListener('click', () => { if (S.started && !S.ended) { S.running = !S.running; setButtons(); } });
    $('#resetBtn').addEventListener('click', reset);
    $('#chainSel').addEventListener('change', (e) => { S.chain = e.target.value; buildCounters(); S.dirty = true; });
    $('#againBtn').addEventListener('click', () => { S.cycle++; reset(); start(); });
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && S.started && !S.ended && !/SELECT|BUTTON/.test(e.target.tagName)) {
        e.preventDefault(); S.running = !S.running; setButtons();
      }
    });
    buildCounters();
    buildJumps();
    setButtons();
    requestAnimationFrame(loop);
  }
  init();
})();
