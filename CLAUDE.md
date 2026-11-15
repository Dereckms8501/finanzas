# Mapa de la app (leer esto antes de abrir archivos grandes)

PWA de finanzas personales en JavaScript puro (módulos ES), sin librerías ni compilación. Se publica tal cual con GitHub Pages.
Los datos viven cifrados: en el aparato (IndexedDB) y en el repositorio privado `finanzas-datos` (ver su CLAUDE.md).

## Archivos

| Archivo | Qué tiene |
|---|---|
| `js/datos.js` | Toda la lógica de plata, sin pantalla: modelo, fechas, formato de montos, resúmenes del mes, metas, deudas, recurrentes, cuentas compartidas, hormiga, cierres, alertas, correo. Funciones puras: `(e, ...) => valor`. |
| `js/app.js` | Pantallas y eventos (1 300+ líneas). Leer solo la sección que toca: `grep -n "^// ----" js/app.js` da el índice. |
| `js/cripto.js` | AES-256-GCM, llave maestra envuelta con PBKDF2 (600 000), RSA-OAEP para el correo. |
| `js/sync.js` | Sube y baja `estado.enc` con la API de GitHub; combina por elemento; `cambiarLlave` al cambiar la contraseña. |
| `js/exportar.js` | CSV y XLSX (zip hecho a mano). `js/graficos.js`: dona, barras, línea en SVG. `js/iconos.js`: íconos SVG. |
| `js/pruebas.js` + `pruebas.html` | Pruebas automáticas (unas 150). |
| `js/prueba_correo.json` | Datos y llave RSA de PRUEBA, inventados, generados por `finanzas-datos/scripts/prueba_importar.py`. No es la llave real (esa vive cifrada dentro de los datos). |
| `css/app.css` | Estilos. Colores como variables en `:root`, repetidas para modo oscuro (media query y `[data-tema="oscuro"]`). |
| `sw.js` | Service worker: guarda en caché solo los archivos de la app, nunca datos. |

## Cómo está armado

- Estado: `E` = objeto con colecciones (`D.COLECCIONES`). Cada elemento es `{id, upd, del}`. Usar siempre `D.poner`, `D.quitar` (borrado suave) y `D.lista`; así dos aparatos se combinan (gana el `upd` más reciente).
- `render()` rehace toda la vista con plantillas de texto. Todo estado de pantalla va en el objeto `ui` (un `<details>` nativo se cierra en cada render).
- Botones: `data-a="nombre" data-v="valor"` llaman a `ACC.nombre(v, boton)`. Formularios: `data-f="nombre"` llaman a `FORM.nombre(form)`. `cambiar(fn)` = aplicar, guardar cifrado y volver a pintar.
- Todo texto del usuario o de un correo pasa por `esc()` (en `datos.js`) antes de entrar al HTML.
- Montos: `D.parseMonto` lee "1.500", "1,500", "1 250,75"; `crc()`/`usd()` los muestran. Dólares a colones con `D.aCRC(x)` (usa `x.tc`).
- Disponible del mes: `resumenMes` en `datos.js`, solo con lo del mes. Lo de meses anteriores (`saldoAntes`, en `r.arrastre`) se muestra aparte y no se suma.
- Anotar un gasto: el botón + llama `ACC.nuevo`, que abre `formMov()`; al guardar corre `FORM.mov` → `movDeForm()`.
- Correos: la revisión la decide `razonRevision` en `datos.js`; la pantalla es `vCorreo` en `app.js`.

## Probar

1. Servidor local: preview "finanzas" en `.claude/launch.json` del folder padre, puerto 8765.
2. Pruebas: `http://localhost:8765/pruebas.html`, esperar unos 9 s y leer `window.resultadoPruebas` (0 = todo bien).
3. Antes de recargar, desregistrar el service worker y borrar las cachés, o carga JS viejo.
4. Pantallas: usar un origen aparte (`http://prueba.localhost:8765`) con una cuenta de prueba, revisar en tamaño celular, claro y oscuro, y al final borrar los datos (Ajustes > Borrar todo).

## Publicar

- Antes de publicar: `for f in js/*.js; do node --check --input-type=module < "$f" || echo "FALLA: $f"; done` (las pruebas no cargan `app.js`: un error ahí deja la app en blanco y las pruebas igual pasan).
- Subir `VERSION` en `sw.js` en cada publicación (si no, los teléfonos siguen con la versión vieja).
- Si cambió algo del correo, correr también `python scripts/prueba_importar.py` en `finanzas-datos`.
- Commit y push a `main`; GitHub Pages publica solo. Verificar que el `sw.js` en vivo tenga la versión nueva.
- Nunca subir datos, tokens ni contraseñas: este repositorio es público.
