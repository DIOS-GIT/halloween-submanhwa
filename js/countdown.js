// Contador regresivo. Intenta alinearse con la hora del servidor (cabecera Date de GitHub Pages)
// para que un reloj mal puesto en el teléfono no engañe a la pantalla.
// La validación real del plazo la hacen las reglas de Firestore con la hora del servidor.

let offset = 0;

export async function syncServerTime() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const t0 = Date.now();
    const res = await fetch(location.pathname, { method: 'HEAD', cache: 'no-store', signal: ctrl.signal });
    clearTimeout(timer);
    const header = res.headers.get('Date');
    if (header) {
      const server = new Date(header).getTime();
      if (!Number.isNaN(server)) offset = server - (t0 + Date.now()) / 2;
    }
  } catch {
    /* sin sincronización: se usa el reloj del dispositivo */
  }
}

export const now = () => Date.now() + offset;

export function parts(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const p = (n) => String(n).padStart(2, '0');
  return {
    d: String(Math.floor(total / 86400)),
    h: p(Math.floor((total % 86400) / 3600)),
    m: p(Math.floor((total % 3600) / 60)),
    s: p(total % 60),
  };
}

// Devuelve una función para detener el contador.
export function startCountdown(target, onTick, onDone) {
  const end = target.getTime();
  let timer = null;
  const tick = () => {
    const left = end - now();
    onTick(parts(left));
    if (left <= 0) {
      clearInterval(timer);
      onDone?.();
    }
  };
  timer = setInterval(tick, 500);
  tick();
  return () => clearInterval(timer);
}
