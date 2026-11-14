// Datos, cálculos y formato. Todo elemento tiene id, upd (última edición) y del (borrado),
// para poder combinar dos dispositivos: gana la edición más reciente de cada elemento.

// ---------- IndexedDB (aquí solo entran cosas cifradas o sin datos personales) ----------
let _db;
const db = () => _db ??= new Promise((ok, mal) => {
  const r = indexedDB.open('finanzas', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onsuccess = () => ok(r.result);
  r.onerror = () => mal(r.error);
});
function tx(modo, fn) {
  return db().then(d => new Promise((ok, mal) => {
    const t = d.transaction('kv', modo), r = fn(t.objectStore('kv'));
    t.oncomplete = () => ok(r.result);
    t.onerror = () => mal(t.error);
  }));
}
export const leer = k => tx('readonly', s => s.get(k));
export const escribir = (k, v) => tx('readwrite', s => s.put(v, k));
export const borrarTodo = () => tx('readwrite', s => s.clear());

// ---------- Modelo ----------
export const COLECCIONES = ['movs', 'cats', 'presup', 'metas', 'abonos', 'deudas', 'pagos', 'tcManual', 'tcAuto', 'ajustes', 'alertasCerradas',
  'revisados', 'reglas', 'llaves', 'recurrentes', 'compartidas', 'cierres', 'retos', 'rapidos'];
export const CATS_BASE = [
  ['supermercados', 'Supermercados', 'carrito', '#165E83'],
  ['restaurantes', 'Restaurantes', 'plato', '#F4B3C2'],
  ['gym', 'Gym', 'mancuerna', '#2D6D4B'],
  ['transporte', 'Transporte', 'carro', '#7DB9DE'],
  ['universidad', 'Universidad', 'birrete', '#8B81C3'],
  ['otros', 'Otros', 'puntos', '#828282'],
];
export const COLORES_EXTRA = ['#FFB11B', '#165E83', '#F4B3C2', '#7DB9DE', '#2D6D4B', '#8B81C3'];
export const FUENTES = { beca: 'Beca', trabajo: 'Trabajo', ayuda: 'Ayuda familiar', otro: 'Otro' };
export const MEDIOS = ['Tarjeta', 'SINPE', 'Efectivo'];

export const nuevoId = () => crypto.randomUUID();
export function estadoVacio() { const e = { v: 1 }; for (const c of COLECCIONES) e[c] = {}; return e; }
export function estadoNuevo(nombre, tc) {
  const e = estadoVacio();
  CATS_BASE.forEach(([id, n, icono, color], orden) => poner(e, 'cats', { id, nombre: n, icono, color, orden }));
  poner(e, 'ajustes', { id: 'general', nombre, tema: 'auto', tcTipo: 'venta' });
  if (tc > 0) poner(e, 'tcManual', { id: hoy(), valor: tc });
  return e;
}
export function completar(e) { for (const c of COLECCIONES) e[c] ||= {}; return e; } // datos guardados con una versión anterior
export function poner(e, col, item) { item.upd = Date.now(); delete item.del; e[col][item.id] = item; return item; }
export function quitar(e, col, id) { const it = e[col][id]; if (it) { it.del = true; it.upd = Date.now(); } }
export const lista = (e, col) => Object.values(e[col] || {}).filter(x => !x.del);
export const ajustes = e => e.ajustes.general || {};
export const cats = e => lista(e, 'cats').sort((a, b) => (a.id === 'otros') - (b.id === 'otros') || a.orden - b.orden);

export function combinar(a, b) {
  const r = estadoVacio();
  for (const c of COLECCIONES)
    for (const src of [a[c] || {}, b[c] || {}])
      for (const [id, it] of Object.entries(src))
        if (!r[c][id] || it.upd > r[c][id].upd) r[c][id] = it;
  return r;
}

// ---------- Fechas ----------
export function hoy() { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
export const mesDe = f => f.slice(0, 7);
export function sumarMeses(mes, n) {
  let [y, m] = mes.split('-').map(Number); m += n;
  while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; }
  return `${y}-${String(m).padStart(2, '0')}`;
}
export const mesAnterior = mes => sumarMeses(mes, -1);
export const ultimosMeses = (mes, n) => Array.from({ length: n }, (_, i) => sumarMeses(mes, i - n + 1));
export const diasEnMes = mes => new Date(+mes.slice(0, 4), +mes.slice(5, 7), 0).getDate();
const utc = f => Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10));
export const diasEntre = (a, b) => Math.round((utc(b) - utc(a)) / 864e5);
export const sumarDias = (f, n) => new Date(utc(f) + n * 864e5).toISOString().slice(0, 10);
export const diaSemana = f => new Date(utc(f)).getUTCDay(); // 0 = domingo
const fMes = new Intl.DateTimeFormat('es-CR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const fMesCorto = new Intl.DateTimeFormat('es-CR', { month: 'short', timeZone: 'UTC' });
const fDia = new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fFecha = new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
export const nombreMes = mes => cap(fMes.format(new Date(mes + '-01T00:00:00Z')));
export const mesCorto = mes => fMesCorto.format(new Date(mes + '-01T00:00:00Z')).replace('.', '');
export const fechaCorta = f => fDia.format(new Date(f + 'T00:00:00Z')).replace('.', '');
export const fechaLarga = f => fFecha.format(new Date(f + 'T00:00:00Z')).replace('.', '');

// ---------- Formato de montos ----------
// fr-FR usa espacio como separador de miles y coma decimal: ₡12 500 y $1 250,00
const nCRC = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const nUSD = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signo = n => (Math.round(n * 100) < 0 ? '−' : '');
export const crc = n => signo(n) + '₡' + nCRC.format(Math.abs(Math.round(n)));
export const usd = n => signo(n) + '$' + nUSD.format(Math.abs(n));
export const monto = (n, moneda) => (moneda === 'USD' ? usd(n) : crc(n));
export const tcFmt = n => '₡' + nUSD.format(n); // el tipo de cambio sí lleva decimales: ₡505,20
export const numPlano = (n, moneda) => (moneda === 'USD' ? nUSD : nCRC).format(n);
export function parseMonto(s) {
  let t = String(s ?? '').replace(/[\s  ₡$]/g, '');
  if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '');
  t = t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Tipo de cambio ----------
// Devuelve {valor, fecha, fuente}: el manual de esa fecha si existe; si no, el dato más reciente hasta esa fecha.
export function tcInfo(e, fecha) {
  const tipo = ajustes(e).tcTipo || 'venta';
  const cand = [
    ...lista(e, 'tcManual').map(x => ({ fecha: x.id, valor: x.valor, fuente: 'manual' })),
    ...lista(e, 'tcAuto').map(x => ({ fecha: x.id, valor: x[tipo], fuente: 'BCCR' })),
  ].filter(x => x.valor > 0).sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.fuente === 'manual') - (b.fuente === 'manual'));
  if (!cand.length) return null;
  let r = cand[0];
  for (const c of cand) if (c.fecha <= fecha) r = c;
  return r;
}
export const tcDe = (e, fecha) => tcInfo(e, fecha)?.valor || null;
export const aCRC = x => (x.moneda === 'USD' ? x.monto * (x.tc || 0) : x.monto);

// ---------- Cálculos del mes ----------
const suma = (arr, f = aCRC) => arr.reduce((s, x) => s + f(x), 0);
export const movsMes = (e, mes) => lista(e, 'movs').filter(m => m.fecha.startsWith(mes));

export function resumenMes(e, mes) {
  const movs = movsMes(e, mes).filter(m => m.estado !== 'pendiente');
  // reembolso = pago de una cuenta compartida: no es ingreso ni gasto (el gasto ya se contó al dividir)
  const ingresosM = movs.filter(m => m.tipo === 'ingreso' && !m.reembolso);
  const gastos = movs.filter(m => m.tipo === 'gasto' && !m.reembolso);
  const porCat = {};
  for (const g of gastos) porCat[g.cat] = (porCat[g.cat] || 0) + aCRC(g);
  const r = {
    ingresos: suma(ingresosM),
    gastado: suma(gastos),
    porCat,
    abonos: suma(lista(e, 'abonos').filter(a => a.fecha.startsWith(mes))),
    pagos: suma(lista(e, 'pagos').filter(p => p.fecha.startsWith(mes))),
    sinpeEnv: suma(movs.filter(m => m.tipo === 'gasto' && m.medio === 'SINPE')),
    sinpeRec: suma(movs.filter(m => m.tipo === 'ingreso' && m.medio === 'SINPE')),
    // lo que pagaste por otros (sale de tu bolsa pero no es gasto tuyo) y lo que te devolvieron
    porOtros: suma(lista(e, 'compartidas').filter(c => c.clase === 'cargo' && c.sentido === 'meDeben' && c.fecha.startsWith(mes))),
    reembolsos: suma(movs.filter(m => m.tipo === 'ingreso' && m.reembolso)),
  };
  r.disponible = r.ingresos - r.gastado - r.abonos - r.pagos - (r.porOtros - r.reembolsos);
  return r;
}

// Límite de una categoría: el del mes, o el último que se puso antes (se arrastra mes a mes).
export function limite(e, mes, catId) {
  let r = null;
  for (const p of lista(e, 'presup')) if (p.cat === catId && p.mes <= mes && (!r || p.mes > r.mes)) r = p;
  return r ? r.limite : 0;
}
export const ponerLimite = (e, mes, catId, valor) => poner(e, 'presup', { id: `${mes}|${catId}`, mes, cat: catId, limite: valor });

// ---------- Metas ----------
export const abonosMeta = (e, id) => lista(e, 'abonos').filter(a => a.metaId === id).sort((a, b) => a.fecha.localeCompare(b.fecha));
export const ahorradoMeta = (e, id) => abonosMeta(e, id).reduce((s, a) => s + a.monto, 0);
export function mesesHasta(desde, hasta) {
  const n = (+hasta.slice(0, 4) - +desde.slice(0, 4)) * 12 + (+hasta.slice(5, 7) - +desde.slice(5, 7)) + (hasta.slice(8) >= desde.slice(8) ? 1 : 0);
  return Math.max(1, n);
}
export function estadoMeta(e, m, h = hoy()) {
  const ahorrado = ahorradoMeta(e, m.id), falta = Math.max(0, m.objetivo - ahorrado);
  const r = { ahorrado, falta, pct: m.objetivo ? Math.min(1, ahorrado / m.objetivo) : 0, porMes: null, atrasada: false, esperado: 0 };
  if (m.limite && falta > 0) {
    r.porMes = falta / mesesHasta(h, m.limite);
    const total = diasEntre(m.creada, m.limite), pasado = diasEntre(m.creada, h);
    if (total > 0 && pasado > 0) {
      r.esperado = m.objetivo * Math.min(1, pasado / total);
      r.atrasada = ahorrado < r.esperado - 0.005;
    }
  }
  return r;
}

// ---------- Deudas ----------
export const pagosDeuda = (e, id) => lista(e, 'pagos').filter(p => p.deudaId === id).sort((a, b) => a.fecha.localeCompare(b.fecha));
export const saldoDeuda = (e, d) => Math.max(0, d.total - pagosDeuda(e, d.id).reduce((s, p) => s + p.monto, 0));
export const pagoEnMes = (e, id, mes) => pagosDeuda(e, id).some(p => p.fecha.startsWith(mes));
export function mesesRestantes(saldo, cuota, tasaAnual) {
  if (saldo <= 0) return 0;
  if (!(cuota > 0)) return null;
  const r = (tasaAnual || 0) / 1200;
  if (!r) return Math.ceil(saldo / cuota - 1e-9);
  if (cuota <= saldo * r) return Infinity; // la cuota no alcanza ni para los intereses
  return Math.ceil(-Math.log(1 - (r * saldo) / cuota) / Math.log(1 + r) - 1e-9);
}
export function fechaPagoDeuda(d, mes) {
  return `${mes}-${String(Math.min(d.dia || 1, diasEnMes(mes))).padStart(2, '0')}`;
}

// ---------- Inicio ----------
export function totalAhorrado(e) { return suma(lista(e, 'abonos')); }
export function totalDebo(e, tcHoy) {
  return lista(e, 'deudas').reduce((s, d) => s + saldoDeuda(e, d) * (d.moneda === 'USD' ? tcHoy : 1), 0);
}

// ---------- Gastos recurrentes e ingresos fijos ----------
// {id, clase: 'gasto'|'ingreso', nombre, monto, moneda, cat, fuente, medio, frecuencia, dias: [d] o [d1, d2],
//  diaSemana (semanal), mes (anual), texto (lo que aparece en el correo), desde}
// Cada fecha que toca crea un movimiento con id fijo r-<id>-<fecha>: así dos dispositivos no lo duplican.
export const FRECUENCIAS = { mensual: 'Mensual', quincenal: 'Quincenal', semanal: 'Semanal', anual: 'Anual' };
export const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const tipoRec = r => (r.clase === 'ingreso' ? 'ingreso' : 'gasto');
export const claveRec = (r, f) => `r-${r.id}-${f}`;
export function tocaEl(r, f) {
  const d = +f.slice(8), fin = diasEnMes(mesDe(f)), enMes = x => Math.min(+x || 1, fin) === d; // el 31 cae el último día
  if (r.frecuencia === 'semanal') return diaSemana(f) === +r.diaSemana;
  if (r.frecuencia === 'anual') return +r.mes === +f.slice(5, 7) && enMes(r.dias[0]);
  if (r.frecuencia === 'quincenal') return r.dias.some(enMes);
  return enMes(r.dias[0]);
}
export function fechasRec(r, desde, hasta) {
  const out = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) if (tocaEl(r, f)) out.push(f);
  return out;
}
export const POR_MES = { mensual: 1, quincenal: 2, semanal: 52 / 12, anual: 1 / 12 };
export const mensualRec = r => r.monto * (POR_MES[r.frecuencia] || 1);

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
// Calza: el comercio o la persona contiene el "texto en el correo", monto a 5 % o menos y fecha a 3 días o menos.
export function calzaRec(r, m, f) {
  return !!norm(r.texto) && m.tipo === tipoRec(r) && m.moneda === r.moneda && norm(`${m.quien} ${m.nota}`).includes(norm(r.texto))
    && Math.abs(m.monto - r.monto) <= r.monto * 0.05 + 1e-9 && Math.abs(diasEntre(f, m.fecha)) <= 3;
}
// ¿Ya hay un movimiento confirmado para esa fecha del recurrente?
const tomada = (e, clave, salvo) => {
  const p = e.movs[clave];
  return (p && !p.del && p.estado !== 'pendiente') || lista(e, 'movs').some(x => x.rec === clave && x.id !== clave && x.id !== salvo);
};
// La fecha de un recurrente que calza con un movimiento (del correo o anotado): {r, fecha, clave} o null.
export function recurrenteDe(e, m) {
  if (!m.fecha || !(m.monto > 0) || m.noReconocido) return null;
  let mejor = null;
  for (const r of lista(e, 'recurrentes'))
    for (const f of fechasRec(r, sumarDias(m.fecha, -3), sumarDias(m.fecha, 3))) {
      const clave = claveRec(r, f);
      if (calzaRec(r, m, f) && !tomada(e, clave, m.id) && (!mejor || Math.abs(diasEntre(f, m.fecha)) < Math.abs(diasEntre(mejor.fecha, m.fecha))))
        mejor = { r, fecha: f, clave };
    }
  return mejor;
}
// Crea los pendientes de las fechas que ya llegaron (hasta 2 meses atrás). Si ya hay un movimiento que calza
// (el correo llegó antes), lo une con esa fecha y no crea nada. Devuelve cuántos pendientes creó.
export function generarPendientes(e, h = hoy()) {
  let n = 0;
  const atras = sumarDias(h, -62);
  for (const r of lista(e, 'recurrentes'))
    for (const f of fechasRec(r, r.desde > atras ? r.desde : atras, h)) {
      const clave = claveRec(r, f);
      if (e.movs[clave] || lista(e, 'movs').some(x => x.rec === clave)) continue; // ya está (aunque lo hayas borrado)
      const ya = lista(e, 'movs').find(x => !x.rec && x.estado !== 'pendiente' && calzaRec(r, x, f));
      if (ya) { poner(e, 'movs', { ...ya, rec: clave }); continue; }
      const ing = r.clase === 'ingreso';
      poner(e, 'movs', { id: clave, tipo: tipoRec(r), monto: r.monto, moneda: r.moneda, fecha: f, medio: r.medio, quien: r.nombre, nota: '',
        cat: ing ? null : r.cat, fuente: ing ? r.fuente : null, origen: 'recurrente', estado: 'pendiente', rec: clave, tc: tcDe(e, f) }).upd = 1;
      n++; // upd = 1: si dos dispositivos lo crean es idéntico, y cualquier edición real (confirmar, borrar) le gana
    }
  return n;
}
export const confirmarMov = (e, m) => poner(e, 'movs', { ...m, estado: 'ok', tc: tcDe(e, m.fecha) });

// Lo que pasa en cada día del mes: recurrentes, ingresos fijos y cuotas de deudas.
// estado: 'listo' (pagado o recibido), 'pendiente' (sin confirmar), 'atrasado' (ya pasó y no hay nada) o 'proximo'.
export function eventosMes(e, mes, h = hoy()) {
  const out = {}, fin = `${mes}-${String(diasEnMes(mes)).padStart(2, '0')}`;
  const add = (f, ev) => (out[f] ||= []).push(ev);
  for (const r of lista(e, 'recurrentes'))
    for (const f of fechasRec(r, r.desde > `${mes}-01` ? r.desde : `${mes}-01`, fin)) {
      const clave = claveRec(r, f), p = e.movs[clave] && !e.movs[clave].del ? e.movs[clave] : lista(e, 'movs').find(x => x.rec === clave);
      add(f, { tipo: tipoRec(r), nombre: r.nombre, monto: p?.monto ?? r.monto, moneda: r.moneda,
        estado: p ? (p.estado === 'pendiente' ? 'pendiente' : 'listo') : f < h ? 'atrasado' : 'proximo' });
    }
  for (const d of lista(e, 'deudas')) {
    if (mes < mesDe(d.inicio) || (saldoDeuda(e, d) <= 0 && !pagoEnMes(e, d.id, mes))) continue;
    const f = fechaPagoDeuda(d, mes);
    add(f, { tipo: 'deuda', nombre: d.acreedor, monto: Math.min(d.cuota, saldoDeuda(e, d)) || d.cuota, moneda: d.moneda,
      estado: pagoEnMes(e, d.id, mes) ? 'listo' : f < h ? 'atrasado' : 'proximo' });
  }
  return out;
}

// ---------- Cuentas compartidas ----------
// compartidas: {id, clase: 'cargo'|'abono', sentido: 'meDeben'|'debo', persona, monto, moneda, fecha, movId, concepto, tc}
// cargo = te deben o debés esa plata; abono = pago de esa deuda (va con un movimiento marcado reembolso).
export function mismaPersona(a, b) { // "Ana" ≈ "ANA MARIA SOLANO"; los SINPE cortan nombres ("BRENE" ≈ "Brenes")
  const t = s => norm(s).split(' ').filter(x => x.length >= 2);
  const [x, y] = [t(a), t(b)].sort((p, q) => p.length - q.length);
  const igual = (p, q) => p === q || (Math.min(p.length, q.length) >= 4 && (p.startsWith(q) || q.startsWith(p)));
  return x.length > 0 && x.every(p => y.some(q => igual(p, q)));
}
export function saldosCompartidas(e) {
  const g = {};
  for (const c of lista(e, 'compartidas')) {
    const k = `${c.sentido}|${norm(c.persona)}|${c.moneda}`;
    const x = (g[k] ||= { persona: c.persona, sentido: c.sentido, moneda: c.moneda, saldo: 0, items: [] });
    x.saldo += c.clase === 'cargo' ? c.monto : -c.monto;
    x.items.push(c);
  }
  for (const x of Object.values(g)) { // desde = el cargo más viejo que todavía no está pagado
    x.items.sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.clase === 'abono') - (b.clase === 'abono'));
    let pagado = x.items.filter(c => c.clase === 'abono').reduce((s, c) => s + c.monto, 0);
    x.desde = null;
    for (const c of x.items.filter(c => c.clase === 'cargo')) { if (pagado >= c.monto - 0.005) pagado -= c.monto; else { x.desde = c.fecha; break; } }
    if (x.saldo < 0.005) x.saldo = Math.max(0, x.saldo);
  }
  return Object.values(g);
}
// Un SINPE de alguien que te debe (o a alguien a quien le debés), por un monto igual o menor al saldo.
export function deudaDe(e, m) {
  if (m.medio !== 'SINPE' || !(m.monto > 0) || !m.quien || m.noReconocido) return null;
  const sentido = m.tipo === 'ingreso' ? 'meDeben' : 'debo';
  return saldosCompartidas(e).filter(s => s.sentido === sentido && s.moneda === m.moneda && s.saldo > 0.005 && m.monto <= s.saldo + 0.5
    && mismaPersona(s.persona, m.quien)).sort((a, b) => b.saldo - a.saldo)[0] || null;
}
// Reparte una cuenta. o = {yo, personas, modo: 'iguales'|'distintos', montos: {persona: n}, quienPago, cuantos, miParte}
export function repartir(total, moneda, o) {
  const r = n => (moneda === 'USD' ? Math.round(n * 100) / 100 : Math.round(n));
  if (o.yo) {
    const ps = [...new Map((o.personas || []).map(p => [norm(p), p.trim()])).values()].filter(Boolean);
    if (!ps.length) return { error: 'Escribí con quién dividiste la cuenta' };
    const partes = o.modo === 'distintos' ? ps.map(p => ({ persona: p, monto: o.montos?.[p] }))
      : ps.map(p => ({ persona: p, monto: r(total / (ps.length + 1)) }));
    if (partes.some(p => !(p.monto > 0))) return { error: 'Escribí cuánto le toca a cada persona' };
    const mia = r(total - partes.reduce((s, p) => s + p.monto, 0));
    if (mia < 0) return { error: 'Las partes de los demás suman más que el total' };
    return { yo: true, mia, partes };
  }
  if (!o.quienPago?.trim()) return { error: 'Escribí quién pagó' };
  const mia = o.modo === 'distintos' ? o.miParte : o.cuantos >= 2 ? r(total / o.cuantos) : NaN;
  if (!(mia > 0) || mia > total + 1e-9)
    return { error: o.modo === 'distintos' ? 'Escribí tu parte (no puede ser más que el total)' : 'Escribí entre cuántas personas se dividió (2 o más)' };
  return { yo: false, mia, partes: [{ persona: o.quienPago.trim(), monto: mia }] };
}
// mov tiene el total de la cuenta. Tu parte queda como gasto; lo de los demás va a "Me deben" (o tu parte a "Debo").
export function guardarDividido(e, mov, rep) {
  const sentido = rep.yo ? 'meDeben' : 'debo', tc = mov.tc ?? tcDe(e, mov.fecha);
  for (const p of rep.partes)
    poner(e, 'compartidas', { id: nuevoId(), clase: 'cargo', sentido, persona: p.persona, monto: p.monto, moneda: mov.moneda, fecha: mov.fecha,
      movId: mov.id, concepto: mov.quien || mov.nota || e.cats[mov.cat]?.nombre || '', tc });
  if (!(rep.mia > 0)) { if (e.movs[mov.id]) quitar(e, 'movs', mov.id); return null; } // pagaste todo por otros: no hay gasto tuyo
  return poner(e, 'movs', { ...mov, monto: rep.mia, total: mov.monto, dividido: rep.yo ? 'yo' : rep.partes[0].persona, medio: rep.yo ? mov.medio : '', tc });
}
// Pago de una cuenta compartida: crea el movimiento (reembolso, no cuenta como ingreso ni gasto) y el abono.
export function pagarCompartida(e, sentido, persona, d) {
  const ing = sentido === 'meDeben';
  const mov = poner(e, 'movs', { id: d.id || nuevoId(), tipo: ing ? 'ingreso' : 'gasto', monto: d.monto, moneda: d.moneda, fecha: d.fecha, medio: d.medio,
    quien: d.quien || persona, nota: d.nota || (ing ? `Te pagó lo que te debía` : `Pago de lo que le debías`), cat: null, fuente: null, reembolso: true,
    origen: d.origen || 'manual', correoId: d.correoId, estado: 'ok', tc: tcDe(e, d.fecha) });
  poner(e, 'compartidas', { id: `a-${mov.id}`, clase: 'abono', sentido, persona, monto: d.monto, moneda: d.moneda, fecha: d.fecha, movId: mov.id, tc: mov.tc });
  return mov;
}

// ---------- Gastos hormiga ----------
// Gasto chico (₡3 000 o menos, se cambia en Ajustes) en un comercio que se repite 4 veces o más en el mes.
export function hormiga(e, mes, h = hoy()) {
  const limite = ajustes(e).hormiga ?? 3000, g = {};
  for (const m of movsMes(e, mes))
    if (m.tipo === 'gasto' && m.estado !== 'pendiente' && !m.reembolso && m.quien && aCRC(m) <= limite) {
      const x = (g[norm(m.quien)] ||= { quien: m.quien, n: 0, total: 0 });
      x.n++; x.total += aCRC(m);
    }
  const comercios = Object.values(g).filter(x => x.n >= 4).sort((a, b) => b.total - a.total);
  const total = comercios.reduce((s, x) => s + x.total, 0);
  const dias = mes === mesDe(h) ? +h.slice(8) : diasEnMes(mes); // al mismo ritmo: lo de los días que van, llevado a un año
  return { comercios, total, anual: (total / dias) * 365, limite };
}

// ---------- Cierre de mes ----------
export function calcularCierre(e, mes) {
  const r = resumenMes(e, mes), ant = resumenMes(e, mesAnterior(mes)), hg = hormiga(e, mes, `${mes}-${String(diasEnMes(mes)).padStart(2, '0')}`);
  const top = Object.entries(r.porCat).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([cat, monto]) => ({ cat, nombre: e.cats[cat]?.nombre || 'Otros', monto }));
  const datos = x => ({ ingresos: x.ingresos, gastado: x.gastado, ahorrado: x.abonos, disponible: x.disponible });
  return { id: mes, ...datos(r), top, hormiga: hg.total, hormigaComercios: hg.comercios.map(x => x.quien), antes: datos(ant) };
}
// La primera vez en un mes nuevo: guarda el cierre del mes anterior (id = AAAA-MM, así no se duplica). Devuelve el cierre nuevo o null.
export function cierrePendiente(e, h = hoy()) {
  const mes = mesAnterior(mesDe(h));
  if (e.cierres[mes] || !movsMes(e, mes).some(m => m.estado !== 'pendiente')) return null;
  return poner(e, 'cierres', calcularCierre(e, mes));
}

// ---------- Fondo de emergencia ----------
export const ID_FONDO = 'fondo-emergencia'; // id fijo: se crea una sola vez aunque haya dos dispositivos
export function gastoPromedio(e, h = hoy()) { // promedio de los últimos 3 meses (sin contar meses en cero, por si recién empezás)
  const meses = ultimosMeses(mesAnterior(mesDe(h)), 3).map(m => resumenMes(e, m).gastado).filter(x => x > 0);
  return meses.length ? meses.reduce((s, x) => s + x, 0) / meses.length : resumenMes(e, mesDe(h)).gastado;
}
export function estadoFondo(e, h = hoy()) {
  const f = e.metas[ID_FONDO];
  if (!f || f.del) return null;
  const promedio = gastoPromedio(e, h), saldo = ahorradoMeta(e, ID_FONDO), mesesObjetivo = f.mesesObjetivo || 3;
  const objetivo = promedio * mesesObjetivo;
  return { saldo, promedio, mesesObjetivo, objetivo, meses: promedio > 0 ? saldo / promedio : 0, pct: objetivo > 0 ? Math.min(1, saldo / objetivo) : 0 };
}

// ---------- Reto de 52 semanas ----------
// {id, base, inverso, metaId, inicio}. Cada semana marcada es un abono con id fijo reto-<id>-<n> a la meta escogida.
export const montoSemana = (r, n) => (r.inverso ? 53 - n : n) * r.base;
export const idAbonoReto = (r, n) => `reto-${r.id}-${n}`;
export function estadoReto(e, r, h = hoy()) {
  const marcadas = [];
  for (let n = 1; n <= 52; n++) { const a = e.abonos[idAbonoReto(r, n)]; if (a && !a.del) marcadas.push(n); }
  return { marcadas, ahorrado: marcadas.reduce((s, n) => s + montoSemana(r, n), 0), total: 1378 * r.base,
    semana: Math.min(52, Math.max(1, Math.floor(diasEntre(r.inicio, h) / 7) + 1)) };
}
export function marcarSemana(e, r, n, fecha = hoy()) { // marca o desmarca; devuelve true si quedó marcada
  const id = idAbonoReto(r, n), a = e.abonos[id], meta = e.metas[r.metaId];
  if (a && !a.del) { quitar(e, 'abonos', id); return false; }
  poner(e, 'abonos', { id, metaId: r.metaId, monto: montoSemana(r, n), moneda: meta?.moneda || 'CRC', fecha, tc: tcDe(e, fecha), reto: r.id });
  return true;
}

// ---------- Botones rápidos ----------
// {id, nombre, monto, moneda, cat, medio}. Un toque = un gasto de hoy (el nombre queda como comercio, para los gastos hormiga).
export const usarRapido = (e, b, fecha = hoy()) => poner(e, 'movs', { id: nuevoId(), tipo: 'gasto', monto: b.monto, moneda: b.moneda, fecha, medio: b.medio,
  quien: b.nombre, nota: '', cat: b.cat, fuente: null, origen: 'rapido', estado: 'ok', tc: tcDe(e, fecha) });

// ---------- Exportar ----------
export const COLUMNAS_EXPORT = ['Fecha', 'Tipo', 'Monto', 'Moneda', 'Monto en colones', 'Categoría', 'Medio', 'Comercio o persona', 'Nota'];
export const filasExport = (e, desde, hasta) => lista(e, 'movs').filter(m => m.estado !== 'pendiente' && m.fecha >= desde && m.fecha <= hasta)
  .sort((a, b) => a.fecha.localeCompare(b.fecha))
  .map(m => [m.fecha, m.tipo, m.monto, m.moneda, Math.round(aCRC(m) * 100) / 100,
    m.reembolso ? 'Cuenta compartida' : m.tipo === 'ingreso' ? FUENTES[m.fuente] || 'Ingreso' : e.cats[m.cat]?.nombre || 'Otros',
    m.medio || '', m.quien || '', m.nota || '']);

// (Disponible − lo que falta pagar este mes) ÷ días que quedan contando hoy
export function presupuestoDiario(e, h = hoy()) {
  const mes = mesDe(h), r = resumenMes(e, mes), tc = tcDe(e, h) || 0;
  let falta = 0;
  const fin = `${mes}-${String(diasEnMes(mes)).padStart(2, '0')}`;
  for (const rc of lista(e, 'recurrentes')) // recurrentes que todavía no llegan este mes (los ingresos fijos no se cuentan)
    if (rc.clase !== 'ingreso' && h < fin)
      for (const f of fechasRec(rc, sumarDias(h, 1), fin))
        if (!e.movs[claveRec(rc, f)] && !lista(e, 'movs').some(x => x.rec === claveRec(rc, f))) falta += rc.monto * (rc.moneda === 'USD' ? tc : 1);
  for (const d of lista(e, 'deudas')) {
    const saldo = saldoDeuda(e, d);
    if (saldo > 0 && !pagoEnMes(e, d.id, mes)) falta += Math.min(d.cuota || 0, saldo) * (d.moneda === 'USD' ? tc : 1);
  }
  for (const m of movsMes(e, mes))
    if (m.estado === 'pendiente' && m.tipo === 'gasto') falta += m.monto * (m.moneda === 'USD' ? tc : 1);
  const dias = diasEnMes(mes) - +h.slice(8) + 1;
  const libre = r.disponible - falta;
  return { libre, falta, dias, porDia: libre / dias };
}

// ---------- Alertas ----------
// La clave incluye el nivel o el mes: si la situación cambia, la alerta cerrada vuelve a salir.
export function alertas(e, h = hoy()) {
  const mes = mesDe(h), r = resumenMes(e, mes), out = [];
  for (const c of cats(e)) {
    const lim = limite(e, mes, c.id), g = r.porCat[c.id] || 0;
    if (!lim) continue;
    if (g >= lim) out.push({ clave: `cat|${mes}|${c.id}|rojo`, nivel: 'rojo', texto: `${c.nombre}: ${g > lim ? 'te pasaste del' : 'llegaste al'} límite (${crc(g)} de ${crc(lim)})` });
    else if (g >= 0.8 * lim) out.push({ clave: `cat|${mes}|${c.id}|amarillo`, nivel: 'amarillo', texto: `${c.nombre}: ya usaste el ${Math.floor((g / lim) * 100)} % del límite` });
  }
  if (r.gastado > r.ingresos && r.gastado > 0)
    out.push({ clave: `sobre|${mes}`, nivel: 'rojo', texto: `Este mes llevás gastado más de lo que entró (${crc(r.gastado)} contra ${crc(r.ingresos)})` });
  for (const d of lista(e, 'deudas')) {
    if (saldoDeuda(e, d) <= 0 || pagoEnMes(e, d.id, mes)) continue;
    const faltan = diasEntre(h, fechaPagoDeuda(d, mes));
    if (faltan >= 0 && faltan <= 3)
      out.push({ clave: `deuda|${d.id}|${mes}`, nivel: 'amarillo', texto: `Pago a ${d.acreedor} ${faltan === 0 ? 'hoy' : faltan === 1 ? 'mañana' : `en ${faltan} días`} (${monto(d.cuota, d.moneda)})` });
  }
  for (const m of lista(e, 'metas')) {
    const s = estadoMeta(e, m, h);
    if (s.atrasada)
      out.push({ clave: `meta|${m.id}|${mes}`, nivel: 'amarillo', texto: `Meta "${m.nombre}" va atrasada: deberías llevar ${monto(s.esperado, m.moneda)} y llevás ${monto(s.ahorrado, m.moneda)}` });
  }
  for (const s of saldosCompartidas(e))
    if (s.sentido === 'meDeben' && s.saldo > 0.005 && s.desde && diasEntre(s.desde, h) > 15)
      out.push({ clave: `debe|${norm(s.persona)}|${s.desde}`, nivel: 'amarillo', texto: `${s.persona} te debe ${monto(s.saldo, s.moneda)} desde hace ${diasEntre(s.desde, h)} días` });
  for (const m of lista(e, 'movs'))
    if (m.estado === 'pendiente' && m.rec && m.fecha < h)
      out.push({ clave: `pend|${m.id}`, nivel: 'amarillo', texto: `${m.quien}: ${m.tipo === 'ingreso' ? 'el ingreso' : 'el pago'} del ${fechaCorta(m.fecha)} sigue pendiente de confirmar` });
  return out.filter(a => !e.alertasCerradas[a.clave] || e.alertasCerradas[a.clave].del);
}

// ---------- Movimientos del correo ----------
// El Action manda {id, ids?, origen, tipo, medio, monto, moneda, fecha, hora, quien, nota, cat, fuente, confirmar}
// o {id, noReconocido, remitente, asunto, fecha}. Aquí se decide qué falta revisar y qué sugerir.
export const claveRegla = (tipo, quien) => `${tipo === 'ingreso' ? 'i' : 'g'}|${String(quien || '').toUpperCase().replace(/\s+/g, ' ').trim()}`;
const idsCorreo = m => m.ids || [m.id];
export const revisado = (e, m) => idsCorreo(m).some(id => e.revisados[id] && !e.revisados[id].del);
export const pendientesCorreo = (e, movs) => (movs || []).filter(m => !revisado(e, m));

// Sugerencia del Action (o el nombre de categoría que vino de Siri), con las reglas aprendidas encima.
function sugerenciaBase(e, m) {
  if (m.tipo === 'ingreso') return m.fuente && FUENTES[m.fuente] ? m.fuente : 'otro';
  if (m.cat && e.cats[m.cat] && !e.cats[m.cat].del) return m.cat;
  const n = String(m.cat || '').trim().toLowerCase();
  return cats(e).find(c => c.nombre.toLowerCase() === n)?.id || 'otros';
}
export function sugerirCorreo(e, m) {
  const rc = recurrenteDe(e, m); // si es un recurrente o ingreso fijo, va en su categoría
  if (rc) { const v = m.tipo === 'ingreso' ? rc.r.fuente : rc.r.cat; if (m.tipo === 'ingreso' ? FUENTES[v] : e.cats[v] && !e.cats[v].del) return v; }
  const dd = deudaDe(e, m); // SINPE de alguien que te debe, o a alguien a quien le debés
  if (dd) return `deuda:${dd.persona}`;
  const regla = m.quien ? e.reglas[claveRegla(m.tipo, m.quien)] : null;
  const valido = regla && !regla.del && (m.tipo === 'ingreso' ? FUENTES[regla.valor] : e.cats[regla.valor] && !e.cats[regla.valor].del);
  return valido ? regla.valor : sugerenciaBase(e, m);
}

// Aplica la revisión: {descartar, monto, valor (cat o fuente)}. Devuelve el movimiento creado o null.
export function aplicarRevision(e, m, { descartar, monto, valor }) {
  const accion = descartar || m.noReconocido ? 'descartado' : 'aceptado';
  for (const id of idsCorreo(m)) poner(e, 'revisados', { id, accion });
  if (accion === 'descartado') return null;
  const ing = m.tipo === 'ingreso', origen = m.origen === 'siri' ? 'siri' : 'correo';
  if (String(valor).startsWith('deuda:')) // pago de una cuenta compartida: no es ingreso ni gasto
    return pagarCompartida(e, ing ? 'meDeben' : 'debo', valor.slice(6), { id: `c-${m.id}`, monto: monto > 0 ? monto : m.monto, moneda: m.moneda,
      fecha: m.fecha, medio: m.medio, quien: m.quien, nota: m.nota, origen, correoId: m.id });
  const rc = recurrenteDe(e, m), sug = sugerirCorreo(e, m);
  if (m.quien && !rc && valor !== sug && !sug.startsWith('deuda:')) poner(e, 'reglas', { id: claveRegla(m.tipo, m.quien), valor }); // aprende
  const mov = {
    id: `c-${m.id}`, tipo: m.tipo, monto: monto > 0 ? monto : m.monto, moneda: m.moneda, fecha: m.fecha, medio: m.medio,
    quien: m.quien || '', nota: m.nota || '', cat: ing ? null : valor, fuente: ing ? valor : null,
    origen: m.origen === 'siri' ? 'siri' : 'correo', correoId: m.id, estado: 'ok', tc: tcDe(e, m.fecha),
  };
  if (rc) { // se une con el pendiente del recurrente (o queda marcado para que no se cree después)
    mov.rec = rc.clave;
    const p = e.movs[rc.clave];
    if (p && !p.del) return poner(e, 'movs', { ...mov, id: p.id, quien: p.quien || mov.quien, nota: mov.nota || p.nota });
  }
  return poner(e, 'movs', mov);
}

// ¿Se puede anotar sin preguntar? Sí: ingresos (SINPE recibido), lo que vino de Siri, y gastos con regla aprendida
// o categoría clara. No: lo dudoso (Uber sin recibo, recibo de Uber sin cobro del banco, categoría "otros")
// ni lo que se parece a algo que ya anotaste a mano (mismo monto, ±1 día), para no duplicar.
export function claroCorreo(e, m) {
  if (m.noReconocido || !(m.monto > 0) || !m.fecha) return false;
  if (recurrenteDe(e, m)) return true; // calza con un recurrente o ingreso fijo: se une con su pendiente
  const dd = deudaDe(e, m); // pagarle a quien le debés se marca solo; lo que te pagan a vos pasa por la revisión
  if (dd) return dd.sentido === 'debo';
  if (m.confirmar || m.origen === 'uber') return false;
  const repetido = lista(e, 'movs').some(x => x.origen !== 'correo' && x.origen !== 'siri' && x.tipo === m.tipo
    && x.moneda === m.moneda && Math.abs(x.monto - m.monto) < 0.5 && Math.abs(diasEntre(x.fecha, m.fecha)) <= 1);
  if (repetido) return false;
  if (m.tipo === 'ingreso' || m.origen === 'siri') return true;
  return sugerirCorreo(e, m) !== 'otros';
}
// Anota de una vez los movimientos claros; devuelve cuántos.
export function anotarClaros(e, movs) {
  const claros = pendientesCorreo(e, movs).filter(m => claroCorreo(e, m));
  for (const m of claros) aplicarRevision(e, m, { valor: sugerirCorreo(e, m) });
  return claros.length;
}

// tipo_cambio.json del Action: {fecha: {compra, venta}}. Solo agrega fechas nuevas; devuelve cuáles.
export function agregarTcAuto(e, tabla) {
  const nuevas = [];
  for (const [fecha, v] of Object.entries(tabla || {}))
    if (/^\d{4}-\d{2}-\d{2}$/.test(fecha) && v?.venta > 0 && v?.compra > 0 && !e.tcAuto[fecha]) {
      poner(e, 'tcAuto', { id: fecha, compra: +v.compra, venta: +v.venta });
      nuevas.push(fecha);
    }
  return nuevas;
}
