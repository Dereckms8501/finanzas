// Sincronización con el repositorio privado finanzas-datos usando la API de GitHub.
// En GitHub solo se guarda estado.enc: {v, llave (llave maestra envuelta con la contraseña), datos (cifrados)}.
import * as C from './cripto.js';
import { combinar, COLECCIONES } from './datos.js';

const API = 'https://api.github.com';
const ARCHIVO = 'estado.enc';
const enc = new TextEncoder(), dec = new TextDecoder();

export class ErrorSync extends Error {
  constructor(tipo, mensaje) { super(mensaje); this.tipo = tipo; }
}

// En dereckms8501.github.io sugiere "dereckms8501/finanzas-datos".
export const repoSugerido = () =>
  location.hostname.endsWith('.github.io') ? `${location.hostname.split('.')[0]}/finanzas-datos` : '';

async function pedir(cfg, ruta, opciones = {}) {
  let r;
  try {
    r = await fetch(`${API}/repos/${cfg.repo}${ruta}`, {
      cache: 'no-store', ...opciones,
      headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...opciones.headers },
    });
  } catch { throw new ErrorSync('red', 'Sin conexión a internet.'); }
  if (r.status === 401) throw new ErrorSync('token', 'El token no es válido o ya venció.');
  if (r.status === 403) throw new ErrorSync('permiso', 'El token no tiene permiso para escribir en el repositorio (Contents: lectura y escritura).');
  return r;
}

// Revisa que el token vea el repositorio.
export async function probarRepo(cfg) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(cfg.repo)) throw new ErrorSync('repo', 'Escribí el repositorio como usuario/finanzas-datos.');
  const r = await pedir(cfg, '');
  if (r.status === 404) throw new ErrorSync('repo', 'No encontré el repositorio, o el token no tiene acceso a él.');
  if (!r.ok) throw new ErrorSync('github', `GitHub respondió con un error (${r.status}).`);
}

// Devuelve {sha, texto} o null si el archivo no existe.
async function bajarArchivo(cfg, nombre) {
  const r = await pedir(cfg, `/contents/${nombre}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new ErrorSync('github', `GitHub respondió con un error (${r.status}).`);
  const j = await r.json();
  let b64 = j.encoding === 'base64' ? j.content : '';
  if (!b64) { // los archivos de más de 1 MB no vienen en la respuesta; se piden por su sha
    const r2 = await pedir(cfg, `/git/blobs/${j.sha}`);
    if (!r2.ok) throw new ErrorSync('github', `GitHub respondió con un error (${r2.status}).`);
    b64 = (await r2.json()).content;
  }
  return { sha: j.sha, texto: dec.decode(C.deb64(b64.replace(/\s/g, ''))) };
}
// JSON de un archivo del repositorio (correo.enc, tipo_cambio.json) o null si no existe.
export async function bajarJSON(cfg, nombre) {
  const a = await bajarArchivo(cfg, nombre);
  if (!a) return null;
  try { return JSON.parse(a.texto); } catch { throw new ErrorSync('formato', `El archivo ${nombre} en GitHub está dañado.`); }
}

// Devuelve {sha, sobre} o null si todavía no hay archivo.
export async function bajar(cfg) {
  const a = await bajarArchivo(cfg, ARCHIVO);
  if (!a) return null;
  try { return { sha: a.sha, sobre: JSON.parse(a.texto) }; }
  catch { throw new ErrorSync('formato', 'El archivo en GitHub está dañado.'); }
}

// Devuelve true si se guardó, false si alguien lo cambió mientras tanto (hay que bajar y combinar otra vez).
async function subir(cfg, sobre, sha) {
  // Sin "committer", GitHub firma el commit con el correo principal de la cuenta: así no queda el correo en el historial.
  const firma = { name: 'App Finanzas', email: 'app-finanzas@users.noreply.github.com' };
  const body = { message: 'Actualizar estado cifrado', content: C.b64(enc.encode(JSON.stringify(sobre))), committer: firma, author: firma };
  if (sha) body.sha = sha;
  const r = await pedir(cfg, `/contents/${ARCHIVO}`, { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
  if (r.status === 409 || r.status === 422) return false;
  if (!r.ok) throw new ErrorSync('github', `GitHub respondió con un error (${r.status}).`);
  return true;
}

// Huella de qué versión de cada elemento hay, para saber si hace falta subir.
export function huella(e) {
  const partes = [];
  for (const c of COLECCIONES) for (const [id, it] of Object.entries(e[c] || {})) partes.push(`${c}/${id}/${it.upd}/${it.del ? 1 : 0}`);
  return partes.sort().join('|');
}
const mismaLlave = (a, b) => !!a && !!b && a.ct === b.ct && a.sal === b.sal;
const masNueva = (a, b) => ((b?.upd || 0) > (a?.upd || 0) ? b : a);

// Baja, combina (gana la edición más reciente de cada elemento) y sube. Reintenta si hubo choque (409).
export async function sincronizar(cfg, mk, e, llave) {
  for (let intento = 0; intento < 4; intento++) {
    const remoto = await bajar(cfg);
    let unido = e, llaveFinal = llave, igual = false;
    if (remoto) {
      let datos;
      try { datos = await C.descifrar(mk, remoto.sobre.datos); }
      catch { throw new ErrorSync('llave', 'Los datos en GitHub se cifraron con otra llave (vienen de otra instalación que empezó de cero). No los toqué.'); }
      unido = combinar(e, datos);
      llaveFinal = masNueva(llave, remoto.sobre.llave);
      igual = huella(unido) === huella(datos) && mismaLlave(llaveFinal, remoto.sobre.llave);
    }
    if (igual) return { e: unido, llave: llaveFinal };
    const sobre = { v: 1, llave: llaveFinal, datos: await C.cifrar(mk, unido) };
    if (await subir(cfg, sobre, remoto?.sha)) return { e: unido, llave: llaveFinal };
    e = unido; llave = llaveFinal;
  }
  throw new ErrorSync('conflicto', 'Otro dispositivo estaba guardando al mismo tiempo. Probá de nuevo en un momento.');
}
