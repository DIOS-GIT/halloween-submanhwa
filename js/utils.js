// Utilidades compartidas por la página pública y el panel admin.

export const ZONA = 'America/Bogota';

export const NORMAS_DEFAULT = [
  'Cada persona puede elegir una sola carta por ronda.',
  'La elección es definitiva: no se puede cambiar ni repetir dentro de la misma ronda.',
  'Debes escribir tu usuario de SubManhwa tal cual es. Un mismo usuario no puede participar dos veces en la misma ronda.',
  'Cada ronda tiene su propio contador. Al terminar, las cartas salen de rotación y ya no se pueden volver a conseguir.',
  'Los premios (cartas o kakeras) se envían después del cierre de la ronda.',
  'Los nombres falsos, duplicados o de usuarios que no existan serán anulados por el administrador.',
];

export const FALLBACK_IMG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#2a0a1a"/><stop offset="1" stop-color="#0d0612"/></linearGradient></defs>' +
      '<rect width="600" height="900" fill="url(#g)"/>' +
      '<text x="300" y="440" text-anchor="middle" fill="#c0123f" font-size="72" font-family="serif">✦</text>' +
      '<text x="300" y="520" text-anchor="middle" fill="#b09fac" font-size="28" font-family="serif">Imagen no disponible</text>' +
      '</svg>'
  );

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Normaliza el nombre de usuario: quita @, espacios repetidos y pasa a minúsculas para comparar.
export function normalizeUser(raw) {
  const display = String(raw || '')
    .normalize('NFC')
    .trim()
    .replace(/^@+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { display, lower: display.toLowerCase() };
}

export const USER_RE = /^[\p{L}\p{N}_.\-]+( [\p{L}\p{N}_.\-]+)*$/u;
export const validUser = (display) => display.length >= 2 && display.length <= 30 && USER_RE.test(display);

// ID del documento de voto: una persona = un documento por ronda.
export const voteId = (rondaId, lower) => `${rondaId}_${lower}`;

// Añade ?v=<versión> a las imágenes locales para saltarse la caché del navegador y de la CDN.
// Las URLs externas (http/https/data) se dejan intactas.
export function imgUrl(src, ver) {
  const s = String(src || '');
  if (!s || !ver || /^(https?:|data:|blob:|\/\/)/i.test(s)) return s;
  return s + (s.includes('?') ? '&' : '?') + 'v=' + ver;
}

export const tsToDate =(t) => (t && typeof t.toDate === 'function' ? t.toDate() : t instanceof Date ? t : null);

export const fmtDateTime = (d) =>
  d ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: ZONA }).format(d) : '—';

// <input type="datetime-local"> ⇄ Date (hora local del dispositivo)
export function toInputValue(d) {
  if (!d) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export const fromInputValue = (v) => (v ? new Date(v) : null);

export function premioTexto(c) {
  return c.tipo === 'kakeras' ? `${Number(c.cantidad || 0).toLocaleString('es-CO')} kakeras` : 'Carta del evento';
}

// Las cartas de una ronda se guardan como mapa {c1:{...}, c2:{...}, c3:{...}} (así las reglas pueden validarlas).
export function cartasDe(ronda) {
  return Object.entries(ronda?.cartas || {})
    .map(([id, c]) => ({ id, ...c }))
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.id.localeCompare(b.id));
}

// localStorage seguro (puede fallar en modo privado)
export const store = {
  get(k) {
    try {
      return localStorage.getItem('halloween:' + k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('halloween:' + k, v);
    } catch {
      /* sin almacenamiento */
    }
  },
};

// Brasas decorativas del fondo
export function makeEmbers(n = 14) {
  const box = document.querySelector('.ambient');
  if (!box || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (let i = 0; i < n; i++) {
    const el = document.createElement('i');
    el.style.cssText =
      `left:${Math.random() * 100}%;--s:${3 + Math.random() * 5}px;--d:${9 + Math.random() * 10}s;` +
      `--delay:${-Math.random() * 14}s;--x:${(Math.random() - 0.5) * 120}px`;
    box.appendChild(el);
  }
}
