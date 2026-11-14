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
  'revisados', 'reglas', 'llaves', 'recurrentes'];
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
  const ingresosM = movs.filter(m => m.tipo === 'ingreso' && !m.reembolso);
  const gastos = movs.filter(m => m.tipo === 'gasto');
  const porCat = {};
  for (const g of gastos) porCat[g.cat] = (porCat[g.cat] || 0) + aCRC(g);
  const r = {
    ingresos: suma(ingresosM),
    gastado: suma(gastos),
    porCat,
    abonos: suma(lista(e, 'abonos').filter(a => a.fecha.startsWith(mes))),
    pagos: suma(lista(e, 'pagos').filter(p => p.fecha.startsWith(mes))),
    sinpeEnv: suma(gastos.filter(m => m.medio === 'SINPE')),
    sinpeRec: suma(movs.filter(m => m.tipo === 'ingreso' && m.medio === 'SINPE')),
    porOtros: 0, reembolsos: 0, // cuentas compartidas: llegan en la etapa 4
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
  const regla = m.quien ? e.reglas[claveRegla(m.tipo, m.quien)] : null;
  const valido = regla && !regla.del && (m.tipo === 'ingreso' ? FUENTES[regla.valor] : e.cats[regla.valor] && !e.cats[regla.valor].del);
  return valido ? regla.valor : sugerenciaBase(e, m);
}

// Aplica la revisión: {descartar, monto, valor (cat o fuente)}. Devuelve el movimiento creado o null.
export function aplicarRevision(e, m, { descartar, monto, valor }) {
  const accion = descartar || m.noReconocido ? 'descartado' : 'aceptado';
  for (const id of idsCorreo(m)) poner(e, 'revisados', { id, accion });
  if (accion === 'descartado') return null;
  const rc = recurrenteDe(e, m);
  if (m.quien && !rc && valor !== sugerirCorreo(e, m)) poner(e, 'reglas', { id: claveRegla(m.tipo, m.quien), valor }); // aprende
  const ing = m.tipo === 'ingreso';
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
