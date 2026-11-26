/* SAR-Mesh test charts: small hand-rolled SVG charts in the site palette */
(function () {
  const C = { cer: '#A5BCD6', rasp: '#D46A72', tan: '#C9A089', yel: '#F5EFC6', dim: '#A99F86', java: '#231815' };
  const CFG = [
    { sf: 'SF7',  bw: '125 kHz',  p: '9 dBm',  c: C.cer,  pdr: 48.2, rx: 40,  tx: 83,  rssi: -81.0,  snr: 1.4,   toa: 0.10 },
    { sf: 'SF10', bw: '62.5 kHz', p: '9 dBm',  c: C.rasp, pdr: 51.4, rx: 168, tx: 327, rssi: -92.5,  snr: -4.1,  toa: 1.54 },
    { sf: 'SF10', bw: '125 kHz',  p: '9 dBm',  c: C.tan,  pdr: 64.5, rx: 20,  tx: 31,  rssi: -89.3,  snr: 1.7,   toa: 0.62 },
    { sf: 'SF11', bw: '125 kHz',  p: '12 dBm', c: C.yel,  pdr: 14.3, rx: 2,   tx: 14,  rssi: -47.0,  snr: 12.5,  toa: 1.31 },
    { sf: 'SF12', bw: '62.5 kHz', p: '9 dBm',  c: '#8E8670', pdr: 32.1, rx: 9,   tx: 28,  rssi: -100.0, snr: -13.2, toa: 5.05 },
    { sf: 'SF12', bw: '62.5 kHz', p: '16 dBm', c: '#BDB497', pdr: 34.1, rx: 14,  tx: 41,  rssi: -99.1,  snr: -12.1, toa: 5.26 },
  ];
  const ns = 'http://www.w3.org/2000/svg';
  const el = (t, a, p) => { const e = document.createElementNS(ns, t); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
  const fmt = (v, d = 1) => v.toFixed(d).replace('.', ',').replace('-', '−');
  const name = c => `${c.sf} · ${c.bw} · ${c.p}`;

  /* tooltip */
  const tip = document.createElement('div'); tip.className = 'tip'; document.body.appendChild(tip);
  const showTip = (e, html) => { tip.innerHTML = html; tip.classList.add('on'); moveTip(e); };
  const moveTip = e => {
    const x = Math.min(innerWidth - tip.offsetWidth - 12, e.clientX + 14), y = Math.max(8, e.clientY - tip.offsetHeight - 12);
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  };
  const hideTip = () => tip.classList.remove('on');
  const hover = (node, html) => {
    node.addEventListener('pointerenter', e => showTip(e, html));
    node.addEventListener('pointermove', moveTip);
    node.addEventListener('pointerleave', hideTip);
  };

  /* legend */
  const lg = document.getElementById('legend');
  if (lg) CFG.forEach(c => { const s = document.createElement('span'); s.innerHTML = `<i style="background:${c.c}"></i>${name(c)}`; lg.appendChild(s); });

  /* bar chart: values drawn from `base` toward the value */
  function bars(id, { get, min, max, step, base, unit, label, tipText }) {
    const host = document.getElementById(id); if (!host) return;
    const W = Math.max(340, host.clientWidth || 560), H = 330, L = 46, R = 8, T = 26, B = 58;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' }, host);
    const y = v => T + (max - v) / (max - min) * (H - T - B);
    for (let v = min; v <= max + 1e-9; v += step) {
      el('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: v === 0 ? 'axis' : 'grid' }, svg);
      el('text', { x: L - 8, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 11 }, svg).textContent = fmt(v, step < 1 ? 1 : 0) + (unit || '');
    }
    const n = CFG.length, slot = (W - L - R) / n, bw = slot * 0.62;
    CFG.forEach((c, i) => {
      const v = get(c), x = L + i * slot + (slot - bw) / 2;
      const y0 = y(base), y1 = y(v), top = Math.min(y0, y1), h = Math.max(1, Math.abs(y1 - y0));
      const r = el('rect', { x, y: top, width: bw, height: h, rx: 5, fill: c.c, class: 'bar' }, svg);
      r.style.transformOrigin = `${x + bw / 2}px ${y0}px`;
      r.style.transform = 'scaleY(0)';
      r.style.transition = `transform .9s cubic-bezier(.2,.75,.2,1) ${i * 70}ms`;
      r.dataset.grow = '1';
      hover(r, tipText(c));
      const ty = v >= base ? y1 - 8 : y1 + 16;
      const t = el('text', { x: x + bw / 2, y: ty, 'text-anchor': 'middle', 'font-size': 12.5, class: 'val' }, svg);
      t.textContent = label(c);
      const cx = L + i * slot + slot / 2;
      el('text', { x: cx, y: H - B + 20, 'text-anchor': 'middle', 'font-size': 11.5, style: 'fill:var(--fg)' }, svg).textContent = c.sf;
      el('text', { x: cx, y: H - B + 35, 'text-anchor': 'middle', 'font-size': 10.5 }, svg).textContent = c.bw;
      el('text', { x: cx, y: H - B + 49, 'text-anchor': 'middle', 'font-size': 10.5 }, svg).textContent = c.p;
    });
    return svg;
  }

  bars('cPdr', { get: c => c.pdr, min: 0, max: 80, step: 20, base: 0, unit: '%',
    label: c => fmt(c.pdr) + '%',
    tipText: c => `<b>${name(c)}</b><br>PDR ${fmt(c.pdr)}% · ${c.rx} dari ${c.tx} paket` });
  bars('cToa', { get: c => c.toa, min: 0, max: 6, step: 1, base: 0, unit: ' s',
    label: c => fmt(c.toa, 2) + ' s',
    tipText: c => `<b>${name(c)}</b><br>Time on Air ≈ ${fmt(c.toa, 2)} s per paket` });
  bars('cRssi', { get: c => c.rssi, min: -110, max: -20, step: 15, base: -110, unit: '',
    label: c => fmt(c.rssi),
    tipText: c => `<b>${name(c)}</b><br>RSSI rata-rata ${fmt(c.rssi)} dBm` });
  bars('cSnr', { get: c => c.snr, min: -20, max: 20, step: 10, base: 0, unit: '',
    label: c => fmt(c.snr),
    tipText: c => `<b>${name(c)}</b><br>SNR rata-rata ${fmt(c.snr)} dB` });

  /* PDR over time (3-minute windows), read off the team's chart */
  (function timeline() {
    const host = document.getElementById('cTime'); if (!host) return;
    const segs = [
      [[-0.5, 93], [2.6, 31], [5.7, 43]],
      [[15.6, 73], [18.7, 55], [21.8, 67], [24.9, 33], [28.0, 0], [31.1, 0], [34.2, 56], [37.3, 100], [40.4, 100]],
      [[49.8, 0], [52.9, 0], [56.0, 62], [59.1, 70], [62.2, 73], [65.3, 80], [68.4, 43], [71.5, 40], [74.6, 33], [77.7, 22]],
    ];
    const gap = [8.1, 14.2]; // no Command log
    const W = Math.max(340, host.clientWidth || 1100), H = W < 600 ? 260 : 330, L = 46, R = 12, T = 20, B = 40, x0 = -2, x1 = 80;
    const X = m => L + (m - x0) / (x1 - x0) * (W - L - R), Y = v => T + (100 - v) / 100 * (H - T - B);
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' }, host);
    el('rect', { x: X(gap[0]), y: T, width: X(gap[1]) - X(gap[0]), height: H - T - B, fill: 'rgba(245,239,198,.06)' }, svg);
    el('text', { x: (X(gap[0]) + X(gap[1])) / 2, y: T + 16, 'text-anchor': 'middle', 'font-size': 11 }, svg).textContent = 'tidak ada log';
    for (let v = 0; v <= 100; v += 25) {
      el('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), class: v === 0 ? 'axis' : 'grid' }, svg);
      el('text', { x: L - 8, y: Y(v) + 4, 'text-anchor': 'end', 'font-size': 11 }, svg).textContent = v + '%';
    }
    const clock = m => { const t = 11 * 60 + 45 + Math.round(m); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
    for (let m = 0; m <= 75; m += (W < 600 ? 30 : 15)) el('text', { x: X(m), y: H - B + 22, 'text-anchor': 'middle', 'font-size': 11 }, svg).textContent = clock(m);
    const grad = el('linearGradient', { id: 'tg', x1: 0, x2: 0, y1: 0, y2: 1 }, el('defs', {}, svg));
    el('stop', { offset: 0, 'stop-color': C.cer, 'stop-opacity': .28 }, grad); el('stop', { offset: 1, 'stop-color': C.cer, 'stop-opacity': 0 }, grad);
    segs.forEach(s => {
      const d = s.map((p, i) => (i ? 'L' : 'M') + X(p[0]) + ' ' + Y(p[1])).join(' ');
      el('path', { d: d + ` L${X(s[s.length - 1][0])} ${Y(0)} L${X(s[0][0])} ${Y(0)} Z`, fill: 'url(#tg)' }, svg);
      const line = el('path', { d, fill: 'none', stroke: C.cer, 'stroke-width': 2.4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', class: 'tl' }, svg);
      s.forEach(p => {
        const c = el('circle', { cx: X(p[0]), cy: Y(p[1]), r: 4.6, fill: C.java, stroke: C.yel, 'stroke-width': 2, class: 'pt' }, svg);
        hover(c, `<b>${clock(p[0])}</b> · jendela 3 menit<br>PDR ≈ ${p[1]}%`);
        const hit = el('circle', { cx: X(p[0]), cy: Y(p[1]), r: 12, fill: 'transparent' }, svg);
        hover(hit, `<b>${clock(p[0])}</b> · jendela 3 menit<br>PDR ≈ ${p[1]}%`);
      });
    });
  })();

  /* grow bars + draw lines when visible */
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.querySelectorAll('[data-grow]').forEach(r => r.style.transform = 'scaleY(1)');
    e.target.querySelectorAll('.tl').forEach(p => {
      const L = p.getTotalLength(); p.style.strokeDasharray = L; p.style.strokeDashoffset = L;
      p.getBoundingClientRect(); p.style.transition = 'stroke-dashoffset 1.6s cubic-bezier(.3,.7,.2,1)'; p.style.strokeDashoffset = 0;
    });
    io.unobserve(e.target);
  }), { threshold: 0.25 });
  document.querySelectorAll('.chart').forEach(c => io.observe(c));
})();
