// Pruebas de los cálculos, el formato y el cifrado. Abrir pruebas.html en el navegador.
import * as D from './datos.js';
import * as C from './cripto.js';

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
igual('disponible', r.disponible, 120000 - 28500 - 5000 - 3000);
igual('SINPE enviados', r.sinpeEnv, 3500);
igual('SINPE recibidos', r.sinpeRec, 20000);
igual('total ahorrado', D.totalAhorrado(e), 5000);
igual('total que debo', D.totalDebo(e, 510), 27000);

// Presupuesto diario el 2026-11-13. La deuda d1 ya tiene un pago este mes, así que no se resta su cuota.
igual('presupuesto diario (deuda ya pagada este mes)', D.presupuestoDiario(e, '2026-11-13').porDia, (83500 - 15000) / 18);
// Deuda sin pago este mes: su cuota sí se resta y avisa 2 días antes
D.poner(e, 'deudas', { id: 'd2', acreedor: 'Banco', total: 50000, moneda: 'CRC', cuota: 10000, dia: 15, tasa: 0, inicio: '2026-10-01' });
igual('presupuesto diario (resta cuota pendiente)', D.presupuestoDiario(e, '2026-11-13').porDia, (83500 - 15000 - 10000) / 18);

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
  const nuevas = D.agregarTcAuto(ec, { '2026-11-12': { compra: 440, venta: 450 }, '2026-11-13': { compra: 0, venta: 451 } });
  ok('tipo de cambio automático: solo fechas válidas', nuevas.join() === '2026-11-12' && D.tcDe(ec, '2026-11-12') === 450);
  ok('tipo de cambio: el manual le gana al automático', (D.poner(ec, 'tcManual', { id: '2026-11-12', valor: 455 }), D.tcDe(ec, '2026-11-12') === 455));
}

document.getElementById('fin').innerHTML = fallos ? `<b class="mal">${fallos} prueba(s) fallaron</b>` : '<b class="ok">Todo bien</b>';
window.resultadoPruebas = fallos;
