import * as C from './cripto.js';
import * as D from './datos.js';
import * as G from './graficos.js';
import * as S from './sync.js';
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
const ui = { tab: 'inicio', mes: D.mesDe(D.hoy()), vistaMov: 'lista', fCat: '', fMedio: '', qSinpe: '', q: '', anim: true, ult: { moneda: 'CRC', medio: 'Tarjeta' } };
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

function hace(ms) {
  const min = Math.round((Date.now() - ms) / 60000);
  return min < 1 ? 'hace un momento' : min < 60 ? `hace ${min} min` : min < 1440 ? `hace ${Math.round(min / 60)} h` : D.fechaLarga(new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 10));
}

// ---------------- Respaldo ----------------
async function descargarRespaldo() {
  await guardarYa();
  const sobre = { v: 1, tipo: 'respaldo-finanzas', llave: meta.pass, datos: await C.cifrar(mk, E) };
  const nombre = `respaldo-finanzas-${D.hoy()}.json`;
  const archivo = new File([JSON.stringify(sobre)], nombre, { type: 'application/json' });
  if (esIOS && navigator.canShare?.({ files: [archivo] })) return navigator.share({ files: [archivo] }).catch(() => {});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(archivo); a.download = nombre; a.click();
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
  if (document.hidden) return guardarYa();
  revisarInactividad();
  sincronizarAhora(); // al volver a la app, trae lo que se cambió en el otro dispositivo
});

async function bloquear() {
  await guardarYa();
  clearTimeout(tSync);
  if (cfgSync) { await sync.promesa; if (sync.cambios !== sync.hecho) await sincronizarAhora(); } // sube lo último antes de olvidar la llave
  mk = null; E = null; cfgSync = null; errorBloqueo = '';
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
  E = await C.descifrar(mk, await D.leer('estado'));
  cfgSync = meta.sync ? await C.descifrar(mk, meta.sync) : null;
  sync.cambios = sync.hecho = 0;
  errorBloqueo = ''; ultimo = Date.now();
  sincronizarAhora();
  if (accion) {
    ui.tab = { gasto: 'movs', presupuesto: 'presup', correo: 'movs' }[accion] || 'inicio';
    accion = null; history.replaceState(null, '', location.pathname);
  }
  ui.anim = true; render();
}

async function crear(f) {
  if (f.pass.value !== f.pass2.value) return aviso('Las contraseñas no coinciden');
  const tc = D.parseMonto(f.tc.value);
  if (!(tc > 0)) return aviso('Escribí el tipo de cambio de hoy');
  const btn = f.querySelector('button.btn'); btn.disabled = true; btn.textContent = 'Creando…';
  mk = await C.nuevaLlaveMaestra();
  E = D.estadoNuevo(f.nombre.value.trim(), tc);
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
  E = await C.descifrar(mk, traer.sobre.datos);
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
  const vistas = { inicio: vInicio, presup: vPresup, movs: vMovs, metas: vMetas, deudas: vDeudas, ajustes: vAjustes, buscar: vBuscar };
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
  <div class="tarjeta sinpe"><h2>${icono('sinpe')} SINPE del mes</h2>
    <dl class="trio"><div><dt>Enviados</dt><dd>${crc(r.sinpeEnv)}</dd></div><div><dt>Recibidos</dt><dd>${crc(r.sinpeRec)}</dd></div><div><dt>Diferencia</dt><dd>${crc(r.sinpeRec - r.sinpeEnv)}</dd></div></dl></div>
  <div class="rejilla">
    <div class="tarjeta"><h2>Gasto por categoría</h2><div class="dona-caja">${G.dona(segs)}
      <ul class="leyenda">${segs.map(s => `<li data-tip="${esc(s.nombre)}: ${crc(s.valor)}"><i class="punto" style="--c:${s.color}"></i>${icono(s.icono)}<span>${esc(s.nombre)}</span><b>${crc(s.valor)}</b></li>`).join('')}</ul></div></div>
    <div class="tarjeta"><h2>Últimos 6 meses</h2>${G.barras(seis, 'Ingresos', 'Gastos')}</div>
  </div>
  <div class="tarjeta"><h2>Alertas</h2>${vAlertas(alertasVisibles())}</div>`;
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
  return `${selMes()}
  <div class="tarjeta"><div class="cab"><h2>Ingresos del mes</h2><button class="btn chico" data-a="nuevoIngreso">${icono('mas')} Ingreso</button></div>
    ${ingresos.length ? ingresos.map(filaMov).join('') : '<p class="vacio">Todavía no anotaste ingresos este mes.</p>'}</div>
  <div class="tarjeta"><h2>Límites por categoría</h2>${filas}</div>
  <div class="tarjeta"><h2>Resumen</h2><dl class="resumen">
    <div><dt>Ingresos</dt><dd>${crc(r.ingresos)}</dd></div><div><dt>Gastado</dt><dd>${crc(r.gastado)}</dd></div>
    <div><dt>Abonos a metas</dt><dd>${crc(r.abonos)}</dd></div><div><dt>Pagos de deudas</dt><dd>${crc(r.pagos)}</dd></div>
    <div class="total"><dt>Disponible</dt><dd class="${r.disponible < 0 ? 'txt-rojo' : ''}">${crc(r.disponible)} <span class="sec">(${dolares(r.disponible)})</span></dd></div></dl></div>
  <div class="tarjeta"><h2>Comparado con ${D.nombreMes(D.mesAnterior(ui.mes)).toLowerCase()}</h2>
    ${comp ? `<table class="tabla"><thead><tr><th>Categoría</th><th>Este mes</th><th>Anterior</th><th>Diferencia</th></tr></thead><tbody>${comp}</tbody></table>` : '<p class="vacio">Sin gastos para comparar.</p>'}</div>`;
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
    <button class="btn">${m.id ? 'Guardar cambios' : 'Guardar'}</button></form>`;
}

function filaMov(m) {
  const c = E.cats[m.cat], ing = m.tipo === 'ingreso';
  const titulo = m.quien || (ing ? D.FUENTES[m.fuente] || 'Ingreso' : c?.nombre || 'Otros');
  const sub = [D.fechaCorta(m.fecha), m.medio, m.quien ? (ing ? D.FUENTES[m.fuente] : c?.nombre) : '', m.nota].filter(Boolean).map(esc).join(' · ');
  return `<div class="mov">${ing ? `<span class="ic-cat" style="--c:var(--exito)">${icono(m.medio === 'SINPE' ? 'sinpe' : 'ingreso')}</span>` : icCat(c)}
    <div class="txt"><b>${esc(titulo)}</b><span class="sec">${sub}${m.origen === 'correo' ? ' <span class="chip">desde correo</span>' : ''}${m.origen === 'siri' ? ' <span class="chip">desde Siri</span>' : ''}</span></div>
    <div class="m ${ing ? 'pos' : ''}">${ing ? '+' : ''}${monto(m.monto, m.moneda)}${m.moneda === 'USD' ? `<span class="sec">${crc(D.aCRC(m))}</span>` : ''}</div>
    <button class="ico-btn chico" data-a="editarMov" data-v="${m.id}" aria-label="Editar">${icono('lapiz')}</button>
    <button class="ico-btn chico" data-a="borrarMov" data-v="${m.id}" aria-label="Borrar">${icono('basura')}</button></div>`;
}

function vMovs() {
  const pest = `<div class="seg pestañas">${[['lista', 'Lista'], ['sinpe', 'SINPE']].map(([k, n]) =>
    `<button data-a="vistaMov" data-v="${k}" class="${ui.vistaMov === k ? 'activa' : ''}">${n}</button>`).join('')}</div>`;
  if (ui.vistaMov === 'sinpe') return pest + vSinpe();
  const movs = D.movsMes(E, ui.mes)
    .filter(m => (!ui.fCat || m.cat === ui.fCat) && (!ui.fMedio || m.medio === ui.fMedio))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.upd - a.upd);
  return `${pest}
  <div class="rejilla movs-rej">
    <div class="tarjeta"><h2>Nuevo movimiento</h2>${formMov()}
      <button class="btn sec-btn ancho" disabled title="Se activa en la etapa 3">${icono('correo')} Revisar movimientos del correo</button>
      <p class="nota">El botón del correo se activa cuando conectemos tu Gmail.</p></div>
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

// ---------------- Metas ----------------
function vMetas() {
  const metas = D.lista(E, 'metas').sort((a, b) => a.creada.localeCompare(b.creada));
  return `<div class="cab"><h1>Metas de ahorro</h1><button class="btn chico" data-a="nuevaMeta">${icono('mas')} Nueva meta</button></div>
  ${metas.length ? '' : '<p class="vacio">Todavía no tenés metas. Creá una para empezar a ahorrar con un objetivo.</p>'}
  <div class="rejilla">${metas.map(m => {
    const s = D.estadoMeta(E, m), ab = D.abonosMeta(E, m.id);
    return `<div class="tarjeta meta"><div class="cab"><h2>${esc(m.nombre)}</h2><span class="pct">${Math.floor(s.pct * 100)} %</span></div>
      <div class="barra"><i class="sakura" style="width:${(s.pct * 100).toFixed(1)}%"></i></div>
      <p>${monto(s.ahorrado, m.moneda)} de ${monto(m.objetivo, m.moneda)}${s.falta > 0 ? ` · faltan ${monto(s.falta, m.moneda)}` : ' · <span class="txt-verde">¡meta cumplida!</span>'}</p>
      ${m.limite ? `<p class="sec">Fecha límite: ${D.fechaLarga(m.limite)}${s.porMes ? ` · necesitás ${monto(s.porMes, m.moneda)} por mes` : ''}</p>` : ''}
      ${s.atrasada ? `<p class="txt-rojo">Vas atrasado: a esta altura deberías llevar ${monto(s.esperado, m.moneda)}.</p>` : ''}
      <div class="acciones"><button class="btn chico" data-a="abono" data-v="${m.id}">${icono('mas')} Abono</button>
        <button class="ico-btn chico" data-a="editarMeta" data-v="${m.id}" aria-label="Editar meta">${icono('lapiz')}</button>
        <button class="ico-btn chico" data-a="borrarMeta" data-v="${m.id}" aria-label="Borrar meta">${icono('basura')}</button></div>
      ${ab.length ? `<details><summary>Abonos (${ab.length})</summary>${ab.slice().reverse().map(a => `<div class="mini"><span>${D.fechaCorta(a.fecha)}</span><span>${monto(a.monto, a.moneda)}</span><button class="ico-btn chico" data-a="borrarAbono" data-v="${a.id}" aria-label="Borrar abono">${icono('basura')}</button></div>`).join('')}</details>` : ''}
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
    return `<div class="tarjeta deuda"><div class="cab"><h2>${esc(d.acreedor)}</h2><span class="pct">${Math.floor(pct * 100)} % pagado</span></div>
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
    <p class="nota">La actualización automática con el dato del BCCR llega en la etapa 3. Mientras tanto, o si falla, escribilo a mano:</p>
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

  <div class="tarjeta"><h2>Respaldo</h2>
    <p class="nota">Un archivo cifrado con todos tus datos. Para cargarlo vas a necesitar la contraseña que tenías cuando lo descargaste.</p>
    <div class="acciones"><button class="btn sec-btn" data-a="descargarRespaldo">Descargar respaldo</button>
      <label class="btn sec-btn">Cargar respaldo<input type="file" accept=".json,application/json" data-respaldo hidden></label></div></div>

  <div class="tarjeta"><h2>Este dispositivo</h2>
    <p class="nota">Borra todos los datos guardados en este navegador. No se puede deshacer.</p>
    <button class="btn peligro" data-a="borrarTodo">Borrar todo de este dispositivo</button></div>
  </div>`;
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
const formMontoFecha = (titulo, f, id, valor, moneda) => `<h2>${esc(titulo)}</h2><form data-f="${f}" data-id="${id}" class="form-col">
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
  borrarMov: v => { if (confirm('¿Borrar este movimiento?')) { cambiar(() => D.quitar(E, 'movs', v)); aviso('Movimiento borrado', () => cambiar(() => D.poner(E, 'movs', E.movs[v]))); } },
  nuevaMeta: () => abrirDialogo(formMeta()),
  editarMeta: v => abrirDialogo(formMeta(E.metas[v])),
  borrarMeta: v => { if (confirm('¿Borrar esta meta y todos sus abonos?')) cambiar(() => { D.quitar(E, 'metas', v); D.abonosMeta(E, v).forEach(a => D.quitar(E, 'abonos', a.id)); }); },
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
  borrarTodo: async () => {
    if (!confirm('¿Borrar TODOS los datos de este dispositivo? No se puede deshacer.')) return;
    if (prompt('Para confirmar, escribí BORRAR') !== 'BORRAR') return;
    clearTimeout(tGuardar); clearTimeout(tSync); mk = null; E = null; meta = null; cfgSync = null; paso = '';
    await D.borrarTodo(); render();
  },
};

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
    const tipo = f.tipo.value, valor = D.parseMonto(f.monto.value);
    if (!(valor > 0)) return aviso('Escribí un monto válido');
    const id = f.dataset.id || D.nuevoId(), previo = E.movs[id] || {};
    const m = { ...previo, id, tipo, monto: valor, moneda: f.moneda.value, fecha: f.fecha.value || D.hoy(), medio: f.medio.value,
      quien: f.quien.value.trim(), nota: f.nota.value.trim(), cat: tipo === 'gasto' ? f.cat.value : null,
      fuente: tipo === 'ingreso' ? f.fuente.value : null, origen: previo.origen || 'manual', estado: 'ok' };
    m.tc = D.tcDe(E, m.fecha);
    ui.ult = { moneda: m.moneda, medio: m.medio };
    if (dlg.open) dlg.close();
    cambiar(() => D.poner(E, 'movs', m));
    aviso(previo.id ? 'Cambios guardados' : 'Movimiento guardado');
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
  if (b && !b.disabled) { e.preventDefault(); ACC[b.dataset.a]?.(b.dataset.v); }
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
  else if (t.dataset.ajuste) cambiar(() => {
    D.poner(E, 'ajustes', { ...D.ajustes(E), id: 'general', [t.dataset.ajuste]: t.value });
  });
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.vivo) { ui[t.dataset.vivo] = t.value; foco = t.dataset.vivo; render(); }
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
