import * as C from './cripto.js';
import * as D from './datos.js';
import * as G from './graficos.js';
import * as S from './sync.js';
import * as X from './exportar.js';
import { icono, ICONOS_EXTRA } from './iconos.js';

const $ = s => document.querySelector(s);
const { esc, crc, usd, monto } = D;
const raiz = $('#raiz'), dlg = $('#dlg'), tip = $('#tip'), toast = $('#toast');

let mk = null;   // llave maestra en memoria; null = app bloqueada
let E = null;    // datos descifrados (solo en memoria mientras está abierta)
let meta = null; // datos locales sin información personal: llaves envueltas, intentos, tema
let errorBloqueo = '', paso = '', hayVersionNueva = false;
let cfgSync = null; // {token, repo} descifrado, solo en memoria mientras la app está abierta
const sync = { enCurso: false, pendiente: false, error: '', cambios: 0, hecho: 0, promesa: null };
let traer = null;   // datos bajados de GitHub en "Ya tengo datos", antes de poner la contraseña
let respaldo = null; // respaldo leído, esperando su contraseña
let correo = null;   // lista descifrada de correo.enc (solo en memoria): {generado, movs}
const lector = { ultimo: 0, error: '', avisados: 0, sinArchivo: false };
const ui = { tab: 'inicio', mes: D.mesDe(D.hoy()), vistaMov: 'lista', fCat: '', fMedio: '', qSinpe: '', q: '', diaCal: '', anim: true, ult: { moneda: 'CRC', medio: 'Tarjeta' } };
let accion = new URLSearchParams(location.search).get('accion');

const esIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
const instalada = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

// ---------------- Tema ----------------
const mqOscuro = matchMedia('(prefers-color-scheme: dark)');
function aplicarTema() {
  const t = meta?.tema || 'auto', html = document.documentElement;
  if (t === 'auto') delete html.dataset.tema; else html.dataset.tema = t;
  const oscuro = t === 'oscuro' || (t === 'auto' && mqOscuro.matches);
  $('meta[name=theme-color]').content = oscuro ? '#1B1B1F' : '#FCFAF2';
}
mqOscuro.addEventListener('change', aplicarTema);

// ---------------- Guardado (siempre cifrado) ----------------
let tGuardar = null;
const guardar = () => { clearTimeout(tGuardar); tGuardar = setTimeout(guardarYa, 300); sync.cambios++; programarSync(); };
async function guardarYa() {
  clearTimeout(tGuardar); tGuardar = null;
  if (mk && E) await D.escribir('estado', await C.cifrar(mk, E));
}
const guardarMeta = () => D.escribir('meta', meta);
function cambiar(fn) { fn(); guardar(); render(); }

// ---------------- Sincronización ----------------
let tSync;
function programarSync() { clearTimeout(tSync); if (cfgSync) tSync = setTimeout(sincronizarAhora, 4000); } // agrupa cambios seguidos
const ocupado = () => dlg.open || document.activeElement?.matches?.('main input, main select, main textarea');

function sincronizarAhora(manual = false) {
  if (!cfgSync || !mk) return;
  if (sync.enCurso) { sync.pendiente = true; return sync.promesa; }
  if (!navigator.onLine) { sync.error = 'Sin conexión. Se sincroniza cuando vuelva el internet.'; if (manual) aviso(sync.error); return; }
  sync.enCurso = true; sync.pendiente = false;
  return (sync.promesa = sincronizar(manual));
}
async function sincronizar(manual) {
  const version = sync.cambios, antes = S.huella(E);
  if (manual) render();
  try {
    const r = await S.sincronizar(cfgSync, mk, E, meta.pass);
    if (!mk) return; // se bloqueó mientras tanto
    E = D.combinar(E, r.e); // por si se editó algo mientras se sincronizaba
    if ((r.llave.upd || 0) > (meta.pass.upd || 0)) meta.pass = r.llave; // la contraseña se cambió en otro dispositivo
    meta.ultimaSync = Date.now(); sync.error = ''; sync.hecho = version;
    await guardarMeta(); await guardarYa();
    if (manual) aviso('Sincronizado');
    if (S.huella(E) !== antes || ui.tab === 'ajustes') { if (!ocupado()) render(); }
    traerCorreo(manual);
  } catch (e) {
    sync.error = e.message;
    if (manual || e.tipo !== 'red') aviso(e.message);
    if (ui.tab === 'ajustes' && !ocupado()) render();
  } finally {
    sync.enCurso = false;
    if (sync.pendiente || sync.cambios !== version) programarSync();
  }
}
addEventListener('online', () => sincronizarAhora());

// ---------------- Correo y tipo de cambio (los escribe el Action en finanzas-datos) ----------------
async function traerCorreo(manual = false) {
  if (!cfgSync || !mk || (!manual && Date.now() - lector.ultimo < 120e3)) return;
  lector.ultimo = Date.now();
  const antes = D.pendientesCorreo(E, correo?.movs).length;
  try {
    const tabla = await S.bajarJSON(cfgSync, 'tipo_cambio.json');
    if (mk && tabla) { const nuevas = D.agregarTcAuto(E, tabla); if (nuevas.length) { nuevas.forEach(recalcularTc); guardar(); } }
    const llave = E?.llaves.correo;
    if (mk && llave && !llave.del) {
      const sobre = await S.bajarJSON(cfgSync, 'correo.enc');
      lector.sinArchivo = !sobre;
      if (sobre && mk) correo = await C.abrirCorreo(llave.priv, sobre);
    }
    lector.error = '';
  } catch (e) {
    lector.error = e instanceof S.ErrorSync ? e.message : 'No pude abrir los movimientos del correo. ¿La llave pública en GitHub es la de esta app?';
  }
  if (!mk) return;
  const nuevosRec = D.generarPendientes(E), solos = D.anotarClaros(E, correo?.movs);
  if (nuevosRec && !solos) guardar();
  if (solos) { guardar(); aviso(`Anoté ${solos} ${solos === 1 ? 'movimiento' : 'movimientos'} del correo`); }
  const n = D.pendientesCorreo(E, correo?.movs).length;
  if (n && n > lector.avisados) aviso(`Tenés ${n} ${n === 1 ? 'movimiento nuevo' : 'movimientos nuevos'} del correo`);
  lector.avisados = n;
  if ((n !== antes || ['movs', 'correo', 'ajustes'].includes(ui.tab)) && !ocupado()) render();
}

function hace(ms) {
  const min = Math.round((Date.now() - ms) / 60000);
  return min < 1 ? 'hace un momento' : min < 60 ? `hace ${min} min` : min < 1440 ? `hace ${Math.round(min / 60)} h` : D.fechaLarga(new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 10));
}

// ---------------- Respaldo ----------------
async function descargarRespaldo() {
  await guardarYa();
  const sobre = { v: 1, tipo: 'respaldo-finanzas', llave: meta.pass, datos: await C.cifrar(mk, E) };
  const nombre = `respaldo-finanzas-${D.hoy()}.json`;
  bajar(new File([JSON.stringify(sobre)], nombre, { type: 'application/json' }));
}
function bajar(archivo) { // en el iPhone abre la hoja de compartir (ahí sale "Guardar en Archivos")
  if (esIOS && navigator.canShare?.({ files: [archivo] })) return navigator.share({ files: [archivo] }).catch(() => {});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(archivo); a.download = archivo.name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function leerRespaldo(input) {
  const f = input.files[0]; input.value = '';
  if (!f) return;
  try {
    respaldo = JSON.parse(await f.text());
    if (!respaldo?.llave?.ct || !respaldo?.datos?.ct) throw 0;
  } catch { respaldo = null; return aviso('Ese archivo no es un respaldo de esta app.'); }
  abrirDialogo(`<h2>Cargar respaldo</h2><form data-f="restaurar" class="form-col">
    <p class="nota">Escribí la contraseña que tenías cuando descargaste este respaldo. Lo que tenga se combina con tus datos actuales; no se borra nada.</p>
    <input name="pass" type="password" required autocomplete="current-password" placeholder="Contraseña del respaldo">
    <button class="btn">Cargar</button></form>`);
}

// ---------------- Avisos ----------------
let tToast;
function aviso(texto, deshacer) {
  clearTimeout(tToast);
  toast.innerHTML = `<span>${esc(texto)}</span>${deshacer ? '<button data-a="deshacer">Deshacer</button>' : ''}`;
  toast.className = 'visible';
  toast._deshacer = deshacer;
  tToast = setTimeout(() => (toast.className = ''), deshacer ? 5000 : 3000);
}

// ---------------- Arranque ----------------
async function iniciar() {
  meta = await D.leer('meta');
  if (sessionStorage.getItem('versionNueva')) { sessionStorage.removeItem('versionNueva'); setTimeout(() => aviso('Nueva versión cargada'), 300); }
  render();
  navigator.storage?.persist?.();
  if ('serviceWorker' in navigator) {
    const habia = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!habia) return;
      if (!mk) { sessionStorage.setItem('versionNueva', '1'); location.reload(); }
      else { hayVersionNueva = true; aviso('Hay una versión nueva. Se carga al bloquear la app.'); }
    });
  }
}

// ---------------- Bloqueo ----------------
let ultimo = Date.now();
['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, () => (ultimo = Date.now()), { passive: true }));
const revisarInactividad = () => { if (mk && Date.now() - ultimo > 5 * 60e3) bloquear(); };
setInterval(revisarInactividad, 10e3);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { // el iPhone pausa la app al salir: no esperar los 4 s, subir ya lo pendiente
    if (cfgSync && sync.cambios !== sync.hecho) { clearTimeout(tSync); sincronizarAhora(); }
    return guardarYa();
  }
  revisarInactividad();
  sincronizarAhora(); // al volver a la app, trae lo que se cambió en el otro dispositivo
});

async function bloquear() {
  await guardarYa();
  clearTimeout(tSync);
  if (cfgSync) { await sync.promesa; if (sync.cambios !== sync.hecho) await sincronizarAhora(); } // sube lo último antes de olvidar la llave
  mk = null; E = null; cfgSync = null; errorBloqueo = ''; correo = null; lector.ultimo = lector.avisados = 0;
  if (dlg.open) dlg.close();
  if (hayVersionNueva) { sessionStorage.setItem('versionNueva', '1'); return location.reload(); }
  ui.tab = 'inicio';
  render();
}

async function abrir(f) {
  if (meta.hasta > Date.now()) return render();
  const btn = f.querySelector('button.btn'); btn.disabled = true; btn.textContent = 'Abriendo…';
  try { mk = await C.abrirConContrasena(meta.pass, f.pass.value); }
  catch {
    meta.fallos = (meta.fallos || 0) + 1;
    errorBloqueo = 'Contraseña incorrecta.';
    if (meta.fallos >= 5) { meta.hasta = Date.now() + 60e3; meta.fallos = 0; }
    await guardarMeta();
    return render();
  }
  meta.fallos = 0; await guardarMeta();
  await cargarEstado();
}
async function abrirFaceID() {
  try { mk = await C.abrirConFaceID(meta.prf); await cargarEstado(); }
  catch { mk = null; errorBloqueo = 'No se pudo usar Face ID. Usá la contraseña.'; render(); }
}
async function cargarEstado() {
  E = D.completar(await C.descifrar(mk, await D.leer('estado')));
  if (D.generarPendientes(E)) guardar(); // recurrentes e ingresos fijos que ya llegaron a su fecha
  if (D.cierrePendiente(E)) guardar();   // primera vez que se abre en un mes nuevo: se guarda el cierre del anterior
  cfgSync = meta.sync ? await C.descifrar(mk, meta.sync) : null;
  sync.cambios = sync.hecho = 0;
  errorBloqueo = ''; ultimo = Date.now();
  sincronizarAhora();
  if (accion) {
    ui.tab = { gasto: 'movs', presupuesto: 'presup', correo: 'correo' }[accion] || 'inicio';
    accion = null; history.replaceState(null, '', location.pathname);
  }
  ui.anim = true; render();
  const prev = D.mesAnterior(D.mesDe(D.hoy())), c = E.cierres[prev];
  if (c && !c.del && meta.cierreVisto !== prev) { // el resumen se muestra una vez por dispositivo
    meta.cierreVisto = prev; guardarMeta();
    abrirDialogo(vCierre(prev));
  }
}

async function crear(f) {
  if (f.pass.value !== f.pass2.value) return aviso('Las contraseñas no coinciden');
  const tc = D.parseMonto(f.tc.value);
  if (!(tc > 0)) return aviso('Escribí el tipo de cambio de hoy');
  const btn = f.querySelector('button.btn'); btn.disabled = true; btn.textContent = 'Creando…';
  mk = await C.nuevaLlaveMaestra();
  E = D.estadoNuevo(f.nombre.value.trim(), tc);
  D.poner(E, 'llaves', { id: 'correo', ...(await C.nuevoParCorreo()) }); // par de llaves para los correos
  await guardarYa(); // primero los datos, después la llave: así nunca queda una llave sin datos
  meta = { pass: await C.envolverConContrasena(mk, f.pass.value), fallos: 0, hasta: 0, tema: 'auto' };
  await guardarMeta();
  ui.anim = true; ui.tab = 'ajustes'; render();
  aviso('Listo. Ahora conectá la sincronización aquí en Ajustes.');
}

// "Ya tengo datos": 1) token y repositorio, 2) contraseña. No se crean llaves nuevas.
async function traerDatos(f) {
  const cfg = { token: f.token.value.trim(), repo: f.repo.value.trim() };
  const btn = f.querySelector('button.btn'); btn.disabled = true; btn.textContent = 'Buscando…';
  try {
    await S.probarRepo(cfg);
    const remoto = await S.bajar(cfg);
    if (!remoto) throw new S.ErrorSync('vacio', 'Ese repositorio todavía no tiene datos. Conectá primero la sincronización en el otro dispositivo.');
    traer = { cfg, sobre: remoto.sobre, fallos: 0 };
    paso = 'traerClave'; errorBloqueo = '';
  } catch (e) { errorBloqueo = e.message; }
  render();
}
async function traerClave(f) {
  const btn = f.querySelector('button.btn'); btn.disabled = true; btn.textContent = 'Abriendo…';
  try { mk = await C.abrirConContrasena(traer.sobre.llave, f.pass.value); }
  catch {
    errorBloqueo = 'Contraseña incorrecta.';
    if (++traer.fallos < 5) return render();
    traer.fallos = 0; errorBloqueo = 'Demasiados intentos. Esperá un minuto.'; render();
    $('form[data-f=traerClave] button.btn').disabled = true;
    await new Promise(r => setTimeout(r, 60e3));
    errorBloqueo = ''; return render();
  }
  E = D.completar(await C.descifrar(mk, traer.sobre.datos));
  await guardarYa();
  meta = { pass: traer.sobre.llave, fallos: 0, hasta: 0, tema: 'auto', sync: await C.cifrar(mk, traer.cfg), ultimaSync: Date.now() };
  await guardarMeta();
  cfgSync = traer.cfg; traer = null; paso = ''; errorBloqueo = '';
  ui.anim = true; ui.tab = 'inicio'; render();
  aviso('Tus datos ya están en este dispositivo.');
}

const nombre = () => D.ajustes(E).nombre || '';
const tcHoy = () => D.tcDe(E, D.hoy()) || 0;
const dolares = n => (tcHoy() ? usd(n / tcHoy()) : '');

// ---------------- Render ----------------
function render() {
  aplicarTema();
  hideTip();
  if (!meta) raiz.innerHTML = vBienvenida();
  else if (!mk) raiz.innerHTML = vBloqueo();
  else raiz.innerHTML = vApp();
  if (ui.anim && mk) setTimeout(() => $('#vista')?.classList.remove('anim'), 900);
  ui.anim = false;
  restaurarFoco();
}
let foco = null;
function restaurarFoco() {
  if (!foco) return;
  const el = document.querySelector(`[data-vivo="${foco}"]`); foco = null;
  if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
}

const ola = () => `<svg class="seigaiha" aria-hidden="true"><defs>
  <g id="esc" style="fill:var(--fondo);stroke:currentColor;stroke-width:.5"><circle r="20"/><circle r="15"/><circle r="10"/><circle r="5"/></g>
  <pattern id="sg" width="40" height="20" patternUnits="userSpaceOnUse" patternTransform="scale(1.6)">
  <use href="#esc" x="0" y="0"/><use href="#esc" x="40" y="0"/><use href="#esc" x="20" y="10"/><use href="#esc" x="0" y="20"/><use href="#esc" x="40" y="20"/>
  </pattern></defs><rect width="100%" height="100%" fill="url(#sg)"/></svg>`;

const notaIOS = () => esIOS && !instalada()
  ? `<p class="nota">En el iPhone usala siempre instalada: en Safari tocá Compartir y después "Agregar a pantalla de inicio". Lo que guardés aquí en Safari no aparece en la app instalada, porque cada una tiene su propio almacenamiento.</p>` : '';

function vBienvenida() {
  if (paso === 'traer') return `<section class="pantalla-centro">${ola()}<form class="caja" data-f="traer">
    <h1 class="logo">Traer mis datos</h1>
    <p class="nota">Pegá el token de GitHub de este dispositivo (empieza con github_pat_). Se guarda cifrado y solo sirve para tu repositorio de datos.</p>
    <label>Token<input name="token" type="password" required autocomplete="off" spellcheck="false" autocapitalize="off"></label>
    <label>Repositorio<input name="repo" required value="${esc(S.repoSugerido())}" placeholder="usuario/finanzas-datos" autocomplete="off" spellcheck="false" autocapitalize="off"></label>
    <p class="error" role="alert">${esc(errorBloqueo)}</p>
    <button class="btn">Buscar mis datos</button>
    <button type="button" class="btn sec-btn" data-a="paso" data-v="">Volver</button></form></section>`;
  if (paso === 'traerClave') return `<section class="pantalla-centro">${ola()}<form class="caja" data-f="traerClave">
    <h1 class="logo">Casi listo</h1>
    <p>Encontré tus datos. Escribí tu contraseña para abrirlos.</p>
    <label>Contraseña<input name="pass" type="password" required autocomplete="current-password"></label>
    <p class="error" role="alert">${esc(errorBloqueo)}</p>
    <button class="btn">Abrir</button>
    <button type="button" class="btn sec-btn" data-a="paso" data-v="">Volver</button></form></section>`;
  if (paso !== 'cero') return `<section class="pantalla-centro">${ola()}<div class="caja">
    <h1 class="logo">Finanzas</h1>
    <p>¿Empezar de cero o ya tenés datos en otro dispositivo?</p>
    <button class="btn" data-a="paso" data-v="cero">Empezar de cero</button>
    <button class="btn sec-btn" data-a="paso" data-v="traer">Ya tengo datos en otro dispositivo</button>
    ${notaIOS()}</div></section>`;
  return `<section class="pantalla-centro">${ola()}<form class="caja" data-f="crear">
    <h1 class="logo">Empecemos</h1>
    <label>¿Cómo te llamás?<input name="nombre" required autocomplete="given-name"></label>
    <label>Contraseña (mínimo 8 caracteres)<input name="pass" type="password" minlength="8" required autocomplete="new-password"></label>
    <label>Repetila<input name="pass2" type="password" minlength="8" required autocomplete="new-password"></label>
    <label>Tipo de cambio de hoy (₡ por $1)<input name="tc" inputmode="decimal" required placeholder="Ej. 505,20"></label>
    <p class="aviso-fuerte">Si olvidás esta contraseña no hay forma de recuperar tus datos. Nadie puede abrirlos sin ella, ni siquiera yo.</p>
    <label class="check"><input type="checkbox" required> Entiendo que si la olvido pierdo los datos</label>
    <button class="btn">Crear</button>
    <button type="button" class="btn sec-btn" data-a="paso" data-v="">Volver</button></form></section>`;
}

function vBloqueo() {
  const espera = Math.max(0, Math.ceil((meta.hasta - Date.now()) / 1000));
  if (espera) setTimeout(render, 1000);
  return `<section class="pantalla-centro">${ola()}<form class="caja" data-f="abrir">
    <h1 class="logo">Finanzas</h1>
    <label>Contraseña<input type="password" name="pass" autocomplete="current-password" required ${espera ? 'disabled' : 'autofocus'}></label>
    <p class="error" role="alert">${espera ? `Demasiados intentos. Esperá ${espera} s.` : esc(errorBloqueo)}</p>
    <button class="btn" ${espera ? 'disabled' : ''}>Desbloquear</button>
    ${meta.prf ? `<button type="button" class="btn sec-btn" data-a="faceid">${icono('faceid')} Usar Face ID</button>` : ''}
    ${notaIOS()}</form></section>`;
}

const TABS = [['inicio', 'Inicio', 'casa'], ['presup', 'Presupuesto', 'pastel'], ['movs', 'Movimientos', 'lista'], ['metas', 'Metas', 'diana'], ['deudas', 'Deudas', 'recibo']];
function vApp() {
  const info = D.tcInfo(E, D.hoy()), al = alertasVisibles();
  const vistas = { inicio: vInicio, presup: vPresup, movs: vMovs, metas: vMetas, deudas: vDeudas, ajustes: vAjustes, buscar: vBuscar, correo: vCorreo };
  return `<div class="app">
  <header class="top">
    <span class="marca">Finanzas</span>
    <span class="tc-top">${info ? `$1 = ${D.tcFmt(info.valor)} · ${D.fechaCorta(info.fecha)}` : 'Sin tipo de cambio'}</span>
    <button class="ico-btn ${ui.tab === 'buscar' ? 'activo' : ''}" data-a="tab" data-v="buscar" aria-label="Buscar">${icono('lupa')}</button>
    <button class="ico-btn ${ui.tab === 'ajustes' ? 'activo' : ''}" data-a="tab" data-v="ajustes" aria-label="Ajustes">${icono('engranaje')}</button>
    <button class="ico-btn" data-a="bloquear" aria-label="Bloquear">${icono('candado')}</button>
  </header>
  ${al.length && ui.tab !== 'inicio' ? `<button class="alerta-top ${al[0].nivel}" data-a="tab" data-v="inicio">${esc(al[0].texto)}${al.length > 1 ? ` <b>+${al.length - 1}</b>` : ''}</button>` : ''}
  <main id="vista" class="${ui.anim ? 'anim' : ''}">${vistas[ui.tab]()}</main>
  <nav class="tabs" aria-label="Secciones">${TABS.map(([id, n, ic]) =>
    `<button data-a="tab" data-v="${id}" class="${ui.tab === id ? 'activa' : ''}" ${ui.tab === id ? 'aria-current="page"' : ''}>${icono(ic)}<span>${n}</span></button>`).join('')}</nav>
  </div>`;
}

const alertasVisibles = () => D.alertas(E);
const kpi = (titulo, n, clase = '') =>
  `<div class="tarjeta kpi ${clase}"><span class="et">${titulo}</span><strong class="grande ${n < 0 ? 'txt-rojo' : ''}">${crc(n)}</strong><span class="sec">(${dolares(n)})</span></div>`;
const selMes = () => `<div class="mes-sel"><button class="ico-btn" data-a="mes" data-v="-1" aria-label="Mes anterior">‹</button><strong>${D.nombreMes(ui.mes)}</strong><button class="ico-btn" data-a="mes" data-v="1" aria-label="Mes siguiente">›</button></div>`;
const icCat = c => `<span class="ic-cat" style="--c:${c?.color || '#828282'}">${icono(c?.icono || 'puntos')}</span>`;

function vAlertas(al) {
  if (!al.length) return '<p class="vacio">Todo en orden. No hay alertas.</p>';
  return al.map(a => `<div class="alerta ${a.nivel}"><span>${esc(a.texto)}</span><button class="ico-btn chico" data-a="cerrarAlerta" data-v="${esc(a.clave)}" aria-label="Cerrar alerta">${icono('cerrar')}</button></div>`).join('');
}

// ---------------- Inicio ----------------
function vInicio() {
  const mes = D.mesDe(D.hoy()), r = D.resumenMes(E, mes), h = new Date().getHours();
  const saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  const pd = D.presupuestoDiario(E);
  const segs = D.cats(E).map(c => ({ ...c, valor: r.porCat[c.id] || 0 })).filter(s => s.valor > 0).sort((a, b) => b.valor - a.valor);
  const seis = D.ultimosMeses(mes, 6).map(m => { const x = D.resumenMes(E, m); return { et: D.mesCorto(m), a: x.ingresos, b: x.gastado }; });
  return `<h1 class="saludo">${saludo}, <span class="acento">${esc(nombre())}</span></h1>
  <p class="sec sub">${D.nombreMes(mes)}</p>
  <div class="kpis">
    ${kpi('Disponible', r.disponible, 'disp')}${kpi('Ingresos', r.ingresos)}${kpi('Gastado', r.gastado)}
    ${kpi('Total ahorrado', D.totalAhorrado(E))}${kpi('Total que debo', D.totalDebo(E, tcHoy()))}
  </div>
  <div class="tarjeta diario">${pd.libre >= 0
    ? `Podés gastar <strong>${crc(pd.porDia)}</strong> por día hasta fin de mes <span class="sec">(${pd.dias} ${pd.dias === 1 ? 'día' : 'días'})</span>`
    : `<span class="txt-rojo">Te pasaste por <strong>${crc(-pd.libre)}</strong> contando lo que falta pagar este mes.</span>`}</div>
  ${barraRapidos()}
  ${tarjetaHormiga(mes)}
  <div class="tarjeta sinpe"><h2>${icono('sinpe')} SINPE del mes</h2>
    <dl class="trio"><div><dt>Enviados</dt><dd>${crc(r.sinpeEnv)}</dd></div><div><dt>Recibidos</dt><dd>${crc(r.sinpeRec)}</dd></div><div><dt>Diferencia</dt><dd>${crc(r.sinpeRec - r.sinpeEnv)}</dd></div></dl></div>
  <div class="rejilla">
    <div class="tarjeta"><h2>Gasto por categoría</h2><div class="dona-caja">${G.dona(segs)}
      <ul class="leyenda">${segs.map(s => `<li data-tip="${esc(s.nombre)}: ${crc(s.valor)}"><i class="punto" style="--c:${s.color}"></i>${icono(s.icono)}<span>${esc(s.nombre)}</span><b>${crc(s.valor)}</b></li>`).join('')}</ul></div></div>
    <div class="tarjeta"><h2>Últimos 6 meses</h2>${G.barras(seis, 'Ingresos', 'Gastos')}</div>
  </div>
  <div class="tarjeta"><h2>Alertas</h2>${vAlertas(alertasVisibles())}</div>`;
}

const barraRapidos = () => {
  const rs = D.lista(E, 'rapidos').sort((a, b) => a.nombre.localeCompare(b.nombre));
  return rs.length ? `<div class="rapidos">${rs.map(b => `<button class="btn sec-btn chico" data-a="rapido" data-v="${b.id}">${esc(b.nombre)}<span class="sec">${monto(b.monto, b.moneda)}</span></button>`).join('')}</div>` : '';
};
function tarjetaHormiga(mes) {
  const hg = D.hormiga(E, mes);
  if (!hg.comercios.length) return '';
  return `<div class="tarjeta"><h2>Gastos hormiga</h2>
    <p>Este mes llevás <strong>${crc(hg.total)}</strong> en gastos chicos que se repiten. A este ritmo serían unos <strong>${crc(hg.anual)}</strong> al año.</p>
    ${hg.comercios.map(x => `<div class="mini"><span class="crece">${esc(x.quien)}</span><span class="sec">${x.n} veces</span><span>${crc(x.total)}</span></div>`).join('')}
    <p class="nota">Cuento los gastos de ${crc(hg.limite)} o menos en un mismo lugar, 4 veces o más en el mes. El límite se cambia en Ajustes.</p></div>`;
}
function vCierre(mes) {
  const c = D.calcularCierre(E, mes), dif = c.gastado - c.antes.gastado, ant = D.nombreMes(D.mesAnterior(mes)).toLowerCase();
  return `<h2>Cierre de ${D.nombreMes(mes).toLowerCase()}</h2>
  <dl class="trio"><div><dt>Ingresos</dt><dd>${crc(c.ingresos)}</dd></div><div><dt>Gastado</dt><dd>${crc(c.gastado)}</dd></div><div><dt>Ahorrado</dt><dd>${crc(c.ahorrado)}</dd></div></dl>
  <p>Te quedaron <strong class="${c.disponible < 0 ? 'txt-rojo' : ''}">${crc(c.disponible)}</strong> disponibles.</p>
  ${c.antes.gastado ? `<p class="sec">Gastaste ${dif > 0 ? `<span class="txt-rojo">${crc(dif)} más</span>` : dif < 0 ? `<span class="txt-verde">${crc(-dif)} menos</span>` : 'lo mismo'} que en ${ant}.</p>` : ''}
  ${c.top.length ? `<p class="et">Donde más gastaste</p>${c.top.map(t => `<div class="mini">${icCat(E.cats[t.cat])}<span class="crece">${esc(t.nombre)}</span><span>${crc(t.monto)}</span></div>`).join('')}` : ''}
  ${c.hormiga ? `<p class="sec">Gastos hormiga: ${crc(c.hormiga)} (${c.hormigaComercios.map(esc).join(', ')}).</p>` : ''}`;
}

// ---------------- Presupuesto ----------------
function vPresup() {
  const r = D.resumenMes(E, ui.mes), ant = D.resumenMes(E, D.mesAnterior(ui.mes));
  const ingresos = D.movsMes(E, ui.mes).filter(m => m.tipo === 'ingreso' && m.estado !== 'pendiente').sort((a, b) => b.fecha.localeCompare(a.fecha));
  const filas = D.cats(E).map(c => {
    const lim = D.limite(E, ui.mes, c.id), g = r.porCat[c.id] || 0, pct = lim ? g / lim : 0;
    const clase = pct >= 1 ? 'rojo' : pct >= 0.8 ? 'amarillo' : 'verde';
    return `<div class="fila-cat">${icCat(c)}<div class="txt"><b>${esc(c.nombre)}</b>
      <div class="barra"><i class="${clase}" style="width:${Math.min(100, pct * 100).toFixed(1)}%"></i></div>
      <span class="sec">${crc(g)} gastado · ${lim ? (lim - g >= 0 ? `${crc(lim - g)} disponible` : `<span class="txt-rojo">${crc(g - lim)} de más</span>`) : 'sin límite'}</span></div>
      <label class="lim"><span>Límite</span><input inputmode="decimal" data-lim="${c.id}" value="${lim ? D.numPlano(lim) : ''}" placeholder="—" aria-label="Límite de ${esc(c.nombre)}"></label></div>`;
  }).join('');
  const comp = D.cats(E).map(c => {
    const a = r.porCat[c.id] || 0, b = ant.porCat[c.id] || 0, d = a - b;
    if (!a && !b) return '';
    return `<tr><td>${esc(c.nombre)}</td><td>${crc(a)}</td><td>${crc(b)}</td><td class="${d > 0 ? 'txt-rojo' : d < 0 ? 'txt-verde' : ''}">${d > 0 ? `${crc(d)} más` : d < 0 ? `${crc(-d)} menos` : 'igual'}</td></tr>`;
  }).join('');
  const cierres = D.lista(E, 'cierres').sort((a, b) => b.id.localeCompare(a.id));
  return `${selMes()}
  <div class="tarjeta"><div class="cab"><h2>Ingresos del mes</h2><button class="btn chico" data-a="nuevoIngreso">${icono('mas')} Ingreso</button></div>
    ${ingresos.length ? ingresos.map(filaMov).join('') : '<p class="vacio">Todavía no anotaste ingresos este mes.</p>'}</div>
  <div class="tarjeta"><h2>Límites por categoría</h2>${filas}</div>
  <div class="tarjeta"><h2>Resumen</h2><dl class="resumen">
    <div><dt>Ingresos</dt><dd>${crc(r.ingresos)}</dd></div><div><dt>Gastado</dt><dd>${crc(r.gastado)}</dd></div>
    <div><dt>Abonos a metas</dt><dd>${crc(r.abonos)}</dd></div><div><dt>Pagos de deudas</dt><dd>${crc(r.pagos)}</dd></div>
    <div class="total"><dt>Disponible</dt><dd class="${r.disponible < 0 ? 'txt-rojo' : ''}">${crc(r.disponible)} <span class="sec">(${dolares(r.disponible)})</span></dd></div></dl></div>
  <div class="tarjeta"><h2>Comparado con ${D.nombreMes(D.mesAnterior(ui.mes)).toLowerCase()}</h2>
    ${comp ? `<table class="tabla"><thead><tr><th>Categoría</th><th>Este mes</th><th>Anterior</th><th>Diferencia</th></tr></thead><tbody>${comp}</tbody></table>` : '<p class="vacio">Sin gastos para comparar.</p>'}</div>
  <div class="tarjeta"><h2>Cierres de mes</h2>${cierres.length ? cierres.map(c => {
    const x = D.calcularCierre(E, c.id);
    return `<button class="fila-btn" data-a="verCierre" data-v="${c.id}"><b>${D.nombreMes(c.id)}</b><span class="sec">Gastaste ${crc(x.gastado)} · ahorraste ${crc(x.ahorrado)} · te quedaron ${crc(x.disponible)}</span></button>`;
  }).join('') : '<p class="vacio">El primer cierre aparece cuando empiece el próximo mes.</p>'}</div>`;
}

// ---------------- Movimientos ----------------
function formMov(m = {}) {
  const tipo = m.tipo || 'gasto', mon = m.moneda || ui.ult.moneda, medio = m.medio || ui.ult.medio;
  const quienes = [...new Set(D.lista(E, 'movs').map(x => x.quien).filter(Boolean))].sort();
  return `<form class="form-mov" data-f="mov" data-id="${m.id || ''}">
    <div class="seg" role="radiogroup"><label><input type="radio" name="tipo" value="gasto" ${tipo === 'gasto' ? 'checked' : ''}>Gasto</label><label><input type="radio" name="tipo" value="ingreso" ${tipo === 'ingreso' ? 'checked' : ''}>Ingreso</label></div>
    <div class="fila"><input name="monto" inputmode="decimal" placeholder="Monto" required value="${m.monto ? D.numPlano(m.monto, m.moneda) : ''}" class="monto-inp" aria-label="Monto">
      <select name="moneda" aria-label="Moneda"><option value="CRC" ${mon === 'CRC' ? 'selected' : ''}>₡</option><option value="USD" ${mon === 'USD' ? 'selected' : ''}>$</option></select></div>
    <select name="cat" class="solo-gasto" aria-label="Categoría">${D.cats(E).map(c => `<option value="${c.id}" ${m.cat === c.id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select>
    <select name="fuente" class="solo-ingreso" aria-label="Fuente del ingreso">${Object.entries(D.FUENTES).map(([k, v]) => `<option value="${k}" ${m.fuente === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <select name="medio" aria-label="Medio de pago">${D.MEDIOS.map(x => `<option ${medio === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
    <input name="fecha" type="date" value="${m.fecha || D.hoy()}" required aria-label="Fecha">
    <input name="quien" list="quienes" placeholder="Comercio o persona (opcional)" value="${esc(m.quien)}" autocomplete="off">
    <datalist id="quienes">${quienes.map(q => `<option value="${esc(q)}">`).join('')}</datalist>
    <input name="nota" placeholder="Nota (opcional)" value="${esc(m.nota)}">
    ${m.id ? '<button class="btn">Guardar cambios</button>'
      : `<div class="fila"><button class="btn crece">Guardar</button><button type="button" class="btn sec-btn solo-gasto" data-a="dividir">Dividir</button></div>`}</form>`;
}

function filaMov(m) {
  const c = E.cats[m.cat], ing = m.tipo === 'ingreso';
  const titulo = m.quien || (ing ? D.FUENTES[m.fuente] || 'Ingreso' : c?.nombre || 'Otros');
  const sub = [D.fechaCorta(m.fecha), m.medio, m.quien ? (ing ? D.FUENTES[m.fuente] : c?.nombre) : '', m.nota].filter(Boolean).map(esc).join(' · ');
  const pend = m.estado === 'pendiente';
  return `<div class="mov ${pend ? 'pend' : ''}">${ing ? `<span class="ic-cat" style="--c:var(--exito)">${icono(m.medio === 'SINPE' ? 'sinpe' : 'ingreso')}</span>` : icCat(c)}
    <div class="txt"><b>${esc(titulo)}</b><span class="sec">${sub}${m.origen === 'correo' ? ' <span class="chip">desde correo</span>' : ''}${m.origen === 'siri' ? ' <span class="chip">desde Siri</span>' : ''}${pend ? ' <span class="chip pend">pendiente</span>' : m.rec ? ` <span class="chip">${ing ? 'fijo' : 'recurrente'}</span>` : ''}${m.reembolso ? ` <span class="chip">${ing ? 'te pagó lo que te debía' : 'pago de lo que debías'}</span>` : ''}${m.dividido ? ` <span class="chip">${m.dividido === 'yo' ? 'dividido' : `pagó ${esc(m.dividido)}`}</span>` : ''}</span></div>
    <div class="m ${ing ? 'pos' : ''}">${ing ? '+' : ''}${monto(m.monto, m.moneda)}${m.moneda === 'USD' && !pend ? `<span class="sec">${crc(D.aCRC(m))}</span>` : ''}${m.total ? `<span class="sec">de ${monto(m.total, m.moneda)}</span>` : ''}</div>
    ${pend ? `<button class="ico-btn chico confirmar" data-a="confirmarMov" data-v="${m.id}" aria-label="Confirmar" title="Confirmar">${icono('check')}</button>` : ''}
    <button class="ico-btn chico" data-a="editarMov" data-v="${m.id}" aria-label="Editar">${icono('lapiz')}</button>
    <button class="ico-btn chico" data-a="borrarMov" data-v="${m.id}" aria-label="Borrar">${icono('basura')}</button></div>`;
}

function vMovs() {
  const pest = `<div class="seg pestañas">${[['lista', 'Lista'], ['sinpe', 'SINPE'], ['deben', 'Me deben / Debo'], ['rec', 'Recurrentes'], ['cal', 'Calendario']].map(([k, n]) =>
    `<button data-a="vistaMov" data-v="${k}" class="${ui.vistaMov === k ? 'activa' : ''}">${n}</button>`).join('')}</div>`;
  if (ui.vistaMov === 'sinpe') return pest + vSinpe();
  if (ui.vistaMov === 'deben') return pest + vCompartidas();
  if (ui.vistaMov === 'rec') return pest + vRecurrentes();
  if (ui.vistaMov === 'cal') return pest + vCalendario();
  const movs = D.movsMes(E, ui.mes)
    .filter(m => (!ui.fCat || m.cat === ui.fCat) && (!ui.fMedio || m.medio === ui.fMedio))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.upd - a.upd);
  return `${pest}
  <div class="rejilla movs-rej">
    <div class="tarjeta"><h2>Nuevo movimiento</h2>${barraRapidos()}${formMov()}
      ${botonCorreo()}</div>
    <div class="tarjeta">${selMes()}
      <div class="filtros"><select data-filtro="fCat" aria-label="Filtrar por categoría"><option value="">Todas las categorías</option>${D.cats(E).map(c => `<option value="${c.id}" ${ui.fCat === c.id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select>
      <select data-filtro="fMedio" aria-label="Filtrar por medio"><option value="">Todos los medios</option>${D.MEDIOS.map(x => `<option ${ui.fMedio === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      ${movs.length ? movs.map(filaMov).join('') : '<p class="vacio">No hay movimientos con esos filtros.</p>'}</div>
  </div>`;
}

function vSinpe() {
  const todos = D.lista(E, 'movs').filter(m => m.medio === 'SINPE' && m.estado !== 'pendiente');
  const q = ui.qSinpe.trim().toLowerCase();
  const filas = (q ? todos.filter(m => (m.quien || '').toLowerCase().includes(q)) : todos.filter(m => m.fecha.startsWith(ui.mes)))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  const env = filas.filter(m => m.tipo === 'gasto').reduce((s, m) => s + D.aCRC(m), 0);
  const rec = filas.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + D.aCRC(m), 0);
  return `<div class="tarjeta">${q ? '' : selMes()}
    <input type="search" data-vivo="qSinpe" value="${esc(ui.qSinpe)}" placeholder="Buscar por persona (todos los meses)" aria-label="Buscar persona">
    ${q ? `<p class="sec">Movimientos con "${esc(ui.qSinpe)}" en todos los meses</p>` : ''}
    ${filas.length ? `<table class="tabla"><thead><tr><th>Fecha</th><th>Persona</th><th></th><th>Monto</th></tr></thead><tbody>
    ${filas.map(m => `<tr><td>${D.fechaCorta(m.fecha)}</td><td>${esc(m.quien || '—')}</td><td>${m.tipo === 'gasto' ? 'Enviado' : '<span class="txt-verde">Recibido</span>'}</td><td>${monto(m.monto, m.moneda)}</td></tr>`).join('')}
    </tbody></table>` : '<p class="vacio">No hay SINPE aquí.</p>'}
    <dl class="trio"><div><dt>Total enviado</dt><dd>${crc(env)}</dd></div><div><dt>Total recibido</dt><dd>${crc(rec)}</dd></div><div><dt>Diferencia</dt><dd>${crc(rec - env)}</dd></div></dl></div>`;
}

// ---------------- Cuentas compartidas ----------------
function vCompartidas() {
  const todos = D.saldosCompartidas(E), h = D.hoy();
  const bloque = (sentido, titulo, vacio) => {
    const xs = todos.filter(x => x.sentido === sentido).sort((a, b) => (b.saldo > 0) - (a.saldo > 0) || b.saldo - a.saldo);
    const total = xs.reduce((t, x) => t + x.saldo * (x.moneda === 'USD' ? tcHoy() : 1), 0), meDeben = sentido === 'meDeben';
    return `<div class="tarjeta"><h2>${titulo}</h2>
      ${xs.length ? `<p class="sec">Total: <strong>${crc(total)}</strong></p>` : `<p class="vacio">${vacio}</p>`}
      ${xs.map(x => {
        const dias = x.desde ? D.diasEntre(x.desde, h) : 0;
        return `<div class="persona"><div class="mov"><span class="ic-cat" style="--c:${meDeben ? 'var(--exito)' : 'var(--aviso)'}">${icono('sinpe')}</span>
          <div class="txt"><b>${esc(x.persona)}</b><span class="sec ${meDeben && dias > 15 ? 'txt-rojo' : ''}">${x.saldo > 0 ? `desde el ${D.fechaCorta(x.desde)}${dias > 1 ? ` (hace ${dias} días)` : ''}` : 'al día'}</span></div>
          <div class="m">${monto(x.saldo, x.moneda)}</div>
          ${x.saldo > 0 ? `<button class="btn chico" data-a="pagoComp" data-v="${sentido}|${encodeURIComponent(x.persona)}|${x.moneda}">${meDeben ? 'Me pagó' : 'Le pagué'}</button>` : ''}</div>
          <details><summary>Historial (${x.items.length})</summary>${x.items.slice().reverse().map(c => `<div class="hist"><span>${D.fechaCorta(c.fecha)}</span>
            <span class="crece">${c.clase === 'cargo' ? esc(c.concepto || (meDeben ? 'Cuenta dividida' : 'Pagó por vos')) : meDeben ? 'Te pagó' : 'Le pagaste'}</span>
            <span class="${c.clase === 'abono' ? 'txt-verde' : ''}">${c.clase === 'cargo' ? '+' : '−'}${monto(c.monto, c.moneda)}</span>
            <button class="ico-btn chico" data-a="borrarComp" data-v="${c.id}" aria-label="Borrar">${icono('basura')}</button></div>`).join('')}</details></div>`;
      }).join('')}</div>`;
  };
  return `<div class="rejilla">${bloque('meDeben', 'Me deben', 'Nadie te debe nada. Cuando dividás una cuenta que pagaste vos, aparece aquí.')}
    ${bloque('debo', 'Debo', 'No le debés a nadie. Si alguien paga por vos, anotalo con "Dividir" y "Pagó otra persona".')}</div>
  <p class="nota">Para dividir una cuenta, tocá "Dividir" al anotar un gasto o al revisar los movimientos del correo. Cuando te llega un SINPE de alguien que te debe, la revisión te propone anotarlo como pago (no cuenta como ingreso).</p>`;
}

// Ventana "Dividir": base = el gasto con el total ({monto, moneda, cat, fecha, medio, quien, nota}); correo = el movimiento del correo, si viene de la revisión
const personasConocidas = () => [...new Set([...D.lista(E, 'compartidas').map(c => c.persona), ...D.lista(E, 'movs').filter(m => m.medio === 'SINPE').map(m => m.quien)].filter(Boolean))].sort();
function formDividir(base) {
  return `<h2>Dividir la cuenta</h2><form data-f="dividir" class="form-col form-div">
    <p>Total: <strong>${monto(base.monto, base.moneda)}</strong>${base.quien ? ` · ${esc(base.quien)}` : ''}</p>
    <div class="seg" role="radiogroup"><label><input type="radio" name="pagador" value="yo" checked>Pagué yo</label><label><input type="radio" name="pagador" value="otro">Pagó otra persona</label></div>
    <label class="solo-yo">¿Con quiénes? (separá los nombres con comas)<input name="personas" placeholder="Ej. Ana, Luis" autocomplete="off"></label>
    <label class="solo-otro">¿Quién pagó?<input name="quienPago" list="personas-dl" autocomplete="off"></label>
    <datalist id="personas-dl">${personasConocidas().map(p => `<option value="${esc(p)}">`).join('')}</datalist>
    <div class="seg" role="radiogroup"><label><input type="radio" name="modo" value="iguales" checked>Partes iguales</label><label><input type="radio" name="modo" value="distintos">Montos distintos</label></div>
    <label class="solo-otro solo-iguales">¿Entre cuántas personas, contándote?<input name="cuantos" type="number" min="2" value="2"></label>
    <div class="montos form-col"></div>
    <p class="res-div sec" aria-live="polite"></p>
    <button class="btn">Guardar</button></form>`;
}
function leerDividir(f) {
  const personas = f.personas.value.split(',').map(s => s.trim()).filter(Boolean);
  return { yo: f.pagador.value === 'yo', personas, modo: f.modo.value, quienPago: f.quienPago.value,
    cuantos: +f.cuantos.value, miParte: D.parseMonto(f.elements.miParte?.value),
    montos: Object.fromEntries(personas.map(p => [p, D.parseMonto(f.elements[`m|${p}`]?.value)])) };
}
function actualizarDividir(f, t) {
  const o = leerDividir(f), base = ui.dividir.base;
  if (['personas', 'modo', 'pagador'].includes(t?.name)) { // rehace las casillas de montos sin perder lo escrito
    const caja = f.querySelector('.montos'), antes = Object.fromEntries([...caja.querySelectorAll('input')].map(i => [i.name, i.value]));
    const casilla = (nombre, titulo) => `<label>${esc(titulo)}<input name="${esc(nombre)}" inputmode="decimal" value="${esc(antes[nombre] || '')}"></label>`;
    caja.innerHTML = o.modo !== 'distintos' ? '' : o.yo ? o.personas.map(p => casilla(`m|${p}`, `Le toca a ${p}`)).join('') : casilla('miParte', 'Tu parte');
  }
  const r = D.repartir(base.monto, base.moneda, leerDividir(f)), m = n => monto(n, base.moneda);
  f.querySelector('.res-div').textContent = r.error ? '' : r.yo
    ? `Tu parte: ${m(r.mia)}. Te deben: ${r.partes.map(p => `${p.persona} ${m(p.monto)}`).join(', ')}.`
    : `Tu parte: ${m(r.mia)}. Se la debés a ${r.partes[0].persona}.`;
}

// ---------------- Recurrentes y calendario ----------------
const nombreMesSolo = n => D.nombreMes(`2000-${String(n).padStart(2, '0')}`).split(' ')[0];
const descFrec = r => r.frecuencia === 'semanal' ? `Cada ${D.DIAS_SEMANA[r.diaSemana]}`
  : r.frecuencia === 'quincenal' ? `Días ${r.dias[0]} y ${r.dias[1]} de cada mes`
  : r.frecuencia === 'anual' ? `Cada año, el ${r.dias[0]} de ${nombreMesSolo(r.mes).toLowerCase()}`
  : `Día ${r.dias[0]} de cada mes`;

function vRecurrentes() {
  const todos = D.lista(E, 'recurrentes'), t = tcHoy(), h = D.hoy();
  const bloque = (clase, titulo, vacio) => {
    const rs = todos.filter(r => D.tipoRec(r) === clase).sort((a, b) => a.nombre.localeCompare(b.nombre));
    const total = rs.reduce((s, r) => s + D.mensualRec(r) * (r.moneda === 'USD' ? t : 1), 0);
    const ing = clase === 'ingreso';
    return `<div class="tarjeta"><div class="cab"><h2>${titulo}</h2><button class="btn chico" data-a="nuevoRec" data-v="${clase}">${icono('mas')} Nuevo</button></div>
      ${rs.length ? `<p class="sec">Total por mes: <strong>${crc(total)}</strong> <span class="sec">(${dolares(total)})</span></p>` : `<p class="vacio">${vacio}</p>`}
      ${rs.map(r => {
        const prox = D.fechasRec(r, h, D.sumarDias(h, 366))[0];
        return `<div class="mov">${ing ? `<span class="ic-cat" style="--c:var(--exito)">${icono('ingreso')}</span>` : icCat(E.cats[r.cat])}
          <div class="txt"><b>${esc(r.nombre)}</b><span class="sec">${esc(descFrec(r))}${prox ? ` · próximo: ${D.fechaCorta(prox)}` : ''}${r.texto ? ` · en el correo: "${esc(r.texto)}"` : ''}</span></div>
          <div class="m ${ing ? 'pos' : ''}">${monto(r.monto, r.moneda)}</div>
          <button class="ico-btn chico" data-a="editarRec" data-v="${r.id}" aria-label="Editar">${icono('lapiz')}</button>
          <button class="ico-btn chico" data-a="borrarRec" data-v="${r.id}" aria-label="Borrar">${icono('basura')}</button></div>`;
      }).join('')}</div>`;
  };
  return `<div class="rejilla">${bloque('gasto', 'Gastos recurrentes', 'Anotá aquí tus pagos fijos: Spotify, el plan del celular, el gym…')}
    ${bloque('ingreso', 'Ingresos fijos', 'Anotá la plata que te entra siempre: beca, salario, ayuda familiar…')}</div>
  <p class="nota">Cuando llega la fecha, aparece en Movimientos como "pendiente" hasta que lo confirmés. Si el cobro o el SINPE llega por correo con el texto que pusiste, se confirma solo.</p>`;
}

const ESTADO_EV = { pendiente: 'pendiente de confirmar', atrasado: 'sin anotar', proximo: 'próximo' };
const NOMBRE_EV = { gasto: 'Gasto recurrente', ingreso: 'Ingreso fijo', deuda: 'Cuota de deuda' };
function vCalendario() {
  const ev = D.eventosMes(E, ui.mes), h = D.hoy();
  const blancos = (D.diaSemana(`${ui.mes}-01`) + 6) % 7; // la semana empieza el lunes
  const celdas = '<span></span>'.repeat(blancos) + Array.from({ length: D.diasEnMes(ui.mes) }, (_, i) => {
    const f = `${ui.mes}-${String(i + 1).padStart(2, '0')}`, es = ev[f] || [];
    return `<button class="dia ${f === h ? 'hoy' : ''} ${f === ui.diaCal ? 'sel' : ''}" data-a="diaCal" data-v="${f}" aria-label="${D.fechaLarga(f)}${es.length ? `: ${es.map(x => x.nombre).join(', ')}` : ''}">
      <span>${i + 1}</span><i>${[...new Set(es.map(x => x.tipo))].map(t => `<b class="p-${t}"></b>`).join('')}</i></button>`;
  }).join('');
  const sel = ui.diaCal?.startsWith(ui.mes) ? ui.diaCal : '';
  const filas = Object.entries(ev).filter(([f]) => !sel || f === sel).sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([f, xs]) => xs.map(x => `<div class="mov"><span class="punto-ev p-${x.tipo}"></span>
      <div class="txt"><b>${esc(x.nombre)}</b><span class="sec">${D.fechaCorta(f)} · ${NOMBRE_EV[x.tipo]}</span></div>
      <div class="m ${x.tipo === 'ingreso' ? 'pos' : ''}">${monto(x.monto, x.moneda)}<span class="sec ${x.estado === 'listo' ? 'txt-verde' : x.estado === 'atrasado' ? 'txt-rojo' : ''}">${x.estado === 'listo' ? (x.tipo === 'ingreso' ? 'recibido' : 'pagado') : ESTADO_EV[x.estado]}</span></div></div>`)).join('');
  return `<div class="tarjeta">${selMes()}
    <div class="cal">${['L', 'M', 'K', 'J', 'V', 'S', 'D'].map(d => `<span class="et">${d}</span>`).join('')}${celdas}</div>
    <div class="fila-ley">${Object.entries(NOMBRE_EV).map(([t, n]) => `<span class="sec"><b class="punto-ev p-${t}"></b> ${n}</span>`).join('')}</div></div>
  <div class="tarjeta"><h2>${sel ? D.fechaLarga(sel) : 'Todo el mes'}</h2>${filas || `<p class="vacio">${sel ? 'Nada este día.' : 'Nada este mes. Agregá tus recurrentes en la pestaña Recurrentes.'}</p>`}</div>`;
}

// ---------------- Metas ----------------
const detAbonos = ab => ab.length ? `<details><summary>Abonos (${ab.length})</summary>${ab.slice().reverse().map(a => `<div class="mini"><span>${D.fechaCorta(a.fecha)}</span><span>${monto(a.monto, a.moneda)}</span><button class="ico-btn chico" data-a="borrarAbono" data-v="${a.id}" aria-label="Borrar abono">${icono('basura')}</button></div>`).join('')}</details>` : '';
// 1 − 0,8 da 0,19999… en la compu: sin el margen, 20 % se mostraba como 19 %
const pctTxt = p => Math.floor(p * 100 + 1e-9);
const mesesTxt = n => { const r = Math.floor(n * 10) / 10; return `${r.toLocaleString('es-CR')} ${r === 1 ? 'mes' : 'meses'}`; };
function tarjetaFondo() {
  const f = E.metas[D.ID_FONDO];
  if (!f || f.del) return `<div class="tarjeta"><h2>Fondo de emergencia</h2>
    <p class="nota">Plata apartada solo para imprevistos: una cita médica, una reparación o quedarte sin ingresos un tiempo. Lo usual es juntar entre 3 y 6 meses de lo que gastás.</p>
    <div class="acciones"><button class="btn chico" data-a="crearFondo">${icono('mas')} Crear fondo</button></div></div>`;
  const s = D.estadoFondo(E);
  return `<div class="tarjeta meta"><div class="cab"><h2>Fondo de emergencia</h2><span class="pct">${pctTxt(s.pct)} %</span></div>
    <div class="barra"><i class="verde" style="width:${(s.pct * 100).toFixed(1)}%"></i></div>
    <p>Tenés <strong>${crc(s.saldo)}</strong>${s.promedio > 0 ? `: te alcanza para <strong>${mesesTxt(s.meses)}</strong> de gastos` : ''}.</p>
    <p class="sec">${s.promedio > 0 ? `Gastás en promedio ${crc(s.promedio)} al mes, así que ${s.mesesObjetivo} meses son ${crc(s.objetivo)}.` : 'Cuando tengas gastos anotados te digo cuántos meses te cubre.'}</p>
    <label class="lbl-fila">Meta en meses<select data-fondo>${[3, 4, 5, 6].map(n => `<option ${s.mesesObjetivo === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <div class="acciones"><button class="btn chico" data-a="abono" data-v="${f.id}">${icono('mas')} Abono</button>
      <button class="ico-btn chico" data-a="borrarMeta" data-v="${f.id}" aria-label="Borrar fondo">${icono('basura')}</button></div>
    ${detAbonos(D.abonosMeta(E, f.id))}</div>`;
}
function tarjetaReto() {
  const r = D.lista(E, 'retos')[0];
  if (!r) return `<div class="tarjeta"><h2>Reto de 52 semanas</h2>
    <p class="nota">Cada semana ahorrás un poco más: la semana 1 el monto base, la 2 el doble, y así hasta la 52. Con ₡500 de base juntás ₡689 000 en un año.</p>
    <form data-f="reto" class="form-col">
      <input name="base" inputmode="decimal" placeholder="Monto base (ej. 500)" required aria-label="Monto base">
      <label class="check"><input type="checkbox" name="inverso">Al revés: empezar por la semana más cara</label>
      <label>Guardar en<select name="meta"><option value="">Una meta nueva para el reto</option>${D.lista(E, 'metas').map(m => `<option value="${m.id}">${esc(m.nombre)}</option>`).join('')}</select></label>
      <button class="btn">Empezar el reto</button></form></div>`;
  const s = D.estadoReto(E, r), m = E.metas[r.metaId], mon = m?.moneda || 'CRC';
  return `<div class="tarjeta"><div class="cab"><h2>Reto de 52 semanas</h2><span class="pct">${s.marcadas.length}/52</span></div>
    <p>Llevás <strong>${monto(s.ahorrado, mon)}</strong> de ${monto(s.total, mon)}${m ? ` · se guarda en "${esc(m.nombre)}"` : ''}.</p>
    <p class="sec">Vas en la semana ${s.semana}: te toca ${monto(D.montoSemana(r, s.semana), mon)}. Tocá una semana para marcarla o desmarcarla.</p>
    <div class="semanas">${Array.from({ length: 52 }, (_, i) => {
      const n = i + 1, h = s.marcadas.includes(n);
      return `<button class="semana ${h ? 'hecha' : ''} ${n === s.semana ? 'actual' : ''}" data-a="semanaReto" data-v="${n}" aria-pressed="${h}" aria-label="Semana ${n}" data-tip="Semana ${n}: ${monto(D.montoSemana(r, n), mon)}">${n}</button>`;
    }).join('')}</div>
    <div class="acciones fin"><button class="ico-btn chico" data-a="borrarReto" data-v="${r.id}" aria-label="Borrar reto">${icono('basura')}</button></div></div>`;
}
function vMetas() {
  const metas = D.lista(E, 'metas').filter(m => m.id !== D.ID_FONDO).sort((a, b) => a.creada.localeCompare(b.creada));
  return `<div class="cab"><h1>Metas de ahorro</h1><button class="btn chico" data-a="nuevaMeta">${icono('mas')} Nueva meta</button></div>
  <div class="rejilla">${tarjetaFondo()}${tarjetaReto()}</div>
  ${metas.length ? '' : '<p class="vacio">Todavía no tenés otras metas. Creá una para ahorrar con un objetivo.</p>'}
  <div class="rejilla">${metas.map(m => {
    const s = D.estadoMeta(E, m), ab = D.abonosMeta(E, m.id);
    return `<div class="tarjeta meta"><div class="cab"><h2>${esc(m.nombre)}</h2><span class="pct">${pctTxt(s.pct)} %</span></div>
      <div class="barra"><i class="sakura" style="width:${(s.pct * 100).toFixed(1)}%"></i></div>
      <p>${monto(s.ahorrado, m.moneda)} de ${monto(m.objetivo, m.moneda)}${s.falta > 0 ? ` · faltan ${monto(s.falta, m.moneda)}` : ' · <span class="txt-verde">¡meta cumplida!</span>'}</p>
      ${m.limite ? `<p class="sec">Fecha límite: ${D.fechaLarga(m.limite)}${s.porMes ? ` · necesitás ${monto(s.porMes, m.moneda)} por mes` : ''}</p>` : ''}
      ${s.atrasada ? `<p class="txt-rojo">Vas atrasado: a esta altura deberías llevar ${monto(s.esperado, m.moneda)}.</p>` : ''}
      <div class="acciones"><button class="btn chico" data-a="abono" data-v="${m.id}">${icono('mas')} Abono</button>
        <button class="ico-btn chico" data-a="editarMeta" data-v="${m.id}" aria-label="Editar meta">${icono('lapiz')}</button>
        <button class="ico-btn chico" data-a="borrarMeta" data-v="${m.id}" aria-label="Borrar meta">${icono('basura')}</button></div>
      ${detAbonos(ab)}
    </div>`;
  }).join('')}</div>`;
}

// ---------------- Deudas ----------------
function vDeudas() {
  const deudas = D.lista(E, 'deudas').sort((a, b) => a.inicio.localeCompare(b.inicio));
  return `<div class="cab"><h1>Deudas y préstamos</h1><button class="btn chico" data-a="nuevaDeuda">${icono('mas')} Nueva deuda</button></div>
  ${deudas.length ? '' : '<p class="vacio">No tenés deudas registradas.</p>'}
  <div class="rejilla">${deudas.map(d => {
    const saldo = D.saldoDeuda(E, d), pagos = D.pagosDeuda(E, d.id), meses = D.mesesRestantes(saldo, d.cuota, d.tasa);
    let acumulado = d.total;
    const puntos = [{ et: D.fechaCorta(d.inicio), valor: d.total, tip: `${D.fechaCorta(d.inicio)}: ${monto(d.total, d.moneda)}` },
      ...pagos.map(p => { acumulado = Math.max(0, acumulado - p.monto); return { et: D.fechaCorta(p.fecha), valor: acumulado, tip: `${D.fechaCorta(p.fecha)}: ${monto(acumulado, d.moneda)}` }; })];
    const pct = d.total ? 1 - saldo / d.total : 0;
    return `<div class="tarjeta deuda"><div class="cab"><h2>${esc(d.acreedor)}</h2><span class="pct">${pctTxt(pct)} % pagado</span></div>
      <div class="barra"><i class="verde" style="width:${(pct * 100).toFixed(1)}%"></i></div>
      <p>Saldo pendiente: <strong>${monto(saldo, d.moneda)}</strong> de ${monto(d.total, d.moneda)}</p>
      <p class="sec">Cuota ${monto(d.cuota, d.moneda)} el día ${d.dia} de cada mes${d.tasa ? ` · interés ${String(d.tasa).replace('.', ',')} % anual` : ''}</p>
      <p class="sec">${saldo <= 0 ? '<span class="txt-verde">Deuda saldada</span>' : meses === Infinity ? '<span class="txt-rojo">Con esa cuota no se cubren ni los intereses.</span>' : meses ? `Faltan unos ${meses} ${meses === 1 ? 'mes' : 'meses'}` : ''}</p>
      ${G.linea(puntos)}
      <div class="acciones"><button class="btn chico" data-a="pago" data-v="${d.id}">${icono('mas')} Anotar pago</button>
        <button class="ico-btn chico" data-a="editarDeuda" data-v="${d.id}" aria-label="Editar deuda">${icono('lapiz')}</button>
        <button class="ico-btn chico" data-a="borrarDeuda" data-v="${d.id}" aria-label="Borrar deuda">${icono('basura')}</button></div>
      ${pagos.length ? `<details><summary>Pagos (${pagos.length})</summary>${pagos.slice().reverse().map(p => `<div class="mini"><span>${D.fechaCorta(p.fecha)}</span><span>${monto(p.monto, d.moneda)}</span><button class="ico-btn chico" data-a="borrarPago" data-v="${p.id}" aria-label="Borrar pago">${icono('basura')}</button></div>`).join('')}</details>` : ''}
    </div>`;
  }).join('')}</div>`;
}

// ---------------- Ajustes ----------------
function vAjustes() {
  const a = D.ajustes(E), info = D.tcInfo(E, D.hoy());
  const manuales = D.lista(E, 'tcManual').sort((x, y) => y.id.localeCompare(x.id));
  return `<h1>Ajustes</h1>
  <div class="rejilla">
  <div class="tarjeta"><h2>Perfil y apariencia</h2>
    <form data-f="nombre" class="fila"><input name="nombre" value="${esc(a.nombre)}" aria-label="Tu nombre" required><button class="btn">Guardar</button></form>
    <p class="et">Tema</p><div class="seg">${[['auto', 'Automático'], ['claro', 'Claro'], ['oscuro', 'Oscuro']].map(([k, n]) =>
      `<button data-a="tema" data-v="${k}" class="${(meta.tema || 'auto') === k ? 'activa' : ''}">${n}</button>`).join('')}</div></div>

  <div class="tarjeta"><h2>Tipo de cambio</h2>
    <p>Hoy: <strong>${info ? D.tcFmt(info.valor) : '—'}</strong> <span class="sec">${info ? `(${info.fuente}, ${D.fechaLarga(info.fecha)})` : ''}</span></p>
    <label>Usar el de <select data-ajuste="tcTipo"><option value="venta" ${a.tcTipo !== 'compra' ? 'selected' : ''}>venta</option><option value="compra" ${a.tcTipo === 'compra' ? 'selected' : ''}>compra</option></select></label>
    ${info?.fuente === 'BCCR' && info.fecha < D.hoy() ? `<p class="txt-rojo">El dato automático más reciente es del ${D.fechaLarga(info.fecha)}.</p>` : ''}
    <p class="nota">Se actualiza solo cada día con el dato oficial del BCCR. Si querés usar otro valor, escribilo a mano:</p>
    <form data-f="tcManual" class="fila"><input name="fecha" type="date" value="${D.hoy()}" aria-label="Fecha"><input name="valor" inputmode="decimal" placeholder="₡ por $1" required aria-label="Valor"><button class="btn">Guardar</button></form>
    ${manuales.slice(0, 6).map(t => `<div class="mini"><span>${D.fechaLarga(t.id)}</span><span>${D.tcFmt(t.valor)}</span><button class="ico-btn chico" data-a="borrarTc" data-v="${t.id}" aria-label="Borrar">${icono('basura')}</button></div>`).join('')}</div>

  <div class="tarjeta"><h2>Categorías</h2>
    ${D.cats(E).map(c => `<div class="mini">${icCat(c)}<span class="crece">${esc(c.nombre)}</span>${c.id === 'otros' ? '' : `<button class="ico-btn chico" data-a="borrarCat" data-v="${c.id}" aria-label="Borrar ${esc(c.nombre)}">${icono('basura')}</button>`}</div>`).join('')}
    <form data-f="nuevaCat" class="nueva-cat"><input name="nombre" placeholder="Nueva categoría" required aria-label="Nombre de la categoría">
      <div class="iconos-sel" role="radiogroup" aria-label="Ícono">${ICONOS_EXTRA.map((n, i) => `<label><input type="radio" name="icono" value="${n}" ${i ? '' : 'checked'}><span>${icono(n)}</span></label>`).join('')}</div>
      <button class="btn">Agregar</button></form></div>

  <div class="tarjeta"><h2>Seguridad</h2>
    <form data-f="cambiarPass" class="form-col">
      <input name="actual" type="password" placeholder="Contraseña actual" required autocomplete="current-password">
      <input name="nueva" type="password" placeholder="Contraseña nueva (mínimo 8)" minlength="8" required autocomplete="new-password">
      <input name="nueva2" type="password" placeholder="Repetí la nueva" minlength="8" required autocomplete="new-password">
      <button class="btn">Cambiar contraseña</button></form>
    <p class="et">Face ID / Touch ID en este dispositivo</p>
    ${meta.prf ? `<button class="btn sec-btn" data-a="quitarFaceID">Desactivar Face ID</button>` : `<button class="btn sec-btn" data-a="activarFaceID">${icono('faceid')} Activar Face ID</button>`}
    <p class="nota">Necesita iOS 18.4 o más nuevo. La contraseña siempre sirve como respaldo.</p>
    <button class="btn sec-btn" data-a="bloquear">${icono('candado')} Bloquear ahora</button></div>

  <div class="tarjeta"><h2>Sincronización con GitHub</h2>
    ${cfgSync && !ui.cambiarToken ? `
    <p>Conectado a <strong>${esc(cfgSync.repo)}</strong></p>
    <p class="sec">${sync.enCurso ? 'Sincronizando…' : meta.ultimaSync ? `Última sincronización: ${hace(meta.ultimaSync)}` : 'Todavía no se ha sincronizado.'}</p>
    ${sync.error ? `<p class="txt-rojo">${esc(sync.error)}</p>` : ''}
    <div class="acciones"><button class="btn" data-a="sincronizar" ${sync.enCurso ? 'disabled' : ''}>Sincronizar ahora</button></div>
    <div class="acciones"><button class="btn sec-btn chico" data-a="cambiarToken">Cambiar token</button><button class="btn sec-btn chico peligro" data-a="desconectarSync">Desconectar</button></div>`
    : `<p class="nota">Guarda una copia cifrada de tus datos en tu repositorio privado para usar la app en la compu y en el celular. Pegá aquí el token de este dispositivo; se guarda cifrado.</p>
    <form data-f="conectarSync" class="form-col">
      <input name="token" type="password" required placeholder="Token (github_pat_…)" autocomplete="off" spellcheck="false" autocapitalize="off" aria-label="Token de GitHub">
      <input name="repo" required value="${esc(cfgSync?.repo || S.repoSugerido())}" placeholder="usuario/finanzas-datos" autocomplete="off" spellcheck="false" autocapitalize="off" aria-label="Repositorio">
      <button class="btn">Conectar</button></form>`}</div>

  ${tarjetaLector()}

  <div class="tarjeta"><h2>Botones rápidos</h2>
    <p class="nota">Para lo que comprás seguido, como el café o el bus. Con un toque en Inicio o en Movimientos queda anotado como gasto de hoy.</p>
    ${D.lista(E, 'rapidos').sort((x, y) => x.nombre.localeCompare(y.nombre)).map(b => `<div class="mini"><span class="crece">${esc(b.nombre)}</span><span>${monto(b.monto, b.moneda)}</span><button class="ico-btn chico" data-a="borrarRapido" data-v="${b.id}" aria-label="Borrar ${esc(b.nombre)}">${icono('basura')}</button></div>`).join('')}
    <form data-f="rapido" class="form-col">
      <input name="nombre" placeholder="Nombre (ej. Café)" required maxlength="24" aria-label="Nombre del botón">
      <div class="fila"><input name="monto" inputmode="decimal" placeholder="Monto" required aria-label="Monto">
        <select name="moneda" aria-label="Moneda"><option value="CRC">₡</option><option value="USD">$</option></select></div>
      <div class="fila"><select name="cat" aria-label="Categoría">${D.cats(E).map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('')}</select>
        <select name="medio" aria-label="Medio">${D.MEDIOS.map(x => `<option>${x}</option>`).join('')}</select></div>
      <button class="btn">Agregar botón</button></form>
    <p class="et">Gastos hormiga</p>
    <form data-f="hormiga" class="fila"><label>Cuento como hormiga los gastos de hasta (₡)<input name="limite" inputmode="decimal" value="${D.numPlano(a.hormiga ?? 3000)}" required></label><button class="btn">Guardar</button></form></div>

  <div class="tarjeta"><h2>Exportar movimientos</h2>
    <p class="nota">Para abrir tus movimientos en Excel o Google Sheets. Ojo: este archivo sale sin cifrar.</p>
    <form data-f="exportar" class="form-col"><div class="fila"><label>Desde<input name="desde" type="date" value="${D.mesDe(D.hoy())}-01" required></label><label>Hasta<input name="hasta" type="date" value="${D.hoy()}" required></label></div>
      <div class="acciones"><button type="button" class="btn sec-btn" data-a="exportar" data-v="xlsx">Excel (.xlsx)</button><button type="button" class="btn sec-btn" data-a="exportar" data-v="csv">CSV</button></div></form></div>

  <div class="tarjeta"><h2>Respaldo</h2>
    <p class="nota">Un archivo cifrado con todos tus datos. Para cargarlo vas a necesitar la contraseña que tenías cuando lo descargaste.</p>
    <div class="acciones"><button class="btn sec-btn" data-a="descargarRespaldo">Descargar respaldo</button>
      <label class="btn sec-btn">Cargar respaldo<input type="file" accept=".json,application/json" data-respaldo hidden></label></div></div>

  <div class="tarjeta"><h2>Este dispositivo</h2>
    <p class="nota">Borra todos los datos guardados en este navegador. No se puede deshacer.</p>
    <button class="btn peligro" data-a="borrarTodo">Borrar todo de este dispositivo</button></div>
  </div>`;
}

// ---------------- Correo ----------------
const pendientes = () => D.pendientesCorreo(E, correo?.movs).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
function botonCorreo() {
  const llave = E.llaves.correo, n = pendientes().length;
  if (!llave || llave.del) return `<p class="nota">Para que tus compras se anoten solas desde el correo, creá la llave en Ajustes, en "Lector de correos".</p>`;
  return `<button class="btn ${n ? '' : 'sec-btn'} ancho" data-a="tab" data-v="correo">${icono('correo')} Revisar movimientos del correo${n ? ` <span class="globo">${n}</span>` : ''}</button>`;
}

function filaRevision(m) {
  if (m.noReconocido) return `<div class="rev no-rec"><div class="txt"><b>No pude leer este correo</b>
    <span class="sec">${m.fecha ? D.fechaCorta(m.fecha) + ' · ' : ''}${esc(m.remitente)}</span><span class="sec">"${esc(m.asunto)}"</span>
    <span class="nota">Si era un movimiento, anotalo a mano. Al confirmar se quita de esta lista.</span></div></div>`;
  const ing = m.tipo === 'ingreso', sug = D.sugerirCorreo(E, m);
  const dd = sug.startsWith('deuda:') ? sug.slice(6) : '';
  const chips = [m.origen === 'siri' ? 'desde Siri' : 'desde correo', m.confirmar ? '¿viaje o Uber Eats? revisá la categoría' : '',
    dd ? (ing ? `parece que ${dd} te está pagando lo que te debe` : `parece el pago de lo que le debés a ${dd}`) : ''].filter(Boolean);
  // personas con cuentas pendientes: el movimiento se puede anotar como pago de esa cuenta (no cuenta como ingreso ni gasto)
  const deudas = D.saldosCompartidas(E).filter(s => s.sentido === (ing ? 'meDeben' : 'debo') && s.saldo > 0 && s.moneda === m.moneda);
  const opDeudas = deudas.length ? `<optgroup label="Cuenta compartida">${deudas.map(s => `<option value="deuda:${esc(s.persona)}" ${sug === `deuda:${s.persona}` ? 'selected' : ''}>${ing
    ? `Pago de ${esc(s.persona)} (te debe ${monto(s.saldo, s.moneda)})` : `Pago a ${esc(s.persona)} (le debés ${monto(s.saldo, s.moneda)})`}</option>`).join('')}</optgroup>` : '';
  const sel = ing
    ? `<select name="valor|${m.id}" aria-label="Fuente del ingreso">${Object.entries(D.FUENTES).map(([k, v]) => `<option value="${k}" ${sug === k ? 'selected' : ''}>${v}</option>`).join('')}${opDeudas}</select>`
    : `<select name="valor|${m.id}" aria-label="Categoría">${D.cats(E).map(c => `<option value="${c.id}" ${sug === c.id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}${opDeudas}</select>`;
  return `<div class="rev ${m.confirmar ? 'confirmar' : ''}">
    <div class="txt"><b>${esc(m.quien || (ing ? 'SINPE recibido' : m.medio === 'SINPE' ? 'SINPE enviado' : 'Gasto'))}</b>
      <span class="sec">${[m.fecha ? D.fechaCorta(m.fecha) : '', m.hora, ing ? 'Ingreso' : 'Gasto', m.medio].filter(Boolean).map(esc).join(' · ')}</span>
      ${m.nota ? `<span class="sec">${esc(m.nota)}</span>` : ''}
      <span>${chips.map(c => `<span class="chip">${esc(c)}</span>`).join(' ')}</span></div>
    <div class="campos"><div class="fila"><input name="monto|${m.id}" inputmode="decimal" value="${D.numPlano(m.monto, m.moneda)}" aria-label="Monto">
      <span class="moneda-fija">${m.moneda === 'USD' ? '$' : '₡'}</span></div>${sel}
      <label class="check"><input type="checkbox" name="descartar|${m.id}"> Descartar</label>
      ${ing ? '' : `<button type="button" class="btn sec-btn chico" data-a="dividirCorreo" data-v="${m.id}">Dividir</button>`}</div></div>`;
}

function vCorreo() {
  const lista = pendientes(), llave = E.llaves.correo;
  const estado = !cfgSync ? 'Conectá primero la sincronización con GitHub (en Ajustes).'
    : !llave || llave.del ? 'Falta crear la llave para los correos (en Ajustes, "Lector de correos").'
    : lector.error ? lector.error
    : lector.sinArchivo ? 'Todavía no hay correos leídos. Cuando el lector corra por primera vez, aparecen aquí.'
    : correo ? `Última lectura del correo: ${hace(Date.parse(correo.generado))}` : 'Buscando…';
  return `<div class="cab"><h1>Revisar movimientos del correo</h1><button class="btn sec-btn chico" data-a="actualizarCorreo">Actualizar</button></div>
  <p class="sec">${esc(estado)}</p>
  ${lista.length ? `<form data-f="revisar" class="tarjeta lista-rev">
    <p class="nota">Revisá cada uno: podés cambiar la categoría o el monto, o marcar "Descartar". Al confirmar se guardan todos juntos.</p>
    ${lista.map(filaRevision).join('')}
    <button class="btn ancho">Confirmar ${lista.length} ${lista.length === 1 ? 'movimiento' : 'movimientos'}</button></form>`
    : correo ? '<p class="vacio">No hay movimientos nuevos. Todo al día.</p>' : ''}`;
}

function tarjetaLector() {
  const llave = E.llaves.correo;
  if (!llave || llave.del) return `<div class="tarjeta"><h2>Lector de correos</h2>
    <p class="nota">Crea un par de llaves: la pública se pega en GitHub para que el lector cifre tus movimientos, y la privada se queda cifrada dentro de tus datos para que solo esta app los pueda abrir.</p>
    <button class="btn" data-a="crearLlaveCorreo">Crear llave para los correos</button></div>`;
  return `<div class="tarjeta"><h2>Lector de correos</h2>
    <p class="nota">Llave pública: copiala y pegala en GitHub como el Secret <b>CLAVE_PUBLICA</b> del repositorio finanzas-datos. No es secreta: solo sirve para cifrar.</p>
    <textarea readonly rows="4" class="llave" aria-label="Llave pública">${esc(llave.pub)}</textarea>
    <div class="acciones"><button class="btn sec-btn" data-a="copiarLlave">Copiar llave pública</button></div>
    <p class="sec">${correo ? `Última lectura del correo: ${hace(Date.parse(correo.generado))}` : lector.sinArchivo ? 'El lector todavía no ha subido nada.' : ''}</p>
    ${lector.error ? `<p class="txt-rojo">${esc(lector.error)}</p>` : ''}</div>`;
}

// ---------------- Búsqueda ----------------
function vBuscar() {
  const q = ui.q.trim().toLowerCase(), digitos = q.replace(/\D/g, '');
  let res = [];
  if (q.length >= 2) res = D.lista(E, 'movs').filter(m => {
    const texto = [m.quien, m.nota, E.cats[m.cat]?.nombre, D.FUENTES[m.fuente], m.medio].join(' ').toLowerCase();
    return texto.includes(q) || (digitos.length >= 2 && String(Math.round(m.monto)).includes(digitos));
  }).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const porMes = {};
  for (const m of res) (porMes[D.mesDe(m.fecha)] ||= []).push(m);
  return `<h1>Buscar</h1>
  <input type="search" data-vivo="q" value="${esc(ui.q)}" placeholder="Comercio, persona, nota, categoría o monto" aria-label="Buscar" autofocus>
  ${q.length < 2 ? '<p class="vacio">Escribí al menos 2 letras.</p>' : res.length ? Object.entries(porMes).map(([mes, ms]) =>
    `<div class="tarjeta"><h2>${D.nombreMes(mes)} <span class="sec">· ${ms.length}</span></h2>${ms.map(filaMov).join('')}</div>`).join('') : '<p class="vacio">Sin resultados.</p>'}`;
}

// ---------------- Diálogos ----------------
function abrirDialogo(html) {
  dlg.innerHTML = `<button class="ico-btn chico cerrar-dlg" data-a="cerrarDlg" aria-label="Cerrar">${icono('cerrar')}</button>${html}`;
  dlg.showModal();
}
const formMeta = (m = {}) => `<h2>${m.id ? 'Editar meta' : 'Nueva meta'}</h2><form data-f="meta" data-id="${m.id || ''}" class="form-col">
  <input name="nombre" placeholder="Nombre (ej. Laptop)" value="${esc(m.nombre)}" required>
  <div class="fila"><input name="objetivo" inputmode="decimal" placeholder="Monto objetivo" value="${m.objetivo ? D.numPlano(m.objetivo, m.moneda) : ''}" required>
  <select name="moneda"><option value="CRC" ${m.moneda !== 'USD' ? 'selected' : ''}>₡</option><option value="USD" ${m.moneda === 'USD' ? 'selected' : ''}>$</option></select></div>
  <label>Fecha límite (opcional)<input name="limite" type="date" value="${m.limite || ''}"></label>
  <button class="btn">Guardar</button></form>`;
const formDeuda = (d = {}) => `<h2>${d.id ? 'Editar deuda' : 'Nueva deuda'}</h2><form data-f="deuda" data-id="${d.id || ''}" class="form-col">
  <input name="acreedor" placeholder="¿A quién le debés?" value="${esc(d.acreedor)}" required>
  <div class="fila"><input name="total" inputmode="decimal" placeholder="Monto total" value="${d.total ? D.numPlano(d.total, d.moneda) : ''}" required>
  <select name="moneda"><option value="CRC" ${d.moneda !== 'USD' ? 'selected' : ''}>₡</option><option value="USD" ${d.moneda === 'USD' ? 'selected' : ''}>$</option></select></div>
  <input name="cuota" inputmode="decimal" placeholder="Cuota mensual" value="${d.cuota ? D.numPlano(d.cuota, d.moneda) : ''}" required>
  <div class="fila"><label>Día de pago<input name="dia" type="number" min="1" max="31" value="${d.dia || ''}" required></label>
  <label>Interés anual % (opcional)<input name="tasa" inputmode="decimal" value="${d.tasa ? String(d.tasa).replace('.', ',') : ''}"></label></div>
  <label>Desde<input name="inicio" type="date" value="${d.inicio || D.hoy()}" required></label>
  <button class="btn">Guardar</button></form>`;
function formRec(r = {}) {
  const ing = r.clase === 'ingreso', frec = r.frecuencia || 'mensual', mon = r.moneda || 'CRC';
  const opc = (obj, actual) => Object.entries(obj).map(([k, v]) => `<option value="${k}" ${String(actual) === String(k) ? 'selected' : ''}>${esc(v)}</option>`).join('');
  return `<h2>${r.id ? 'Editar' : 'Nuevo'} ${ing ? 'ingreso fijo' : 'gasto recurrente'}</h2>
  <form data-f="rec" data-id="${r.id || ''}" data-clase="${ing ? 'ingreso' : 'gasto'}" class="form-col form-rec">
    <input name="nombre" placeholder="${ing ? 'Nombre (ej. Beca)' : 'Nombre (ej. Spotify)'}" value="${esc(r.nombre)}" required>
    <div class="fila"><input name="monto" inputmode="decimal" placeholder="Monto" value="${r.monto ? D.numPlano(r.monto, mon) : ''}" required>
      <select name="moneda" aria-label="Moneda">${opc({ CRC: '₡', USD: '$' }, mon)}</select></div>
    ${ing ? `<select name="fuente" aria-label="Fuente">${opc(D.FUENTES, r.fuente || 'beca')}</select>`
      : `<select name="cat" aria-label="Categoría">${opc(Object.fromEntries(D.cats(E).map(c => [c.id, c.nombre])), r.cat)}</select>`}
    <select name="medio" aria-label="Medio">${opc(Object.fromEntries(D.MEDIOS.map(x => [x, x])), r.medio || (ing ? 'SINPE' : 'Tarjeta'))}</select>
    <label>Frecuencia<select name="frecuencia">${opc(D.FRECUENCIAS, frec)}</select></label>
    <div class="fila f-dias"><label>Día<input name="dia1" type="number" min="1" max="31" value="${r.dias?.[0] || ''}"></label>
      <label class="f-dia2">Segundo día<input name="dia2" type="number" min="1" max="31" value="${r.dias?.[1] || ''}"></label>
      <label class="f-mes">Mes<select name="mes">${opc(Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, nombreMesSolo(i + 1)])), r.mes || 1)}</select></label></div>
    <label class="f-sem">Día de la semana<select name="diaSemana">${opc(Object.fromEntries([1, 2, 3, 4, 5, 6, 0].map(i => [i, D.DIAS_SEMANA[i]])), r.diaSemana ?? 1)}</select></label>
    <label>Texto en el correo (opcional)<input name="texto" value="${esc(r.texto)}" placeholder="${ing ? 'Ej. el nombre de quien te manda el SINPE' : 'Ej. SPOTIFY'}" autocapitalize="characters"></label>
    <p class="nota">Si un cobro o SINPE del correo trae este texto, con un monto parecido (5 % de diferencia o menos) y a 3 días o menos de la fecha, se une solo con este ${ing ? 'ingreso' : 'pago'} y no se duplica.</p>
    <button class="btn">Guardar</button></form>`;
}
const formMontoFecha =(titulo, f, id, valor, moneda) => `<h2>${esc(titulo)}</h2><form data-f="${f}" data-id="${id}" class="form-col">
  <div class="fila"><input name="monto" inputmode="decimal" placeholder="Monto" value="${valor ? D.numPlano(valor, moneda) : ''}" required autofocus><span class="moneda-fija">${moneda === 'USD' ? '$' : '₡'}</span></div>
  <input name="fecha" type="date" value="${D.hoy()}" required><button class="btn">Guardar</button></form>`;

// ---------------- Acciones ----------------
const ACC = {
  paso: v => { paso = v; errorBloqueo = ''; traer = null; render(); },
  sincronizar: () => sincronizarAhora(true),
  desconectarSync: async () => {
    if (!confirm('¿Desconectar este dispositivo de GitHub? Tus datos se quedan aquí y en GitHub; solo se borra el token de este dispositivo.')) return;
    delete meta.sync; delete meta.ultimaSync; cfgSync = null; sync.error = '';
    await guardarMeta(); render(); aviso('Sincronización desconectada');
  },
  cambiarToken: () => { ui.cambiarToken = true; render(); },
  descargarRespaldo: () => descargarRespaldo(),
  faceid: () => abrirFaceID(),
  bloquear: () => bloquear(),
  tab: v => { if (ui.tab !== v) { ui.tab = v; ui.anim = true; scrollTo(0, 0); } render(); },
  mes: v => { ui.mes = D.sumarMeses(ui.mes, +v); render(); },
  vistaMov: v => { ui.vistaMov = v; render(); },
  cerrarAlerta: v => cambiar(() => D.poner(E, 'alertasCerradas', { id: v })),
  cerrarDlg: () => dlg.close(),
  deshacer: () => { toast._deshacer?.(); toast.className = ''; },
  nuevoIngreso: () => abrirDialogo(`<h2>Nuevo ingreso</h2>${formMov({ tipo: 'ingreso', medio: 'SINPE', fecha: ui.mes === D.mesDe(D.hoy()) ? D.hoy() : ui.mes + '-01' })}`),
  editarMov: v => abrirDialogo(`<h2>Editar movimiento</h2>${formMov(E.movs[v])}`),
  borrarMov: v => {
    const rel = D.lista(E, 'compartidas').filter(c => c.movId === v); // lo que te deben o debés por este gasto, o el abono de este pago
    if (!confirm(`¿Borrar este movimiento?${rel.length ? ' También se borra lo que quedó en "Me deben / Debo" por él.' : ''}`)) return;
    cambiar(() => { D.quitar(E, 'movs', v); rel.forEach(c => D.quitar(E, 'compartidas', c.id)); });
    aviso('Movimiento borrado', () => cambiar(() => { D.poner(E, 'movs', E.movs[v]); rel.forEach(c => D.poner(E, 'compartidas', E.compartidas[c.id])); }));
  },
  dividir: (v, b) => {
    const base = movDeForm(b.closest('form'));
    if (!base) return;
    ui.dividir = { base };
    abrirDialogo(formDividir(base));
  },
  dividirCorreo: v => {
    const item = pendientes().find(x => x.id === v), f = $('form[data-f=revisar]');
    if (!item) return;
    const valorMonto = D.parseMonto(f?.elements[`monto|${v}`]?.value), cat = f?.elements[`valor|${v}`]?.value;
    const base = { ...item, monto: valorMonto > 0 ? valorMonto : item.monto, cat: cat && !cat.startsWith('deuda:') ? cat : D.sugerirCorreo(E, item) };
    ui.dividir = { base, correo: item };
    abrirDialogo(formDividir(base));
  },
  pagoComp: v => {
    const [sentido, p, moneda] = v.split('|'), persona = decodeURIComponent(p);
    const s = D.saldosCompartidas(E).find(x => x.sentido === sentido && x.moneda === moneda && x.persona === persona);
    abrirDialogo(`<h2>${sentido === 'meDeben' ? `${esc(persona)} te pagó` : `Le pagaste a ${esc(persona)}`}</h2>
      <form data-f="pagoComp" data-v="${esc(v)}" class="form-col">
      <p class="sec">${sentido === 'meDeben' ? 'Te debe' : 'Le debés'} ${monto(s?.saldo || 0, moneda)}. Este pago no cuenta como ${sentido === 'meDeben' ? 'ingreso' : 'gasto'}.</p>
      <div class="fila"><input name="monto" inputmode="decimal" value="${D.numPlano(s?.saldo || 0, moneda)}" required aria-label="Monto"><span class="moneda-fija">${moneda === 'USD' ? '$' : '₡'}</span></div>
      <select name="medio" aria-label="Medio">${D.MEDIOS.map(x => `<option ${x === 'SINPE' ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <input name="fecha" type="date" value="${D.hoy()}" required aria-label="Fecha"><button class="btn">Guardar</button></form>`);
  },
  borrarComp: v => {
    const c = E.compartidas[v];
    if (!confirm(c.clase === 'abono' ? '¿Borrar este pago? También se borra el movimiento del pago.' : '¿Borrar esta parte de la cuenta?')) return;
    cambiar(() => { D.quitar(E, 'compartidas', v); if (c.clase === 'abono' && c.movId) D.quitar(E, 'movs', c.movId); });
  },
  confirmarMov: v => { cambiar(() => D.confirmarMov(E, E.movs[v])); aviso('Confirmado'); },
  nuevoRec: v => abrirDialogo(formRec({ clase: v })),
  editarRec: v => abrirDialogo(formRec(E.recurrentes[v])),
  borrarRec: v => {
    if (!confirm(`¿Borrar "${E.recurrentes[v].nombre}"? Los pendientes sin confirmar también se borran; lo que ya confirmaste se queda.`)) return;
    cambiar(() => {
      D.quitar(E, 'recurrentes', v);
      D.lista(E, 'movs').filter(m => m.estado === 'pendiente' && m.rec?.startsWith(`r-${v}-`)).forEach(m => D.quitar(E, 'movs', m.id));
    });
  },
  rapido: v => {
    const b = E.rapidos[v]; let m;
    cambiar(() => { m = D.usarRapido(E, b); });
    aviso(`${b.nombre} anotado: ${monto(b.monto, b.moneda)}`, () => cambiar(() => D.quitar(E, 'movs', m.id)));
  },
  borrarRapido: v => cambiar(() => D.quitar(E, 'rapidos', v)),
  verCierre: v => abrirDialogo(vCierre(v)),
  crearFondo: () => cambiar(() => D.poner(E, 'metas', { id: D.ID_FONDO, nombre: 'Fondo de emergencia', especial: 'fondo', mesesObjetivo: 3, objetivo: 0, moneda: 'CRC', limite: null, creada: D.hoy() })),
  semanaReto: v => {
    const r = D.lista(E, 'retos')[0]; let marcada;
    cambiar(() => { marcada = D.marcarSemana(E, r, +v); });
    aviso(marcada ? `Semana ${v} marcada: ${monto(D.montoSemana(r, +v), E.metas[r.metaId]?.moneda)}` : `Semana ${v} desmarcada`);
  },
  borrarReto: v => { if (confirm('¿Borrar el reto? Lo que ya ahorraste se queda en la meta.')) cambiar(() => D.quitar(E, 'retos', v)); },
  exportar: (v, b) => {
    const f = b.form, desde = f.desde.value, hasta = f.hasta.value;
    if (!desde || !hasta || desde > hasta) return aviso('Revisá las fechas');
    const n = D.filasExport(E, desde, hasta).length;
    if (!n) return aviso('No hay movimientos en esas fechas');
    // el aviso va en un diálogo propio (no confirm) para que el toque en "Descargar" abra la hoja de compartir del iPhone
    abrirDialogo(`<h2>Archivo sin cifrar</h2>
      <p>El archivo trae ${n} ${n === 1 ? 'movimiento' : 'movimientos'} y <strong>no va cifrado</strong>: cualquiera que lo abra puede leerlos.</p>
      <p class="nota">Guardalo en un lugar seguro y borralo cuando ya no lo ocupés. No lo subás a ningún lado público.</p>
      <div class="acciones"><button class="btn" data-a="bajarExport" data-v="${v}|${desde}|${hasta}">Descargar ${v === 'csv' ? 'CSV' : 'Excel'}</button></div>`);
  },
  bajarExport: v => {
    const [fmt, desde, hasta] = v.split('|'), filas = D.filasExport(E, desde, hasta);
    const datos = fmt === 'csv' ? X.csv(D.COLUMNAS_EXPORT, filas) : X.xlsx(D.COLUMNAS_EXPORT, filas);
    dlg.close();
    bajar(new File([datos], `movimientos-${desde}-a-${hasta}.${fmt}`,
      { type: fmt === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  },
  diaCal: v => { ui.diaCal = ui.diaCal === v ? '' : v; render(); },
  nuevaMeta: () => abrirDialogo(formMeta()),
  editarMeta: v => abrirDialogo(formMeta(E.metas[v])),
  borrarMeta: v => {
    if (confirm('¿Borrar esta meta y todos sus abonos?')) cambiar(() => {
      D.quitar(E, 'metas', v); D.abonosMeta(E, v).forEach(a => D.quitar(E, 'abonos', a.id));
      D.lista(E, 'retos').filter(r => r.metaId === v).forEach(r => D.quitar(E, 'retos', r.id)); // el reto se queda sin dónde guardar
    });
  },
  abono: v => abrirDialogo(formMontoFecha(`Abono a ${E.metas[v].nombre}`, 'abono', v, '', E.metas[v].moneda)),
  borrarAbono: v => { if (confirm('¿Borrar este abono?')) cambiar(() => D.quitar(E, 'abonos', v)); },
  nuevaDeuda: () => abrirDialogo(formDeuda()),
  editarDeuda: v => abrirDialogo(formDeuda(E.deudas[v])),
  borrarDeuda: v => { if (confirm('¿Borrar esta deuda y sus pagos?')) cambiar(() => { D.quitar(E, 'deudas', v); D.pagosDeuda(E, v).forEach(p => D.quitar(E, 'pagos', p.id)); }); },
  pago: v => { const d = E.deudas[v]; abrirDialogo(formMontoFecha(`Pago a ${d.acreedor}`, 'pago', v, Math.min(d.cuota, D.saldoDeuda(E, d)), d.moneda)); },
  borrarPago: v => { if (confirm('¿Borrar este pago?')) cambiar(() => D.quitar(E, 'pagos', v)); },
  tema: async v => { meta.tema = v; await guardarMeta(); render(); },
  borrarTc: v => cambiar(() => D.quitar(E, 'tcManual', v)),
  borrarCat: v => {
    const n = D.lista(E, 'movs').filter(m => m.cat === v).length;
    if (!confirm(`¿Borrar la categoría ${E.cats[v].nombre}?${n ? ` Sus ${n} movimientos pasan a Otros.` : ''}`)) return;
    cambiar(() => { D.lista(E, 'movs').filter(m => m.cat === v).forEach(m => D.poner(E, 'movs', { ...m, cat: 'otros' })); D.quitar(E, 'cats', v); });
  },
  activarFaceID: async () => {
    try { meta.prf = await C.activarFaceID(mk, nombre()); await guardarMeta(); aviso('Face ID activado en este dispositivo'); }
    catch (e) {
      aviso(e.message === 'sin-prf' ? 'Este dispositivo no permite abrir la app con Face ID de forma segura (necesita iOS 18.4 o más nuevo). Seguís con la contraseña.'
        : e.name === 'NotAllowedError' ? 'Se canceló la activación.' : 'No se pudo activar Face ID.');
    }
    render();
  },
  quitarFaceID: async () => { delete meta.prf; await guardarMeta(); aviso('Face ID desactivado en este dispositivo'); render(); },
  actualizarCorreo: () => traerCorreo(true),
  crearLlaveCorreo: async () => {
    const btn = $('[data-a=crearLlaveCorreo]'); btn.disabled = true; btn.textContent = 'Creando…';
    const par = await C.nuevoParCorreo();
    cambiar(() => D.poner(E, 'llaves', { id: 'correo', ...par }));
    aviso('Llave creada. Copiá la llave pública y pegala en GitHub.');
  },
  copiarLlave: async () => {
    try { await navigator.clipboard.writeText(E.llaves.correo.pub); aviso('Llave pública copiada'); }
    catch { $('textarea.llave')?.select(); aviso('Seleccioná el texto y copialo'); }
  },
  borrarTodo: async () => {
    if (!confirm('¿Borrar TODOS los datos de este dispositivo? No se puede deshacer.')) return;
    if (prompt('Para confirmar, escribí BORRAR') !== 'BORRAR') return;
    clearTimeout(tGuardar); clearTimeout(tSync); mk = null; E = null; meta = null; cfgSync = null; paso = '';
    await D.borrarTodo(); render();
  },
};

// Lee el formulario de movimiento; null si el monto no sirve.
function movDeForm(f) {
  const tipo = f.tipo.value, valor = D.parseMonto(f.monto.value);
  if (!(valor > 0)) { aviso('Escribí un monto válido'); return null; }
  const id = f.dataset.id || D.nuevoId(), previo = E.movs[id] || {};
  const m = { ...previo, id, tipo, monto: valor, moneda: f.moneda.value, fecha: f.fecha.value || D.hoy(), medio: f.medio.value,
    quien: f.quien.value.trim(), nota: f.nota.value.trim(), cat: tipo === 'gasto' ? f.cat.value : null,
    fuente: tipo === 'ingreso' ? f.fuente.value : null, origen: previo.origen || 'manual', estado: 'ok' };
  if (previo.reembolso) { m.cat = m.fuente = null; } // sigue siendo el pago de una cuenta compartida
  m.tc = D.tcDe(E, m.fecha);
  ui.ult = { moneda: m.moneda, medio: m.medio };
  return m;
}

// Guardar un tipo de cambio manual también corrige los movimientos de esa fecha.
function recalcularTc(fecha) {
  const tc = D.tcDe(E, fecha);
  for (const col of ['movs', 'abonos', 'pagos'])
    for (const x of D.lista(E, col)) if (x.fecha === fecha && x.moneda === 'USD' && x.tc !== tc) D.poner(E, col, { ...x, tc });
}

const FORM = {
  crear, abrir, traer: traerDatos, traerClave,
  conectarSync: async f => {
    const cfg = { token: f.token.value.trim(), repo: f.repo.value.trim() };
    const btn = f.querySelector('button.btn'); btn.disabled = true; btn.textContent = 'Conectando…';
    try { await S.probarRepo(cfg); }
    catch (e) { btn.disabled = false; btn.textContent = 'Conectar'; return aviso(e.message); }
    meta.sync = await C.cifrar(mk, cfg); cfgSync = cfg; ui.cambiarToken = false;
    await guardarMeta();
    await sincronizarAhora(true);
    render();
  },
  restaurar: async f => {
    const btn = f.querySelector('button'); btn.disabled = true; btn.textContent = 'Abriendo…';
    let datos;
    try { datos = await C.descifrar(await C.abrirConContrasena(respaldo.llave, f.pass.value), respaldo.datos); }
    catch { btn.disabled = false; btn.textContent = 'Cargar'; return aviso('Contraseña incorrecta para ese respaldo.'); }
    respaldo = null; dlg.close();
    cambiar(() => { E = D.combinar(E, datos); });
    aviso('Respaldo cargado y combinado con tus datos');
  },
  mov: f => {
    const m = movDeForm(f);
    if (!m) return;
    const previo = E.movs[m.id];
    if (dlg.open) dlg.close();
    cambiar(() => {
      D.poner(E, 'movs', m);
      const ab = E.compartidas[`a-${m.id}`]; // si es el pago de una cuenta compartida, el abono cambia con él
      if (m.reembolso && ab && !ab.del) D.poner(E, 'compartidas', { ...ab, monto: m.monto, moneda: m.moneda, fecha: m.fecha, tc: m.tc });
    });
    aviso(previo ? 'Cambios guardados' : 'Movimiento guardado');
  },
  dividir: f => {
    const b = ui.dividir, r = b && D.repartir(b.base.monto, b.base.moneda, leerDividir(f));
    if (!b) return dlg.close();
    if (r.error) return aviso(r.error);
    dlg.close(); ui.dividir = null;
    cambiar(() => {
      const mov = b.correo ? D.aplicarRevision(E, b.correo, { monto: b.base.monto, valor: b.base.cat }) : D.poner(E, 'movs', b.base);
      D.guardarDividido(E, mov, r);
    });
    aviso(r.yo ? `Listo: tu parte es ${monto(r.mia, b.base.moneda)} y el resto quedó en "Me deben"` : `Listo: tu parte quedó como gasto y en "Debo"`);
  },
  pagoComp: f => {
    const [sentido, p, moneda] = f.dataset.v.split('|'), persona = decodeURIComponent(p), valor = D.parseMonto(f.monto.value);
    const s = D.saldosCompartidas(E).find(x => x.sentido === sentido && x.moneda === moneda && x.persona === persona);
    if (!(valor > 0)) return aviso('Escribí un monto válido');
    if (s && valor > s.saldo + 0.5) return aviso(`Es más de lo que ${sentido === 'meDeben' ? 'te debe' : 'le debés'} (${monto(s.saldo, moneda)})`);
    dlg.close();
    cambiar(() => D.pagarCompartida(E, sentido, persona, { monto: valor, moneda, fecha: f.fecha.value, medio: f.medio.value }));
    aviso('Pago anotado');
  },
  rec: f => {
    const valor = D.parseMonto(f.monto.value), frec = f.frecuencia.value, ing = f.dataset.clase === 'ingreso';
    const d1 = +f.dia1.value, d2 = +f.dia2.value, diaOk = d => Number.isInteger(d) && d >= 1 && d <= 31;
    if (!(valor > 0)) return aviso('Escribí un monto válido');
    if (frec !== 'semanal' && !diaOk(d1)) return aviso('Escribí el día de cobro (1 a 31)');
    if (frec === 'quincenal' && !(diaOk(d2) && d2 !== d1)) return aviso('Escribí el segundo día (distinto del primero)');
    const id = f.dataset.id || D.nuevoId(), previo = E.recurrentes[id] || {};
    const r = { ...previo, id, clase: ing ? 'ingreso' : 'gasto', nombre: f.nombre.value.trim(), monto: valor, moneda: f.moneda.value,
      cat: ing ? null : f.cat.value, fuente: ing ? f.fuente.value : null, medio: f.medio.value, frecuencia: frec,
      dias: frec === 'quincenal' ? [d1, d2].sort((a, b) => a - b) : [d1 || 1], diaSemana: +f.diaSemana.value, mes: +f.mes.value,
      texto: f.texto.value.trim(), desde: previo.desde || D.hoy() };
    dlg.close();
    cambiar(() => { D.poner(E, 'recurrentes', r); D.generarPendientes(E); });
    aviso(previo.id ? 'Cambios guardados' : ing ? 'Ingreso fijo guardado' : 'Gasto recurrente guardado');
  },
  rapido: f => {
    const valor = D.parseMonto(f.monto.value);
    if (!(valor > 0)) return aviso('Escribí un monto válido');
    cambiar(() => D.poner(E, 'rapidos', { id: D.nuevoId(), nombre: f.nombre.value.trim(), monto: valor, moneda: f.moneda.value, cat: f.cat.value, medio: f.medio.value }));
    aviso('Botón agregado');
  },
  hormiga: f => {
    const valor = D.parseMonto(f.limite.value);
    if (!(valor > 0)) return aviso('Escribí un monto válido');
    cambiar(() => D.poner(E, 'ajustes', { ...D.ajustes(E), id: 'general', hormiga: valor }));
    aviso('Límite guardado');
  },
  reto: f => {
    const base = D.parseMonto(f.base.value);
    if (!(base > 0)) return aviso('Escribí un monto válido');
    cambiar(() => {
      const metaId = f.meta.value || D.poner(E, 'metas', { id: D.nuevoId(), nombre: 'Reto de 52 semanas', objetivo: 1378 * base, moneda: 'CRC', limite: null, creada: D.hoy() }).id;
      D.poner(E, 'retos', { id: D.nuevoId(), base, inverso: f.inverso.checked, metaId, inicio: D.hoy() });
    });
    aviso('Reto creado. Marcá la semana 1 cuando ahorrés.');
  },
  meta: f => {
    const objetivo = D.parseMonto(f.objetivo.value);
    if (!(objetivo > 0)) return aviso('Escribí un monto válido');
    const id = f.dataset.id || D.nuevoId(), previo = E.metas[id] || {};
    dlg.close();
    cambiar(() => D.poner(E, 'metas', { ...previo, id, nombre: f.nombre.value.trim(), objetivo, moneda: f.moneda.value, limite: f.limite.value || null, creada: previo.creada || D.hoy() }));
  },
  abono: f => {
    const valor = D.parseMonto(f.monto.value), meta_ = E.metas[f.dataset.id];
    if (!(valor > 0)) return aviso('Escribí un monto válido');
    dlg.close();
    cambiar(() => D.poner(E, 'abonos', { id: D.nuevoId(), metaId: meta_.id, monto: valor, moneda: meta_.moneda, fecha: f.fecha.value, tc: D.tcDe(E, f.fecha.value) }));
    aviso('Abono guardado');
  },
  deuda: f => {
    const total = D.parseMonto(f.total.value), cuota = D.parseMonto(f.cuota.value), tasa = f.tasa.value ? D.parseMonto(f.tasa.value) : 0;
    if (!(total > 0) || !(cuota > 0) || !(tasa >= 0)) return aviso('Revisá los montos');
    const id = f.dataset.id || D.nuevoId(), previo = E.deudas[id] || {};
    dlg.close();
    cambiar(() => D.poner(E, 'deudas', { ...previo, id, acreedor: f.acreedor.value.trim(), total, moneda: f.moneda.value, cuota, dia: +f.dia.value, tasa, inicio: f.inicio.value }));
  },
  pago: f => {
    const valor = D.parseMonto(f.monto.value), d = E.deudas[f.dataset.id];
    if (!(valor > 0)) return aviso('Escribí un monto válido');
    dlg.close();
    cambiar(() => D.poner(E, 'pagos', { id: D.nuevoId(), deudaId: d.id, monto: valor, moneda: d.moneda, fecha: f.fecha.value, tc: D.tcDe(E, f.fecha.value) }));
    aviso('Pago anotado');
  },
  revisar: f => {
    const lista = pendientes(), campo = (k, m) => f.elements[`${k}|${m.id}`];
    for (const m of lista)
      if (!m.noReconocido && !campo('descartar', m)?.checked && !(D.parseMonto(campo('monto', m)?.value) > 0)) return aviso('Hay un monto que no es válido');
    let guardados = 0, descartados = 0;
    cambiar(() => {
      for (const m of lista) {
        const r = D.aplicarRevision(E, m, { descartar: !!campo('descartar', m)?.checked, monto: D.parseMonto(campo('monto', m)?.value), valor: campo('valor', m)?.value });
        r ? guardados++ : descartados++;
      }
      lector.avisados = 0; ui.tab = 'movs'; ui.anim = true;
    });
    scrollTo(0, 0);
    aviso(`${guardados} ${guardados === 1 ? 'movimiento guardado' : 'movimientos guardados'}${descartados ? `, ${descartados} descartados` : ''}`);
  },
  nombre: f => { cambiar(() => D.poner(E, 'ajustes', { ...D.ajustes(E), id: 'general', nombre: f.nombre.value.trim() })); aviso('Nombre guardado'); },
  tcManual: f => {
    const valor = D.parseMonto(f.valor.value);
    if (!(valor > 0)) return aviso('Escribí un valor válido');
    cambiar(() => { D.poner(E, 'tcManual', { id: f.fecha.value, valor }); recalcularTc(f.fecha.value); });
    aviso('Tipo de cambio guardado');
  },
  nuevaCat: f => {
    const n = D.lista(E, 'cats').length;
    cambiar(() => D.poner(E, 'cats', { id: D.nuevoId(), nombre: f.nombre.value.trim(), icono: f.icono.value, color: D.COLORES_EXTRA[n % D.COLORES_EXTRA.length], orden: n }));
  },
  cambiarPass: async f => {
    if (f.nueva.value !== f.nueva2.value) return aviso('Las contraseñas nuevas no coinciden');
    const btn = f.querySelector('button'); btn.disabled = true; btn.textContent = 'Cambiando…';
    try { await C.abrirConContrasena(meta.pass, f.actual.value); }
    catch { btn.disabled = false; btn.textContent = 'Cambiar contraseña'; return aviso('La contraseña actual no es correcta'); }
    // Solo se vuelve a envolver la llave maestra: los datos y Face ID no cambian.
    meta.pass = await C.envolverConContrasena(mk, f.nueva.value);
    await guardarMeta(); render(); aviso('Contraseña cambiada');
  },
};

// ---------------- Eventos ----------------
document.addEventListener('click', e => {
  const b = e.target.closest('[data-a]');
  if (b && !b.disabled) { e.preventDefault(); ACC[b.dataset.a]?.(b.dataset.v, b); }
});
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
document.addEventListener('submit', e => {
  const f = e.target.closest('[data-f]');
  if (f) { e.preventDefault(); FORM[f.dataset.f]?.(f); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.lim) {
    const v = t.value.trim() ? D.parseMonto(t.value) : 0;
    if (!(v >= 0)) return aviso('Escribí un monto válido');
    cambiar(() => D.ponerLimite(E, ui.mes, t.dataset.lim, v));
  } else if (t.dataset.filtro) { ui[t.dataset.filtro] = t.value; render(); }
  else if (t.matches('[data-respaldo]')) leerRespaldo(t);
  else if (t.matches('[data-fondo]')) cambiar(() => D.poner(E, 'metas', { ...E.metas[D.ID_FONDO], mesesObjetivo: +t.value }));
  else if (t.dataset.ajuste) cambiar(() => {
    D.poner(E, 'ajustes', { ...D.ajustes(E), id: 'general', [t.dataset.ajuste]: t.value });
  });
});
document.addEventListener('input', e => {
  const t = e.target;
  const fd = t.closest?.('form[data-f=dividir]');
  if (fd && ui.dividir) actualizarDividir(fd, t);
  else if (t.dataset.vivo) { ui[t.dataset.vivo] = t.value; foco = t.dataset.vivo; render(); }
});

// Montos al pasar el mouse o tocar
function hideTip() { tip.hidden = true; }
function moverTip(e) {
  tip.style.left = Math.max(8, Math.min(innerWidth - tip.offsetWidth - 8, e.clientX + 12)) + 'px';
  tip.style.top = Math.max(8, e.clientY - tip.offsetHeight - 10) + 'px';
}
document.addEventListener('pointerover', e => {
  const t = e.target.closest?.('[data-tip]');
  if (!t) return hideTip();
  tip.textContent = t.dataset.tip; tip.hidden = false; moverTip(e);
});
document.addEventListener('pointermove', e => { if (!tip.hidden) moverTip(e); });
addEventListener('scroll', hideTip, { passive: true });

iniciar();
