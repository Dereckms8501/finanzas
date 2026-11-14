// Exportar movimientos a .csv o .xlsx sin librerías. OJO: el archivo que sale NO va cifrado.
const enc = new TextEncoder();

// Excel ejecuta como fórmula lo que empieza con = + - @ (inyección de fórmulas): se le pone un apóstrofo adelante.
const seguro = v => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? "'" + v : v);

export function csv(columnas, filas) {
  const celda = v => typeof v === 'number' ? String(v).replace('.', ',') : `"${String(seguro(v)).replace(/"/g, '""')}"`;
  // BOM + punto y coma + coma decimal: así lo abre bien el Excel en español
  return '﻿' + [columnas, ...filas].map(f => f.map(celda).join(';')).join('\r\n') + '\r\n';
}

// ---------- ZIP (sin compresión) ----------
const TABLA = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
export function crc32(b) { let c = 0xFFFFFFFF; for (const x of b) c = TABLA[(c ^ x) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

export function zip(archivos) { // archivos: {nombre: texto}
  const partes = [], central = []; let pos = 0;
  for (const [nombre, texto] of Object.entries(archivos)) {
    const n = enc.encode(nombre), d = enc.encode(texto), crc = crc32(d);
    const cab = (firma, extra) => { // campos comunes de la cabecera local y la central
      const v = new DataView(new ArrayBuffer(extra));
      v.setUint32(0, firma, true);
      return v;
    };
    const l = cab(0x04034b50, 30);
    l.setUint16(4, 20, true); l.setUint16(6, 0x0800, true); l.setUint16(8, 0, true); // versión, UTF-8, sin compresión
    l.setUint16(10, 0, true); l.setUint16(12, 33, true); // hora y fecha DOS fijas (1980-01-01)
    l.setUint32(14, crc, true); l.setUint32(18, d.length, true); l.setUint32(22, d.length, true); l.setUint16(26, n.length, true);
    const c = cab(0x02014b50, 46);
    c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, 0, true); c.setUint16(14, 33, true);
    c.setUint32(16, crc, true); c.setUint32(20, d.length, true); c.setUint32(24, d.length, true); c.setUint16(28, n.length, true);
    c.setUint32(42, pos, true);
    partes.push(new Uint8Array(l.buffer), n, d); central.push(new Uint8Array(c.buffer), n);
    pos += 30 + n.length + d.length;
  }
  const tam = central.reduce((s, x) => s + x.length, 0), fin = new DataView(new ArrayBuffer(22)), total = Object.keys(archivos).length;
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, total, true); fin.setUint16(10, total, true);
  fin.setUint32(12, tam, true); fin.setUint32(16, pos, true);
  return new Blob([...partes, ...central, new Uint8Array(fin.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ---------- XLSX mínimo: una hoja, texto en línea ----------
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const col = i => (i >= 26 ? String.fromCharCode(64 + Math.floor(i / 26)) : '') + String.fromCharCode(65 + (i % 26));

export function xlsx(columnas, filas, hoja = 'Movimientos') {
  const fila = (f, r) => `<row r="${r}">${f.map((v, i) => {
    const ref = `${col(i)}${r}`;
    return typeof v === 'number' && isFinite(v) ? `<c r="${ref}"><v>${v}</v></c>`
      : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(seguro(v ?? ''))}</t></is></c>`;
  }).join('')}</row>`;
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  return zip({
    '[Content_Types].xml': xml + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels': xml + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': xml + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + `<sheets><sheet name="${esc(hoja)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': xml + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': xml + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
      + [columnas, ...filas].map((f, i) => fila(f, i + 1)).join('') + '</sheetData></worksheet>',
  });
}
