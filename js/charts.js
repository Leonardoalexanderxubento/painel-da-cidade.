// Gráficos SVG feitos à mão (sem dependências), com tooltip ao passar o mouse/dedo.

const NS = 'http://www.w3.org/2000/svg';
const PAD = { top: 22, right: 12, bottom: 24, left: 34 };

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function niceTicks(min, max, count = 4) {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? step0;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(6));
  return ticks;
}

function setup(container, height) {
  container.innerHTML = '';
  container.classList.add('chart');
  const width = Math.max(container.clientWidth, 260);
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, width, height, role: 'img' });
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  container.append(svg, tip);
  return { svg, tip, width, height, iw: width - PAD.left - PAD.right, ih: height - PAD.top - PAD.bottom };
}

function drawYAxis(svg, ticks, y, width, fmt) {
  const g = svgEl('g', { class: 'axis' });
  for (const t of ticks) {
    g.append(svgEl('line', { x1: PAD.left, x2: width - PAD.right, y1: y(t), y2: y(t), class: 'grid' }));
    const label = svgEl('text', { x: PAD.left - 6, y: y(t) + 4, 'text-anchor': 'end' });
    label.textContent = fmt(t);
    g.append(label);
  }
  svg.append(g);
}

function drawXLabels(svg, points, x, height, every) {
  const g = svgEl('g', { class: 'axis' });
  points.forEach((p, i) => {
    if (i % every) return;
    const t = svgEl('text', { x: x(i), y: height - 6, 'text-anchor': 'middle' });
    t.textContent = p.label;
    g.append(t);
  });
  svg.append(g);
}

function showTip(tip, container, html, px, py) {
  tip.innerHTML = html;
  tip.hidden = false;
  const w = tip.offsetWidth;
  const left = Math.min(Math.max(px - w / 2, 0), container.clientWidth - w);
  tip.style.left = `${left}px`;
  tip.style.top = `${Math.max(py - tip.offsetHeight - 10, 0)}px`;
}

/**
 * Linha única com crosshair.
 * points: [{ label, value, tip }]
 */
export function lineChart(container, points, { height = 180, unit = '', ariaLabel = '' } = {}) {
  const { svg, tip, width, iw, ih } = setup(container, height);
  svg.setAttribute('aria-label', ariaLabel);
  const vals = points.map((p) => p.value);
  const ticks = niceTicks(Math.min(...vals) - 1, Math.max(...vals) + 1);
  const yMin = ticks[0];
  const yMax = ticks.at(-1);
  const x = (i) => PAD.left + (i / (points.length - 1)) * iw;
  const y = (v) => PAD.top + ih - ((v - yMin) / (yMax - yMin)) * ih;

  drawYAxis(svg, ticks, y, width, (t) => `${t}°`);
  drawXLabels(svg, points, x, height, width < 480 ? 6 : 3);

  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  svg.append(svgEl('path', { d: `${d}L${x(points.length - 1)},${PAD.top + ih}L${x(0)},${PAD.top + ih}Z`, class: 'area' }));
  svg.append(svgEl('path', { d, class: 'line' }));

  // Rótulos diretos só no máximo e no mínimo
  const iMax = vals.indexOf(Math.max(...vals));
  const iMin = vals.indexOf(Math.min(...vals));
  for (const i of new Set([iMax, iMin])) {
    svg.append(svgEl('circle', { cx: x(i), cy: y(vals[i]), r: 4, class: 'dot' }));
    const t = svgEl('text', { x: x(i), y: y(vals[i]) + (i === iMax ? -9 : 17), 'text-anchor': 'middle', class: 'direct-label' });
    t.textContent = `${Math.round(vals[i])}${unit}`;
    svg.append(t);
  }

  const cross = svgEl('line', { y1: PAD.top, y2: PAD.top + ih, class: 'crosshair', visibility: 'hidden' });
  const hoverDot = svgEl('circle', { r: 5, class: 'dot hover', visibility: 'hidden' });
  const hit = svgEl('rect', { x: PAD.left, y: 0, width: iw, height, fill: 'transparent' });
  svg.append(cross, hoverDot, hit);

  const move = (evt) => {
    const rect = svg.getBoundingClientRect();
    const px = ((evt.clientX - rect.left) / rect.width) * width;
    const i = Math.round(((px - PAD.left) / iw) * (points.length - 1));
    if (i < 0 || i >= points.length) return;
    const p = points[i];
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
    hoverDot.setAttribute('cx', x(i)); hoverDot.setAttribute('cy', y(p.value)); hoverDot.setAttribute('visibility', 'visible');
    showTip(tip, container, p.tip ?? `<b>${p.value}${unit}</b> · ${p.label}`, (x(i) / width) * rect.width, (y(p.value) / height) * rect.height);
  };
  const leave = () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); hoverDot.setAttribute('visibility', 'hidden'); };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', leave);
}

/**
 * Barras verticais. points: [{ label, value, tip, cls }]
 * `cls` permite colorir cada barra por status (ex.: "lvl-good").
 */
export function barChart(container, points, { height = 150, max, unit = '', ariaLabel = '', yFmt = (t) => t } = {}) {
  const { svg, tip, width, iw, ih } = setup(container, height);
  svg.setAttribute('aria-label', ariaLabel);
  const top = max ?? Math.max(...points.map((p) => p.value), 1);
  const ticks = niceTicks(0, top, 3);
  const yMax = ticks.at(-1);
  const slot = iw / points.length;
  const bw = Math.max(Math.min(slot - 2, 18), 2); // 2px de respiro entre barras
  const x = (i) => PAD.left + i * slot + slot / 2;
  const y = (v) => PAD.top + ih - (v / yMax) * ih;

  drawYAxis(svg, ticks, y, width, yFmt);
  drawXLabels(svg, points, x, height, width < 480 ? 6 : 3);

  points.forEach((p, i) => {
    const h = Math.max(PAD.top + ih - y(p.value), p.value > 0 ? 2 : 0);
    const r = Math.min(4, bw / 2, h);
    const x0 = x(i) - bw / 2;
    const y0 = PAD.top + ih - h;
    // topo arredondado, base reta ancorada no eixo
    const d = h ? `M${x0},${PAD.top + ih}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + bw - r}Q${x0 + bw},${y0} ${x0 + bw},${y0 + r}V${PAD.top + ih}Z` : '';
    svg.append(svgEl('path', { d, class: `bar ${p.cls ?? ''}` }));
    const hit = svgEl('rect', { x: x(i) - slot / 2, y: PAD.top, width: slot, height: ih, fill: 'transparent' });
    const show = () => {
      const rect = svg.getBoundingClientRect();
      showTip(tip, container, p.tip ?? `<b>${p.value}${unit}</b> · ${p.label}`, (x(i) / width) * rect.width, (y0 / height) * rect.height);
    };
    hit.addEventListener('pointerenter', show);
    hit.addEventListener('pointerdown', show);
    hit.addEventListener('pointerleave', () => { tip.hidden = true; });
    svg.append(hit);
  });
}
