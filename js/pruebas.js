// Pruebas de los cálculos, el formato y el cifrado. Abrir pruebas.html en el navegador.
import * as D from './datos.js';
import * as C from './cripto.js';
import * as X from './exportar.js';

const out = document.getElementById('out');
let fallos = 0;
const esp = s => s.replace(/[  ]/g, ' ');
function ok(nombre, cond, detalle = '') {
  if (!cond) fallos++;
  out.insertAdjacentHTML('beforeend', `<li class="${cond ? 'ok' : 'mal'}">${cond ? '✔' : '✘'} ${nombre} ${cond ? '' : detalle}</li>`);
}
const igual = (nombre, a, b) => ok(nombre, Math.abs(a - b) < 0.01, `(dio ${a}, esperaba ${b})`);

// Formato
ok('₡12 500', esp(D.crc(12500)) === '₡12 500', esp(D.crc(12500)));
ok('$1 250,00', esp(D.usd(1250)) === '$1 250,00', esp(D.usd(1250)));
ok('negativo', esp(D.crc(-3000)) === '−₡3 000', esp(D.crc(-3000)));
igual('leer "3 500"', D.parseMonto('3 500'), 3500);
igual('leer "12,50"', D.parseMonto('12,50'), 12.5);
igual('leer "1.250,75"', D.parseMonto('1.250,75'), 1250.75);
igual('leer "1.500" como mil quinientos', D.parseMonto('1.500'), 1500);
igual('leer "1,500" como mil quinientos', D.parseMonto('1,500'), 1500);
igual('leer "1,250.75"', D.parseMonto('1,250.75'), 1250.75);
igual('leer "12 500,5"', D.parseMonto('12 500,5'), 12500.5);
ok('leer basura = NaN', Number.isNaN(D.parseMonto('abc')));

// Fechas
ok('mes anterior de enero', D.mesAnterior('2026-01') === '2025-12');
ok('días de febrero 2028', D.diasEnMes('2028-02') === 29);
ok('6 meses', D.ultimosMeses('2026-03', 6).join() === '2025-10,2025-11,2025-12,2026-01,2026-02,2026-03');

// Tipo de cambio
const e = D.estadoNuevo('Prueba', 0);
D.poner(e, 'tcAuto', { id: '2026-11-01', compra: 500, venta: 510 });
D.poner(e, 'tcAuto', { id: '2026-11-10', compra: 502, venta: 512 });
D.poner(e, 'tcManual', { id: '2026-11-10', valor: 520 });
igual('TC del día sin dato usa el anterior', D.tcDe(e, '2026-11-05'), 510);
igual('TC manual gana el mismo día', D.tcDe(e, '2026-11-10'), 520);
igual('TC antes del primer dato usa el primero', D.tcDe(e, '2026-10-01'), 510);
D.poner(e, 'ajustes', { ...D.ajustes(e), tcTipo: 'compra' });
igual('TC de compra si se elige', D.tcDe(e, '2026-11-05'), 500);
D.poner(e, 'ajustes', { ...D.ajustes(e), tcTipo: 'venta' });

// Totales del mes
const mov = (x) => D.poner(e, 'movs', { id: D.nuevoId(), estado: 'ok', medio: 'Tarjeta', ...x });
mov({ tipo: 'ingreso', fuente: 'beca', monto: 100000, moneda: 'CRC', fecha: '2026-11-02' });
mov({ tipo: 'ingreso', fuente: 'otro', monto: 20000, moneda: 'CRC', fecha: '2026-11-03', medio: 'SINPE' });
mov({ tipo: 'gasto', cat: 'restaurantes', monto: 20000, moneda: 'CRC', fecha: '2026-11-04' });
mov({ tipo: 'gasto', cat: 'supermercados', monto: 10, moneda: 'USD', tc: 500, fecha: '2026-11-05' });
mov({ tipo: 'gasto', cat: 'restaurantes', monto: 3500, moneda: 'CRC', fecha: '2026-11-06', medio: 'SINPE' });
mov({ tipo: 'gasto', cat: 'gym', monto: 15000, moneda: 'CRC', fecha: '2026-11-07', estado: 'pendiente' });
mov({ tipo: 'gasto', cat: 'gym', monto: 99999, moneda: 'CRC', fecha: '2026-10-07' });
D.poner(e, 'metas', { id: 'm1', nombre: 'Laptop', objetivo: 100000, moneda: 'CRC', creada: '2026-11-01', limite: '2026-12-31' });
D.poner(e, 'abonos', { id: 'a1', metaId: 'm1', monto: 5000, moneda: 'CRC', fecha: '2026-11-08' });
D.poner(e, 'deudas', { id: 'd1', acreedor: 'Mamá', total: 30000, moneda: 'CRC', cuota: 10000, dia: 15, tasa: 0, inicio: '2026-10-01' });
D.poner(e, 'pagos', { id: 'p1', deudaId: 'd1', monto: 3000, moneda: 'CRC', fecha: '2026-11-09' });
const r = D.resumenMes(e, '2026-11');
igual('ingresos', r.ingresos, 120000);
igual('gastado (sin pendientes ni otros meses)', r.gastado, 28500);
igual('gasto en dólares convertido con su TC', r.porCat.supermercados, 5000);
igual('abonos del mes', r.abonos, 5000);
igual('pagos del mes', r.pagos, 3000);
igual('lo que sobró o faltó del mes pasado', r.arrastre, -99999);
igual('disponible solo del mes (lo anterior va aparte)', r.disponible, 120000 - 28500 - 5000 - 3000);
igual('SINPE enviados', r.sinpeEnv, 3500);
igual('SINPE recibidos', r.sinpeRec, 20000);
igual('total ahorrado', D.totalAhorrado(e), 5000);
igual('total que debo', D.totalDebo(e, 510), 27000);

// Presupuesto diario el 2026-11-13. La deuda d1 ya tiene un pago este mes, así que no se resta su cuota.
igual('presupuesto diario (deuda ya pagada este mes)', D.presupuestoDiario(e, '2026-11-13').porDia, (83500 - 15000) / 18);
// Deuda sin pago este mes: su cuota sí se resta y avisa 2 días antes
D.poner(e, 'deudas', { id: 'd2', acreedor: 'Banco', total: 50000, moneda: 'CRC', cuota: 10000, dia: 15, tasa: 0, inicio: '2026-10-01' });
igual('presupuesto diario (resta cuota pendiente)', D.presupuestoDiario(e, '2026-11-13').porDia, (83500 - 15000 - 10000) / 18);
D.poner(e, 'deudas', { id: 'd3', acreedor: 'Futura', total: 50000, moneda: 'CRC', cuota: 7000, dia: 14, tasa: 0, inicio: '2027-01-01' });
igual('deuda que empieza en otro mes no se resta', D.presupuestoDiario(e, '2026-11-13').porDia, (83500 - 15000 - 10000) / 18);
ok('deuda que empieza en otro mes no avisa', !D.alertas(e, '2026-11-13').some(a => a.clave.startsWith('deuda|d3')));
D.quitar(e, 'deudas', 'd3');
ok('lo de meses anteriores no dispara la alerta del mes', !D.alertas(e, '2026-11-13').some(a => a.clave === 'sobre|2026-11'));

// Límites y alertas
D.ponerLimite(e, '2026-10', 'restaurantes', 25000);
igual('límite se arrastra al mes siguiente', D.limite(e, '2026-11', 'restaurantes'), 25000);
let al = D.alertas(e, '2026-11-13');
ok('alerta amarilla al 94 %', al.some(a => a.clave === 'cat|2026-11|restaurantes|amarillo'));
ok('alerta de pago de deuda (faltan 2 días)', al.some(a => a.clave === 'deuda|d2|2026-11') && !al.some(a => a.clave === 'deuda|d1|2026-11'), JSON.stringify(al));
ok('alerta meta atrasada', al.some(a => a.clave === 'meta|m1|2026-11'));
D.poner(e, 'alertasCerradas', { id: 'cat|2026-11|restaurantes|amarillo' });
mov({ tipo: 'gasto', cat: 'restaurantes', monto: 5000, moneda: 'CRC', fecha: '2026-11-10' });
al = D.alertas(e, '2026-11-13');
ok('alerta cerrada vuelve como roja si cambia', al.some(a => a.clave === 'cat|2026-11|restaurantes|rojo') && !al.some(a => a.nivel === 'amarillo' && a.clave.startsWith('cat|')));

// Deudas y metas
ok('meses sin interés', D.mesesRestantes(1000, 100, 0) === 10);
ok('meses con interés 24 % (11,3 → 12)', D.mesesRestantes(100000, 10000, 24) === 12, D.mesesRestantes(100000, 10000, 24));
ok('cuota menor al interés = nunca', D.mesesRestantes(100000, 1000, 24) === Infinity);
igual('meta: por mes hasta diciembre', D.estadoMeta(e, e.metas.m1, '2026-11-13').porMes, 95000 / 2);

// Combinar dos dispositivos
const a = D.estadoNuevo('A', 500), b = JSON.parse(JSON.stringify(a));
D.poner(a, 'movs', { id: 'x', monto: 1, fecha: '2026-11-01' });
D.poner(b, 'movs', { id: 'y', monto: 2, fecha: '2026-11-01' });
b.cats.gym.upd = a.cats.gym.upd + 10; b.cats.gym.nombre = 'Gimnasio';
D.quitar(a, 'cats', 'universidad'); a.cats.universidad.upd = b.cats.universidad.upd + 10;
const ab = D.combinar(a, b), ba = D.combinar(b, a);
ok('combinar conserva los dos movimientos', ab.movs.x && ab.movs.y);
ok('combinar: gana la edición más reciente', ab.cats.gym.nombre === 'Gimnasio');
ok('combinar: el borrado se sincroniza', ab.cats.universidad.del === true);
const canon = o => JSON.stringify(o, (k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v);
ok('combinar da lo mismo en cualquier orden', canon(ab) === canon(ba));

// Cifrado
const mk = await C.nuevaLlaveMaestra();
const w = await C.envolverConContrasena(mk, 'contraseña-1');
ok('PBKDF2 con 600 000 iteraciones', w.iter >= 600000);
const sobre = await C.cifrar(mk, { hola: 'mundo', n: 1 });
ok('el texto cifrado no contiene el dato', !atob(sobre.ct).includes('mundo'));
let fallo = false; try { await C.abrirConContrasena(w, 'otra'); } catch { fallo = true; }
ok('contraseña incorrecta no abre', fallo);
const mk2 = await C.abrirConContrasena(w, 'contraseña-1');
ok('contraseña correcta abre y descifra', (await C.descifrar(mk2, sobre)).hola === 'mundo');
const w2 = await C.envolverConContrasena(mk2, 'contraseña-2');
ok('tras cambiar la contraseña se leen los mismos datos', (await C.descifrar(await C.abrirConContrasena(w2, 'contraseña-2'), sobre)).n === 1);

// ---------- Sincronización con un GitHub falso (en memoria) ----------
const S = await import('./sync.js');
const repo = { content: null, sha: null, n: 0, antesDePut: null, puts: 0 };
const resp = (status, j) => new Response(JSON.stringify(j), { status });
const fetchReal = globalThis.fetch;
globalThis.fetch = async (url, op = {}) => {
  const metodo = op.method || 'GET';
  if (op.headers.Authorization !== 'Bearer tok') return resp(401, {});
  if (url.endsWith('/repos/yo/finanzas-datos')) return resp(200, {});
  if (!url.endsWith('/repos/yo/finanzas-datos/contents/estado.enc')) return resp(404, {});
  if (metodo === 'GET') return repo.content ? resp(200, { sha: repo.sha, encoding: 'base64', content: repo.content }) : resp(404, {});
  const b = JSON.parse(op.body);
  if (repo.antesDePut) { const f = repo.antesDePut; repo.antesDePut = null; await f(); }
  if ((b.sha || null) !== repo.sha) return resp(409, {});
  repo.content = b.content; repo.sha = 's' + ++repo.n; repo.puts++;
  return resp(200, { content: { sha: repo.sha } });
};
try {
  const cfg = { token: 'tok', repo: 'yo/finanzas-datos' };
  const mkS = await C.nuevaLlaveMaestra();
  const llaveA = await C.envolverConContrasena(mkS, 'clave-a');
  let A = D.estadoNuevo('Yo', 500);
  D.poner(A, 'movs', { id: 'a1', tipo: 'gasto', cat: 'gym', monto: 1000, moneda: 'CRC', fecha: '2026-11-01' });
  // Dispositivo A sube primero
  let r = await S.sincronizar(cfg, mkS, A, llaveA); A = r.e;
  ok('sync: primera subida crea estado.enc', repo.sha === 's1');
  // Dispositivo B "trae los datos": baja y abre con la contraseña
  const bajado = await S.bajar(cfg);
  const mkB = await C.abrirConContrasena(bajado.sobre.llave, 'clave-a');
  let B = await C.descifrar(mkB, bajado.sobre.datos);
  ok('sync: el otro dispositivo abre con la misma contraseña', B.movs.a1.monto === 1000);
  // Cada uno cambia algo distinto
  D.poner(A, 'movs', { id: 'a2', tipo: 'gasto', cat: 'gym', monto: 2000, moneda: 'CRC', fecha: '2026-11-02' });
  D.poner(B, 'movs', { id: 'b1', tipo: 'gasto', cat: 'otros', monto: 3000, moneda: 'CRC', fecha: '2026-11-03' });
  D.quitar(B, 'movs', 'a1');
  r = await S.sincronizar(cfg, mkS, A, llaveA); A = r.e;
  r = await S.sincronizar(cfg, mkB, B, bajado.sobre.llave); B = r.e;
  r = await S.sincronizar(cfg, mkS, A, llaveA); A = r.e;
  ok('sync: A tiene lo de B y B lo de A', A.movs.b1 && B.movs.a2 && A.movs.a2);
  ok('sync: el borrado hecho en B llega a A', A.movs.a1.del === true);
  ok('sync: los dos quedan iguales', S.huella(A) === S.huella(B));
  const puts = repo.puts;
  await S.sincronizar(cfg, mkS, A, llaveA);
  ok('sync: si no hay cambios no sube nada', repo.puts === puts);
  // Choque (409): otro dispositivo guarda justo entre la bajada y la subida
  D.poner(A, 'movs', { id: 'a3', tipo: 'gasto', cat: 'gym', monto: 4000, moneda: 'CRC', fecha: '2026-11-04' });
  D.poner(B, 'movs', { id: 'b2', tipo: 'gasto', cat: 'gym', monto: 5000, moneda: 'CRC', fecha: '2026-11-05' });
  repo.antesDePut = async () => { const x = await S.sincronizar(cfg, mkB, B, bajado.sobre.llave); B = x.e; };
  r = await S.sincronizar(cfg, mkS, A, llaveA); A = r.e;
  const final = await C.descifrar(mkS, (await S.bajar(cfg)).sobre.datos);
  ok('sync: tras un choque 409 se combina y no se pierde nada', final.movs.a3 && final.movs.b2);
  // Cambio de contraseña en A: B adopta la llave nueva
  const llaveNueva = await C.envolverConContrasena(mkS, 'clave-nueva');
  await S.sincronizar(cfg, mkS, A, llaveNueva);
  r = await S.sincronizar(cfg, mkB, B, bajado.sobre.llave);
  ok('sync: el otro dispositivo recibe la contraseña nueva', r.llave.ct === llaveNueva.ct);
  ok('sync: la contraseña nueva abre en el otro dispositivo', !!(await C.abrirConContrasena(r.llave, 'clave-nueva')));
  // Datos de otra instalación (otra llave maestra): no se tocan
  let error = null;
  try { await S.sincronizar(cfg, await C.nuevaLlaveMaestra(), D.estadoNuevo('Otro', 1), llaveA); } catch (e) { error = e; }
  ok('sync: datos con otra llave dan error y no se sobrescriben', error?.tipo === 'llave');
  error = null;
  try { await S.sincronizar({ ...cfg, token: 'malo' }, mkS, A, llaveA); } catch (e) { error = e; }
  ok('sync: token inválido da un error claro', error?.tipo === 'token');
  ok('sync: en GitHub no se ve ningún dato', !/"(gym|monto|movs|Yo)"/.test(atob(repo.content)));
} finally { globalThis.fetch = fetchReal; }

// Correo: lo que cifra el Action (Python) lo abre la app (Web Crypto). prueba_correo.json lo genera
// finanzas-datos/scripts/prueba_importar.py con una llave y datos de prueba.
{
  const fx = await (await fetch('js/prueba_correo.json', { cache: 'no-store' })).json();
  const lista = await C.abrirCorreo(fx.priv, fx.sobre);
  ok('correo: la app descifra lo que cifró Python', lista.movs.length === fx.movs, `(${lista.movs.length} de ${fx.movs})`);
  const eats = lista.movs.find(m => m.quien === 'Uber Eats');
  ok('correo: el cobro de Uber Eats quedó unido con su recibo', eats?.ids?.length === 2 && eats.cat === 'restaurantes');
  ok('correo: el recibo de Uber no sale repetido', !lista.movs.some(m => m.origen === 'uber'));

  const par = await C.nuevoParCorreo();
  ok('correo: la llave pública es RSA de 4096', C.deb64(par.pub).length > 540);

  const ec = D.estadoNuevo('Correo', 500);
  const g = { id: 'x1', origen: 'bac', tipo: 'gasto', medio: 'Tarjeta', monto: 2500, moneda: 'CRC', fecha: '2026-11-10', quien: 'SODA TICA', cat: 'restaurantes' };
  const s = { id: 'x2', origen: 'siri', tipo: 'gasto', medio: 'Efectivo', monto: 1000, moneda: 'CRC', fecha: '2026-11-10', quien: '', cat: 'gym' };
  const i = { id: 'x3', ids: ['x3', 'x9'], origen: 'kash', tipo: 'ingreso', medio: 'SINPE', monto: 5000, moneda: 'CRC', fecha: '2026-11-11', quien: 'ANA', fuente: 'otro' };
  const nr = { id: 'x4', noReconocido: true, remitente: 'banco', asunto: '?', fecha: '2026-11-11' };
  ok('correo: 4 pendientes', D.pendientesCorreo(ec, [g, s, i, nr]).length === 4);
  ok('correo: categoría por nombre (Siri)', D.sugerirCorreo(ec, { ...s, cat: 'Gym' }) === 'gym');
  const mov = D.aplicarRevision(ec, g, { monto: 2600, valor: 'supermercados' });
  ok('correo: se guarda con el monto editado y la marca "desde correo"', mov.monto === 2600 && mov.origen === 'correo' && mov.cat === 'supermercados');
  ok('correo: aprendió la categoría del comercio', D.sugerirCorreo(ec, { ...g, id: 'x5' }) === 'supermercados');
  ok('correo: lo de Siri lleva su marca', D.aplicarRevision(ec, s, { valor: 'gym' }).origen === 'siri');
  ok('correo: descartar no crea movimiento', D.aplicarRevision(ec, i, { descartar: true }) === null && !ec.movs['c-x3']);
  ok('correo: un correo con dos IDs queda revisado por cualquiera', D.revisado(ec, { id: 'x9' }));
  D.aplicarRevision(ec, nr, {});
  ok('correo: nada vuelve a aparecer', D.pendientesCorreo(ec, [g, s, i, nr]).length === 0);
  ok('correo: nunca se importa dos veces (mismo id)', D.lista(ec, 'movs').filter(m => m.correoId === 'x1').length === 1);
  const ea = D.estadoNuevo('Solos', 500);
  D.poner(ea, 'movs', { id: 'm1', tipo: 'gasto', monto: 3000, moneda: 'CRC', fecha: '2026-11-10', medio: 'Efectivo', cat: 'otros', estado: 'ok' });
  const base = { tipo: 'gasto', medio: 'Tarjeta', moneda: 'CRC', fecha: '2026-11-11', origen: 'bac' };
  const claros = [
    { ...base, id: 'a1', monto: 4000, quien: 'PALI', cat: 'supermercados' },              // se anota solo
    { ...base, id: 'a2', monto: 900, quien: 'TIENDA X', cat: 'otros' },                   // categoría dudosa
    { ...base, id: 'a3', monto: 1500, quien: 'Uber', cat: 'transporte', confirmar: true }, // ¿viaje o Eats?
    { ...base, id: 'a4', monto: 3000, quien: 'SODA', cat: 'restaurantes' },               // igual a uno anotado a mano
    { ...base, id: 'a5', monto: 2000, quien: 'Uber Eats', cat: 'restaurantes', origen: 'uber' }, // recibo sin cobro
    { ...base, id: 'a6', tipo: 'ingreso', medio: 'SINPE', monto: 6000, quien: 'MARIA', fuente: 'otro', origen: 'bac-sinpe' },
  ];
  ok('correo: anota solos solo los claros (compra con categoría y SINPE recibido)', D.anotarClaros(ea, claros) === 2
    && ea.movs['c-a1']?.cat === 'supermercados' && ea.movs['c-a6']?.tipo === 'ingreso');
  ok('correo: lo dudoso queda para revisar', D.pendientesCorreo(ea, claros).map(m => m.id).join() === 'a2,a3,a4,a5');
  ok('correo: anotar solos no inventa reglas', !Object.keys(ea.reglas).length);
  ok('correo: con regla aprendida también se anota solo',
    (D.poner(ea, 'reglas', { id: D.claveRegla('gasto', 'TIENDA X'), valor: 'gym' }), D.anotarClaros(ea, claros) === 1 && ea.movs['c-a2'].cat === 'gym'));
  // ---- Recurrentes e ingresos fijos ----
  const fr = (frecuencia, x) => ({ frecuencia, dias: [1], ...x });
  ok('recurrente: el día 31 cae el último día de febrero', D.fechasRec(fr('mensual', { dias: [31] }), '2027-02-01', '2027-02-28').join() === '2027-02-28');
  ok('recurrente: quincenal 15 y 30 en febrero', D.fechasRec(fr('quincenal', { dias: [15, 30] }), '2027-02-01', '2027-02-28').join() === '2027-02-15,2027-02-28');
  ok('recurrente: semanal los lunes', D.fechasRec(fr('semanal', { diaSemana: 1 }), '2026-11-01', '2026-11-30').length === 5);
  ok('recurrente: anual solo en su mes', D.fechasRec(fr('anual', { dias: [10], mes: 3 }), '2026-01-01', '2026-12-31').join() === '2026-03-10');

  const er = D.estadoNuevo('Rec', 500);
  const spot = D.poner(er, 'recurrentes', { id: 'spot', clase: 'gasto', nombre: 'Spotify', monto: 2500, moneda: 'CRC', cat: 'otros', medio: 'Tarjeta',
    frecuencia: 'mensual', dias: [10], texto: 'spotify', desde: '2026-11-01' });
  D.poner(er, 'recurrentes', { id: 'beca', clase: 'ingreso', nombre: 'Beca', monto: 60000, moneda: 'CRC', fuente: 'beca', medio: 'SINPE',
    frecuencia: 'mensual', dias: [5], texto: 'Universidad Prueba', desde: '2026-11-01' });
  D.poner(er, 'recurrentes', { id: 'cel', clase: 'gasto', nombre: 'Plan celular', monto: 9000, moneda: 'CRC', cat: 'otros', medio: 'Tarjeta',
    frecuencia: 'mensual', dias: [25], texto: '', desde: '2026-11-01' });
  D.poner(er, 'movs', { id: 'i1', tipo: 'ingreso', monto: 100000, moneda: 'CRC', fecha: '2026-11-01', medio: 'SINPE', fuente: 'otro', estado: 'ok' });
  const antesPD = D.presupuestoDiario(er, '2026-11-08');
  ok('presupuesto diario resta los recurrentes que faltan (Spotify y celular, no la beca)', antesPD.falta === 11500, `(${antesPD.falta})`);
  ok('crea los pendientes cuando llega la fecha (beca del 5)', D.generarPendientes(er, '2026-11-08') === 1 && er.movs['r-beca-2026-11-05']?.estado === 'pendiente');
  ok('un pendiente no cuenta como ingreso ni gasto', D.resumenMes(er, '2026-11').ingresos === 100000);
  ok('alerta: pendiente que pasó su fecha', D.alertas(er, '2026-11-08').some(a => a.clave === 'pend|r-beca-2026-11-05'));

  // El SINPE de la beca llega por correo 2 días después y con otro monto (menos de 5 %): se une con el pendiente
  const sBeca = { id: 'g1', origen: 'bac-sinpe', tipo: 'ingreso', medio: 'SINPE', monto: 58000, moneda: 'CRC', fecha: '2026-11-07', quien: 'UNIVERSIDAD PRUEBA', fuente: 'otro' };
  ok('ingreso fijo: el SINPE del correo se reconoce', D.recurrenteDe(er, sBeca)?.clave === 'r-beca-2026-11-05' && D.claroCorreo(er, sBeca));
  D.anotarClaros(er, [sBeca]);
  const beca = er.movs['r-beca-2026-11-05'];
  ok('ingreso fijo: se une con el pendiente, sin duplicar', beca.estado === 'ok' && beca.monto === 58000 && beca.correoId === 'g1' && beca.fuente === 'beca'
    && !er.movs['c-g1'] && D.resumenMes(er, '2026-11').ingresos === 158000);

  // El cobro de Spotify llega ANTES de la fecha (día 9): al llegar el 10 no se crea otro
  const cSpot = { id: 'g2', origen: 'bac', tipo: 'gasto', medio: 'Tarjeta', monto: 2550, moneda: 'CRC', fecha: '2026-11-09', quien: 'SPOTIFY P3A1', cat: 'otros' };
  D.anotarClaros(er, [cSpot]);
  ok('recurrente: el cobro que llega antes queda unido a su fecha', er.movs['c-g2']?.rec === 'r-spot-2026-11-10');
  D.generarPendientes(er, '2026-11-12');
  ok('recurrente: al llegar la fecha no se duplica', !er.movs['r-spot-2026-11-10'] && D.resumenMes(er, '2026-11').gastado === 2550);
  ok('recurrente: un cobro con más de 5 % de diferencia no se une', !D.recurrenteDe(er, { ...cSpot, id: 'g3', monto: 2700, fecha: '2026-12-10' }));
  ok('recurrente: sin "texto en el correo" no se une con nada', !D.recurrenteDe(er, { ...cSpot, id: 'g4', quien: 'PLAN CELULAR', monto: 9000, fecha: '2026-11-25' }));

  // Gasto anotado a mano antes de que llegue la fecha: se une en vez de crear otro
  D.poner(er, 'movs', { id: 'm9', tipo: 'gasto', monto: 2500, moneda: 'CRC', fecha: '2026-12-11', medio: 'Tarjeta', quien: 'Spotify', cat: 'otros', estado: 'ok' });
  D.generarPendientes(er, '2026-12-11');
  ok('recurrente: si ya lo anotaste a mano, no crea el pendiente', er.movs.m9.rec === 'r-spot-2026-12-10' && !er.movs['r-spot-2026-12-10']);
  const nCel = D.generarPendientes(er, '2026-12-11');
  ok('recurrente: correr de nuevo no duplica nada', nCel === 0);
  D.quitar(er, 'movs', 'r-cel-2026-11-25');
  ok('recurrente: si borrás un pendiente no vuelve a aparecer', D.generarPendientes(er, '2026-12-11') === 0);
  ok('recurrente: confirmar a mano', D.confirmarMov(er, er.movs['r-beca-2026-12-05']).estado === 'ok');
  ok('recurrente: el pendiente generado pierde contra cualquier edición (sincronización)', er.movs['r-cel-2026-12-25'] === undefined
    && D.combinar(er, { ...er, movs: { ...er.movs, 'r-beca-2026-12-05': { ...er.movs['r-beca-2026-12-05'], estado: 'pendiente', upd: 1 } } }).movs['r-beca-2026-12-05'].estado === 'ok');
  const evs = D.eventosMes(er, '2026-11', '2026-11-12');
  ok('calendario: estados del mes', evs['2026-11-05'][0].estado === 'listo' && evs['2026-11-10'][0].estado === 'listo' && evs['2026-11-25'][0].estado === 'proximo');
  ok('total mensual: quincenal cuenta doble', D.mensualRec({ monto: 1000, frecuencia: 'quincenal' }) === 2000);

  // ---- Cuentas compartidas ----
  ok('dividir: partes iguales entre 3', (r => r.mia === 3000 && r.partes.every(p => p.monto === 3000))(D.repartir(9000, 'CRC', { yo: true, personas: ['Ana', 'Luis'], modo: 'iguales' })));
  ok('dividir: el redondeo lo absorbe tu parte', D.repartir(10000, 'CRC', { yo: true, personas: ['Ana', 'Luis'], modo: 'iguales' }).mia === 3334);
  ok('dividir: montos distintos', D.repartir(9000, 'CRC', { yo: true, personas: ['Ana', 'Luis'], modo: 'distintos', montos: { Ana: 4000, Luis: 2000 } }).mia === 3000);
  ok('dividir: partes que suman más que el total dan error', !!D.repartir(5000, 'CRC', { yo: true, personas: ['Ana'], modo: 'distintos', montos: { Ana: 6000 } }).error);
  ok('dividir: pagó otra persona', (r => !r.yo && r.mia === 3000 && r.partes[0].persona === 'Pedro')(D.repartir(9000, 'CRC', { yo: false, quienPago: 'Pedro', modo: 'iguales', cuantos: 3 })));
  ok('nombres parecidos: SINPE con el nombre cortado', D.mismaPersona('Logan Brenes', 'LOGAN MARIANO BRENE') && D.mismaPersona('Ana', 'ANA MARÍA SOLANO') && !D.mismaPersona('Ana', 'ANABEL ROJAS') && !D.mismaPersona('Mari', 'MARIO SOTO'));

  const ex = D.estadoNuevo('Comp', 500);
  D.poner(ex, 'movs', { id: 'in', tipo: 'ingreso', monto: 50000, moneda: 'CRC', fecha: '2026-11-01', medio: 'SINPE', fuente: 'beca', estado: 'ok' });
  const cena = D.poner(ex, 'movs', { id: 'cena', tipo: 'gasto', monto: 9000, moneda: 'CRC', fecha: '2026-11-02', medio: 'Tarjeta', quien: 'Pizzería', cat: 'restaurantes', estado: 'ok' });
  D.guardarDividido(ex, cena, D.repartir(9000, 'CRC', { yo: true, personas: ['Ana', 'Luis'], modo: 'iguales' }));
  let rx = D.resumenMes(ex, '2026-11');
  ok('dividir: tu parte es gasto y lo de los demás no', rx.gastado === 3000 && rx.porOtros === 6000 && rx.disponible === 50000 - 9000 && ex.movs.cena.total === 9000);
  ok('me deben: saldo por persona', D.saldosCompartidas(ex).filter(s => s.sentido === 'meDeben').map(s => `${s.persona} ${s.saldo}`).join() === 'Ana 3000,Luis 3000');

  const sAna = { id: 'k1', origen: 'bac-sinpe', tipo: 'ingreso', medio: 'SINPE', monto: 3000, moneda: 'CRC', fecha: '2026-11-04', quien: 'ANA MARIA SOLANO', fuente: 'otro' };
  ok('SINPE de alguien que te debe: la revisión lo propone como pago', D.sugerirCorreo(ex, sAna) === 'deuda:Ana' && !D.claroCorreo(ex, sAna));
  ok('SINPE por más de lo que debe: no se toma como pago', !D.deudaDe(ex, { ...sAna, monto: 5000 }));
  D.aplicarRevision(ex, sAna, { valor: D.sugerirCorreo(ex, sAna) });
  rx = D.resumenMes(ex, '2026-11');
  ok('el pago de Ana no cuenta como ingreso, pero vuelve al disponible', rx.ingresos === 50000 && rx.reembolsos === 3000 && rx.disponible === 50000 - 9000 + 3000
    && rx.sinpeRec === 53000 && D.saldosCompartidas(ex).find(s => s.persona === 'Ana').saldo === 0);

  const pizza = D.poner(ex, 'movs', { id: 'piz', tipo: 'gasto', monto: 12000, moneda: 'CRC', fecha: '2026-11-05', medio: 'Tarjeta', quien: 'Pizza', cat: 'restaurantes', estado: 'ok' });
  D.guardarDividido(ex, pizza, D.repartir(12000, 'CRC', { yo: false, quienPago: 'Pedro', modo: 'iguales', cuantos: 3 }));
  rx = D.resumenMes(ex, '2026-11');
  ok('pagó otra persona: tu parte es gasto y queda en "Debo"', rx.gastado === 7000 && ex.movs.piz.monto === 4000 && ex.movs.piz.medio === ''
    && D.saldosCompartidas(ex).find(s => s.sentido === 'debo').saldo === 4000);
  const sPedro = { id: 'k2', origen: 'kash', tipo: 'gasto', medio: 'SINPE', monto: 4000, moneda: 'CRC', fecha: '2026-11-06', quien: 'PEDRO JIMENEZ', cat: 'otros' };
  ok('SINPE a quien le debés: se pregunta antes de tomarlo como pago', !D.claroCorreo(ex, sPedro) && D.anotarClaros(ex, [sPedro]) === 0
    && /Pedro/.test(D.razonRevision(ex, sPedro)) && D.sugerirCorreo(ex, sPedro) === 'deuda:Pedro');
  D.aplicarRevision(ex, sPedro, { valor: D.sugerirCorreo(ex, sPedro) });
  rx = D.resumenMes(ex, '2026-11');
  ok('ese SINPE no se cuenta otra vez como gasto', rx.gastado === 7000 && rx.sinpeEnv === 4000 && ex.movs['c-k2'].reembolso
    && D.saldosCompartidas(ex).find(s => s.sentido === 'debo').saldo === 0);
  ok('alerta: alguien te debe hace más de 15 días', D.alertas(ex, '2026-11-18').some(a => a.texto.startsWith('Luis te debe')) && !D.alertas(ex, '2026-11-15').some(a => a.texto.startsWith('Luis')));
  ok('pagaste todo por otros: no queda gasto tuyo', (() => {
    const t = D.poner(ex, 'movs', { id: 'reg', tipo: 'gasto', monto: 5000, moneda: 'CRC', fecha: '2026-11-07', medio: 'Tarjeta', cat: 'otros', estado: 'ok' });
    return D.guardarDividido(ex, t, D.repartir(5000, 'CRC', { yo: true, personas: ['Luis'], modo: 'distintos', montos: { Luis: 5000 } })) === null && ex.movs.reg.del;
  })());

  // ---- Gastos hormiga, cierre, fondo, reto, botones rápidos, exportar ----
  const eh = D.estadoNuevo('Hormiga', 500);
  const gh = (id, monto, fecha, quien, extra = {}) => D.poner(eh, 'movs', { id, tipo: 'gasto', monto, moneda: 'CRC', fecha, medio: 'Tarjeta', quien, cat: 'restaurantes', estado: 'ok', ...extra });
  D.poner(eh, 'movs', { id: 'i1', tipo: 'ingreso', monto: 200000, moneda: 'CRC', fecha: '2026-10-01', medio: 'SINPE', fuente: 'beca', estado: 'ok' });
  for (let d = 1; d <= 5; d++) gh('cafe' + d, 1500, `2026-10-0${d}`, d % 2 ? 'Café Britt' : 'CAFE BRITT');
  for (let d = 1; d <= 3; d++) gh('pan' + d, 1000, `2026-10-0${d}`, 'Panadería');
  gh('super', 25000, '2026-10-04', 'Café Britt');
  const hg = D.hormiga(eh, '2026-10', '2026-10-10');
  ok('hormiga: solo lo chico que se repite 4 veces o más', hg.comercios.length === 1 && hg.total === 7500 && hg.comercios[0].n === 5, JSON.stringify(hg));
  igual('hormiga: lo proyecta a un año', hg.anual, 7500 / 10 * 365);
  D.poner(eh, 'ajustes', { ...D.ajustes(eh), hormiga: 1000 });
  ok('hormiga: el límite se puede cambiar', D.hormiga(eh, '2026-10', '2026-10-10').comercios.length === 0);
  D.poner(eh, 'ajustes', { ...D.ajustes(eh), hormiga: 3000 });

  ok('cierre: no se crea si el mes anterior está vacío', D.cierrePendiente(eh, '2026-10-03') === null);
  const ci = D.cierrePendiente(eh, '2026-11-02');
  ok('cierre: al entrar a un mes nuevo se guarda el anterior', ci?.id === '2026-10' && ci.gastado === 35500 && ci.ingresos === 200000 && ci.top[0].cat === 'restaurantes' && ci.hormiga === 7500, JSON.stringify(ci));
  ok('cierre: no se duplica', D.cierrePendiente(eh, '2026-11-20') === null);

  ok('fondo: no existe hasta crearlo', D.estadoFondo(eh, '2026-11-02') === null);
  D.poner(eh, 'metas', { id: D.ID_FONDO, nombre: 'Fondo', especial: 'fondo', mesesObjetivo: 3, objetivo: 0, moneda: 'CRC', creada: '2026-11-01' });
  D.poner(eh, 'abonos', { id: 'f1', metaId: D.ID_FONDO, monto: 71000, moneda: 'CRC', fecha: '2026-11-01' });
  const fe = D.estadoFondo(eh, '2026-11-02');
  ok('fondo: promedio de los meses con gastos y meses que cubre', fe.promedio === 35500 && fe.meses === 2 && fe.objetivo === 106500, JSON.stringify(fe));

  const reto = D.poner(eh, 'retos', { id: 'r1', base: 500, inverso: false, metaId: D.ID_FONDO, inicio: '2026-11-01' });
  ok('reto: semana 1 = base, 52 = 52 × base, total 1378 × base', D.montoSemana(reto, 1) === 500 && D.montoSemana(reto, 52) === 26000 && D.estadoReto(eh, reto, '2026-11-01').total === 689000);
  ok('reto al revés empieza por la más cara', D.montoSemana({ ...reto, inverso: true }, 1) === 26000);
  ok('reto: semana en la que vas', D.estadoReto(eh, reto, '2026-11-15').semana === 3 && D.estadoReto(eh, reto, '2028-01-01').semana === 52);
  ok('reto: marcar una semana crea el abono', D.marcarSemana(eh, reto, 1, '2026-11-02') && D.ahorradoMeta(eh, D.ID_FONDO) === 71500);
  ok('reto: desmarcarla lo quita', !D.marcarSemana(eh, reto, 1) && D.ahorradoMeta(eh, D.ID_FONDO) === 71000);
  D.marcarSemana(eh, reto, 2, '2026-11-09');
  ok('reto: avance', (s => s.marcadas.join() === '2' && s.ahorrado === 1000)(D.estadoReto(eh, reto, '2026-11-09')));

  const rm = D.usarRapido(eh, { nombre: 'Bus', monto: 400, moneda: 'CRC', cat: 'otros', medio: 'Efectivo' }, '2026-11-03');
  ok('botón rápido: anota el gasto de hoy', rm.tipo === 'gasto' && rm.quien === 'Bus' && rm.fecha === '2026-11-03' && D.resumenMes(eh, '2026-11').gastado === 400);

  gh('pend', 9999, '2026-10-20', 'Algo', { estado: 'pendiente' });
  const fxp = D.filasExport(eh, '2026-10-01', '2026-10-31');
  ok('exportar: solo el rango, sin pendientes y en orden', fxp.length === 10 && fxp[0][0] === '2026-10-01' && fxp[0].length === D.COLUMNAS_EXPORT.length && fxp.every(f => f[2] !== 9999));
  const cs = X.csv(['A', 'B'], [['=1+1', 1.5]]);
  ok('csv: bloquea fórmulas y usa coma decimal', cs.startsWith('﻿') && cs.includes(`"'=1+1";1,5`), cs);
  ok('zip: CRC-32 correcto', X.crc32(new TextEncoder().encode('123456789')) === 0xCBF43926);
  const zx = new Uint8Array(await X.xlsx(['A'], [['x']]).arrayBuffer());
  ok('xlsx: sale un zip', zx[0] === 0x50 && zx[1] === 0x4B && zx.length > 500);

  // SINPE a una persona sin categoría: se pregunta una vez y después se anota solo, aunque escojas "Otros"
  const es = D.estadoNuevo('Sinpe', 500);
  const sp = n => ({ id: 'sp' + n, origen: 'kash', tipo: 'gasto', medio: 'SINPE', monto: 2500 + n, moneda: 'CRC', fecha: '2026-11-0' + n, quien: 'JUAN PEREZ', cat: 'otros' });
  ok('SINPE nuevo: dice por qué lo pregunta', /SINPE/.test(D.razonRevision(es, sp(1)) || ''));
  D.aplicarRevision(es, sp(1), { valor: 'otros' });
  ok('correo sin la firma del banco: se pregunta aunque sea un ingreso', /firma/.test(D.razonRevision(es, { ...sp(4), tipo: 'ingreso', sinFirma: true }) || ''));
  ok('SINPE: después de confirmarlo una vez se anota solo', D.claroCorreo(es, sp(2)) && D.anotarClaros(es, [sp(2)]) === 1);
  ok('recibo de Uber sin cobro: dice por qué', /Uber/.test(D.razonRevision(es, { ...sp(3), origen: 'uber', quien: 'Uber Eats', cat: 'restaurantes' }) || ''));

  // Cómo vas este mes
  const ev = D.estadoNuevo('ComoVas', 500);
  const gv = (id, monto, fecha, cat) => D.poner(ev, 'movs', { id, tipo: 'gasto', monto, moneda: 'CRC', fecha, medio: 'Tarjeta', cat, estado: 'ok' });
  D.poner(ev, 'movs', { id: 'iv', tipo: 'ingreso', monto: 100000, moneda: 'CRC', fecha: '2026-11-01', medio: 'SINPE', fuente: 'beca', estado: 'ok' });
  gv('v1', 10000, '2026-10-05', 'restaurantes'); gv('v2', 30000, '2026-10-20', 'supermercados');
  gv('v3', 12000, '2026-11-03', 'restaurantes'); gv('v4', 3000, '2026-11-08', 'supermercados');
  D.poner(ev, 'abonos', { id: 'av', metaId: 'x', monto: 20000, moneda: 'CRC', fecha: '2026-11-02' });
  D.poner(ev, 'recurrentes', { id: 'rv', clase: 'gasto', nombre: 'Spotify', monto: 2500, moneda: 'CRC', cat: 'otros', medio: 'Tarjeta', frecuencia: 'mensual', dias: [25], desde: '2026-10-01' });
  const cv = D.comoVas(ev, '2026-11-10');
  ok('cómo vas: ritmo del mes y comparación al mismo día', cv.gastado === 15000 && cv.proyeccion === 15000 + 1500 * 20 + 2500 && cv.antHastaHoy === 10000 && cv.gastadoAnt === 40000, JSON.stringify(cv));
  ok('cómo vas: lo que más subió (al mismo día) y cuánto ahorraste', cv.subio?.cat === 'supermercados' && cv.subio.dif === 3000 && cv.ahorroPct === 0.2, JSON.stringify(cv.subio));
  ok('cómo vas: sin proyección los primeros 6 días', D.comoVas(ev, '2026-11-05').proyeccion === null);
  D.poner(ev, 'recurrentes', { id: 'alq', clase: 'gasto', nombre: 'Alquiler', monto: 150000, moneda: 'CRC', cat: 'otros', medio: 'SINPE', frecuencia: 'mensual', dias: [2], desde: '2026-10-01' });
  D.poner(ev, 'movs', { id: 'r-alq-2026-11-02', tipo: 'gasto', monto: 150000, moneda: 'CRC', fecha: '2026-11-02', medio: 'SINPE', cat: 'otros', estado: 'ok', rec: 'r-alq-2026-11-02' });
  igual('cómo vas: un pago fijo grande no infla la proyección', D.comoVas(ev, '2026-11-10').proyeccion, 165000 + 1500 * 20 + 2500);
  D.poner(ev, 'metas', { id: 'mv', nombre: 'Viaje', objetivo: 50000, moneda: 'CRC', creada: '2026-11-01' });
  D.poner(ev, 'abonos', { id: 'av2', metaId: 'mv', monto: 8000, moneda: 'CRC', fecha: '2026-10-15' });
  const dispAntes = D.resumenMes(ev, '2026-11').disponible;
  D.quitar(ev, 'metas', 'mv');
  ok('borrar una meta no cambia el pasado y ya no cuenta como ahorrado', D.resumenMes(ev, '2026-11').disponible === dispAntes && D.totalAhorrado(ev) === 0);
  ok('cómo vas: lo que viene este mes', cv.proximos.length === 1 && cv.proximos[0].nombre === 'Spotify' && cv.proximos[0].fecha === '2026-11-25');

  // Respaldo "dejarlo igual": vuelve lo borrado y se borra lo de después
  const er2 = D.estadoNuevo('Resp', 500);
  D.poner(er2, 'movs', { id: 'ra', tipo: 'gasto', monto: 1000, moneda: 'CRC', fecha: '2026-11-01', medio: 'Tarjeta', cat: 'otros', estado: 'ok' });
  const copia = JSON.parse(JSON.stringify(er2));
  D.quitar(er2, 'movs', 'ra');
  D.poner(er2, 'movs', { id: 'rb', tipo: 'gasto', monto: 2000, moneda: 'CRC', fecha: '2026-11-02', medio: 'Tarjeta', cat: 'otros', estado: 'ok' });
  const borradoEn = er2.movs.ra.upd;
  D.restaurarExacto(er2, copia);
  ok('respaldo igual: vuelve lo borrado, se borra lo nuevo y gana al sincronizar', !er2.movs.ra.del && er2.movs.rb.del && er2.movs.ra.upd >= borradoEn
    && !D.combinar(er2, copia).movs.ra.del);

  const nuevas = D.agregarTcAuto(ec, { '2026-11-12': { compra: 440, venta: 450 }, '2026-11-13': { compra: 0, venta: 451 } });
  ok('tipo de cambio automático: solo fechas válidas', nuevas.join() === '2026-11-12' && D.tcDe(ec, '2026-11-12') === 450);
  ok('tipo de cambio: el manual le gana al automático', (D.poner(ec, 'tcManual', { id: '2026-11-12', valor: 455 }), D.tcDe(ec, '2026-11-12') === 455));
}

document.getElementById('fin').innerHTML = fallos ? `<b class="mal">${fallos} prueba(s) fallaron</b>` : '<b class="ok">Todo bien</b>';
window.resultadoPruebas = fallos;
