// Íconos de línea fina dibujados a mano (24×24, mismo trazo en todos; el grosor se pone en CSS).
const P = {
  carrito: '<path d="M3 4h2l2.2 10.2a1 1 0 0 0 1 .8h8.6a1 1 0 0 0 1-.8L19.5 8H6"/><circle cx="9" cy="19" r="1.3"/><circle cx="17" cy="19" r="1.3"/>',
  plato: '<circle cx="10" cy="14" r="7"/><circle cx="10" cy="14" r="3.5"/><path d="M14 2.5 21.5 10M12 3.5l8 8"/>',
  mancuerna: '<rect x="5" y="7" width="3" height="10" rx="1"/><rect x="16" y="7" width="3" height="10" rx="1"/><path d="M2.5 10v4M21.5 10v4M8 12h8"/>',
  carro: '<path d="M4.5 16.5H3V13l2.1-5A2 2 0 0 1 7 6.8h10a2 2 0 0 1 1.9 1.2L21 13v3.5h-1.5M9.3 16.5h5.4M3.5 12.5h17"/><circle cx="7.5" cy="16.8" r="1.8"/><circle cx="16.5" cy="16.8" r="1.8"/>',
  birrete: '<path d="M2 9l10-5 10 5-10 5-10-5Z"/><path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5M22 9v6"/>',
  puntos: '<circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/>',
  sinpe: '<path d="M4 8h15l-3-3M20 16H5l3 3"/>',
  ingreso: '<path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/>',
  // lista corta para categorías nuevas
  casa: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10M10 20v-6h4v6"/>',
  corazon: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>',
  regalo: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8C11 5 7 4 7 6.5S12 8 12 8Zm0 0c1-3 5-4 5-1.5S12 8 12 8Z"/>',
  libro: '<path d="M4 19V5a2 2 0 0 1 2-2h13v14H6a2 2 0 0 0-2 2Zm0 0a2 2 0 0 0 2 2h13v-4"/>',
  celular: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>',
  camisa: '<path d="M8 3 3 6l2 4 2-1v12h10V9l2 1 2-4-5-3a4 4 0 0 1-8 0Z"/>',
  // interfaz
  pastel: '<circle cx="12" cy="12" r="9"/><path d="M12 3v9h9"/>',
  lista: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  diana: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  recibo: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6"/>',
  engranaje: '<circle cx="12" cy="12" r="3"/><path d="M18.75 10.13L20.88 10.55L20.88 13.45L18.75 13.87L18.09 15.45L19.31 17.25L17.25 19.31L15.45 18.09L13.87 18.75L13.45 20.88L10.55 20.88L10.13 18.75L8.55 18.09L6.75 19.31L4.69 17.25L5.91 15.45L5.25 13.87L3.12 13.45L3.12 10.55L5.25 10.13L5.91 8.55L4.69 6.75L6.75 4.69L8.55 5.91L10.13 5.25L10.55 3.12L13.45 3.12L13.87 5.25L15.45 5.91L17.25 4.69L19.31 6.75L18.09 8.55Z"/>',
  lupa: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.3-4.3"/>',
  candado: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  lapiz: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/>',
  basura: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  cerrar: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  correo: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6 8.5-6"/>',
};
export const ICONOS_EXTRA = ['casa', 'corazon', 'regalo', 'libro', 'celular', 'camisa', 'carrito', 'plato', 'mancuerna', 'carro', 'birrete', 'puntos'];
export const icono = n => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${P[n] || P.puntos}</svg>`;
