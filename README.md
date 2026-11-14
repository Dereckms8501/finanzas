# Finanzas

App web de finanzas personales (PWA) en colones y dólares. Funciona en la compu y en el celular, y se puede instalar como app.

- Todo se cifra en el dispositivo (AES-256-GCM, llave protegida con PBKDF2 de 600 000 iteraciones o con Face ID mediante WebAuthn PRF).
- Este repositorio solo tiene el código. Los datos viven cifrados en un repositorio privado aparte.
- Sin librerías externas: HTML, CSS y JavaScript.

`pruebas.html` corre las pruebas automáticas de los cálculos, el cifrado y la sincronización.
