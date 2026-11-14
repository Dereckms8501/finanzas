// Llaves y cifrado. La llave maestra (AES-256-GCM) cifra todos los datos.
// Se guarda "envuelta" con la contraseña (PBKDF2) y, si se activa, con Face ID (WebAuthn PRF).
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

// Cambiar la contraseña = volver a llamar esto con la misma llave maestra. Los datos no se tocan.
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

// ---- Face ID / Touch ID con la extensión PRF de WebAuthn ----
async function claveDePRF(salida) {
  const base = await crypto.subtle.importKey('raw', salida, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: enc.encode('finanzas-faceid') },
    base, AES, false, ['wrapKey', 'unwrapKey']);
}
async function pedirPRF(credId, salPRF) {
  const r = await navigator.credentials.get({ publicKey: {
    challenge: azar(32), rpId: location.hostname, userVerification: 'required',
    allowCredentials: [{ type: 'public-key', id: credId }],
    extensions: { prf: { eval: { first: salPRF } } } } });
  const out = r.getClientExtensionResults().prf?.results?.first;
  if (!out) throw new Error('sin-prf');
  return out;
}
export async function activarFaceID(mk, nombre) {
  if (!window.PublicKeyCredential) throw new Error('sin-prf');
  const salPRF = azar(32);
  const cred = await navigator.credentials.create({ publicKey: {
    rp: { name: 'Finanzas', id: location.hostname },
    user: { id: azar(16), name: 'finanzas', displayName: nombre || 'Finanzas' },
    challenge: azar(32),
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required' },
    extensions: { prf: {} } } });
  if (cred.getClientExtensionResults().prf?.enabled === false) throw new Error('sin-prf');
  const credId = new Uint8Array(cred.rawId);
  const salida = await pedirPRF(credId, salPRF); // si no hay PRF real, falla aquí y no se guarda nada
  return { credId: b64(credId), sal: b64(salPRF), ...(await envolver(mk, await claveDePRF(salida))) };
}
export async function abrirConFaceID(w) {
  return desenvolver(w, await claveDePRF(await pedirPRF(deb64(w.credId), deb64(w.sal))));
}
