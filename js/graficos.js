// Gráficos en SVG hechos a mano. Cada pieza lleva data-tip con su monto (se ve al pasar el mouse o tocar).
import { crc, esc } from './datos.js';

const R = 52, CIRC = 2 * Math.PI * R;

export function dona(segs) {
  const total = segs.reduce((s, x) => s + x.valor, 0);
  if (!total) return '<p class="vacio">Todavía no hay gastos este mes.</p>';
  let off = 0;
  const arcos = segs.map(s => {
    const len = (s.valor / total) * CIRC, pct = Math.round((s.valor / total) * 100);
    const html = `<circle class="arco" r="${R}" cx="70" cy="70" stroke="${s.color}" stroke-dasharray="${Math.max(0.5, len - 1.5)} ${CIRC}" stroke-dashoffset="${-off}" data-tip="${esc(s.nombre)}: ${crc(s.valor)} (${pct} %)"/>`;
    off += len;
    return html;
  }).join('');
  return `<svg class="dona" viewBox="0 0 140 140" role="img" aria-label="Gasto por categoría">
    <g transform="rotate(-90 70 70)">${arcos}</g>
    <text x="70" y="66" class="dona-et">Gastado</text><text x="70" y="83" class="dona-num">${crc(total)}</text></svg>`;
}

// grupos: [{et, a, b, tipA, tipB}] dos barras por grupo
export function barras(grupos, etA, etB) {
  const W = 320, base = 128, alto = 112;
  const max = Math.max(1, ...grupos.flatMap(g => [g.a, g.b]));
  const ancho = W / grupos.length, bw = Math.min(14, ancho / 3);
  const cuerpo = grupos.map((g, i) => {
    const x = i * ancho + ancho / 2, ha = (g.a / max) * alto, hb = (g.b / max) * alto;
    return `<rect class="barra-g a" x="${x - bw - 1}" y="${base - ha}" width="${bw}" height="${ha}" rx="2" data-tip="${esc(g.et)} · ${etA}: ${crc(g.a)}"/>
      <rect class="barra-g b" x="${x + 1}" y="${base - hb}" width="${bw}" height="${hb}" rx="2" data-tip="${esc(g.et)} · ${etB}: ${crc(g.b)}"/>
      <text x="${x}" y="${base + 16}" text-anchor="middle">${esc(g.et)}</text>`;
  }).join('');
  return `<svg class="graf" viewBox="0 0 ${W} ${base + 22}" role="img" aria-label="${etA} y ${etB} por mes">
    <line class="eje" x1="0" x2="${W}" y1="${base + 0.5}" y2="${base + 0.5}"/>${cuerpo}</svg>
    <ul class="leyenda fila-ley"><li><i class="punto" style="--c:var(--g-a)"></i>${etA}</li><li><i class="punto" style="--c:var(--g-b)"></i>${etB}</li></ul>`;
}

// puntos: [{et, valor, tip}]
export function linea(puntos) {
  if (puntos.length < 2) return '';
  const W = 320, H = 110, pad = 8;
  const max = Math.max(1, ...puntos.map(p => p.valor));
  const xy = puntos.map((p, i) => [pad + (i * (W - 2 * pad)) / (puntos.length - 1), pad + (1 - p.valor / max) * (H - 2 * pad)]);
  const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  return `<svg class="graf" viewBox="0 0 ${W} ${H + 18}" role="img" aria-label="Saldo de la deuda en el tiempo">
    <line class="eje" x1="0" x2="${W}" y1="${H - pad + 0.5}" y2="${H - pad + 0.5}"/>
    <path class="trazo" pathLength="1" d="${d}"/>
    ${xy.map(([x, y], i) => `<circle class="pt" cx="${x}" cy="${y}" r="3" data-tip="${esc(puntos[i].tip)}"/>`).join('')}
    <text x="${pad}" y="${H + 12}">${esc(puntos[0].et)}</text>
    <text x="${W - pad}" y="${H + 12}" text-anchor="end">${esc(puntos.at(-1).et)}</text></svg>`;
}
