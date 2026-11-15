// Llaves y cifrado. La llave maestra (AES-256-GCM) cifra todos los datos.
// Se guarda "envuelta" con la contraseña (PBKDF2). Al cambiar la contraseña se crea una llave nueva y se vuelve a cifrar todo.
const enc = new TextEncoder(), dec = new TextDecoder();
export const ITER = 600000;

export function b64(buf) {
  const u = new Uint8Array(buf); let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}
export const deb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export const azar = n => crypto.getRandomValues(new Uint8Array(n));

const AES = { name: 'AES-GCM', length: 256 };

export const nuevaLlaveMaestra = () => crypto.subtle.generateKey(AES, true, ['encrypt', 'decrypt']);

async function envolver(mk, kek) {
  const iv = azar(12);
  return { iv: b64(iv), ct: b64(await crypto.subtle.wrapKey('raw', mk, kek, { name: 'AES-GCM', iv })) };
}
const desenvolver = (w, kek) =>
  crypto.subtle.unwrapKey('raw', deb64(w.ct), kek, { name: 'AES-GCM', iv: deb64(w.iv) }, AES, true, ['encrypt', 'decrypt']);

async function claveDeContrasena(pass, sal, iter) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iter }, base, AES, false, ['wrapKey', 'unwrapKey']);
}

// Envuelve la llave maestra con la contraseña.
export async function envolverConContrasena(mk, pass) {
  const sal = azar(16);
  // upd: al sincronizar, el otro dispositivo adopta la contraseña más reciente
  return { sal: b64(sal), iter: ITER, upd: Date.now(), ...(await envolver(mk, await claveDeContrasena(pass, sal, ITER))) };
}
// Lanza error si la contraseña no es la correcta (AES-GCM no valida).
export async function abrirConContrasena(w, pass) {
  return desenvolver(w, await claveDeContrasena(pass, deb64(w.sal), w.iter));
}

export async function cifrar(mk, obj) {
  const iv = azar(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, mk, enc.encode(JSON.stringify(obj)));
  return { iv: b64(iv), ct: b64(ct) };
}
export async function descifrar(mk, c) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deb64(c.iv) }, mk, deb64(c.ct));
  return JSON.parse(dec.decode(pt));
}

// ---- Llaves para los correos (cifrado híbrido RSA-OAEP 4096 + AES-256-GCM) ----
// El Action solo tiene la llave pública: puede cifrar pero no leer. La privada vive dentro de los datos cifrados.
const RSA = { name: 'RSA-OAEP', hash: 'SHA-256' };
export async function nuevoParCorreo() {
  const par = await crypto.subtle.generateKey({ ...RSA, modulusLength: 4096, publicExponent: new Uint8Array([1, 0, 1]) }, true, ['encrypt', 'decrypt']);
  return { pub: b64(await crypto.subtle.exportKey('spki', par.publicKey)), priv: b64(await crypto.subtle.exportKey('pkcs8', par.privateKey)) };
}
// sobre = {v, alg, llave (AES envuelta con RSA), iv, datos} tal como lo escribe scripts/importar_correos.py
export async function abrirCorreo(privB64, sobre) {
  const priv = await crypto.subtle.importKey('pkcs8', deb64(privB64), RSA, false, ['decrypt']);
  const crudo = await crypto.subtle.decrypt(RSA, priv, deb64(sobre.llave));
  const llave = await crypto.subtle.importKey('raw', crudo, 'AES-GCM', false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deb64(sobre.iv) }, llave, deb64(sobre.datos));
  return JSON.parse(dec.decode(pt));
}
