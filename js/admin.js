// Panel de administración: evento, rondas/cartas y participantes.
// La seguridad real está en firestore.rules (solo el UID admin puede escribir config y rondas).
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, query, where, limit, Timestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

// Módulos locales con la misma versión (?v=...) que admin.html usó para cargar este archivo (sin caché).
const V = new URL(import.meta.url).search;
const { app, db, configurado } = await import(`./firebase-config.js${V}`);
const {
  esc, tsToDate, fmtDateTime, toInputValue, fromInputValue, premioTexto, cartasDe, NORMAS_DEFAULT, FALLBACK_IMG, makeEmbers, imgUrl,
} = await import(`./utils.js${V}`);

const $ = (id) => document.getElementById(id);
const auth = getAuth(app);

const S = {
  evento: null,
  rondas: [],
  votos: [],
  editId: null,      // id de la ronda que se edita (null = nueva)
  editNumero: 1,
  guardando: false,
};

/* ------------------------------------------------------------------ */
/*  Ayudas                                                            */
/* ------------------------------------------------------------------ */
let toastTimer = null;
function toast(msg, tipo = 'ok') {
  const el = $('toast');
  el.textContent = msg;
  el.className = `toast ${tipo}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, tipo === 'err' ? 7000 : 3500);
}

function errMsg(err) {
  if (err?.code === 'permission-denied') {
    return 'Sin permiso: esta cuenta no es la admin. Revisa el UID en firestore.rules y que las reglas estén publicadas.';
  }
  return err?.message || 'Error inesperado.';
}

async function conBoton(btn, fn) {
  if (S.guardando) return;
  S.guardando = true;
  if (btn) btn.disabled = true;
  try {
    await fn();
  } catch (err) {
    console.error(err);
    toast(errMsg(err), 'err');
  } finally {
    S.guardando = false;
    if (btn) btn.disabled = false;
  }
}

const rondaPorId = (id) => S.rondas.find((r) => r.id === id);

async function cargar() {
  const [ev, rs] = await Promise.all([getDoc(doc(db, 'config', 'evento')), getDocs(collection(db, 'rondas'))]);
  S.evento = ev.exists() ? ev.data() : null;
  S.rondas = rs.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.numero || 0) - (b.numero || 0));
}

function pintarTodo() {
  pintarEvento();
  pintarRondas();
  pintarSelectorRondas();
}

/* ------------------------------------------------------------------ */
/*  Pestaña: Evento                                                   */
/* ------------------------------------------------------------------ */
function pintarEvento() {
  const ev = S.evento;
  $('evento-aviso').hidden = !!ev;
  $('e-titulo').value = ev?.titulo ?? 'Noche de Tentación';
  $('e-subtitulo').value = ev?.subtitulo ?? 'Elige tu carta… si te atreves';
  $('e-normas').value = (ev?.normas?.length ? ev.normas : NORMAS_DEFAULT).join('\n');
  $('e-fin').value = toInputValue(tsToDate(ev?.finEvento) || new Date('2026-11-01T23:59:00-05:00'));
  $('e-activo').checked = ev ? ev.activo !== false : true;

  const r = ev && rondaPorId(ev.rondaActiva);
  $('evento-ronda').textContent = r
    ? `Ronda en curso: ${r.numero} (${r.estado}).`
    : 'No hay ronda activa. Crea y activa una en «Rondas y cartas».';
}

$('form-evento').addEventListener('submit', (e) => {
  e.preventDefault();
  conBoton(e.submitter, async () => {
    const titulo = $('e-titulo').value.trim();
    const fin = fromInputValue($('e-fin').value);
    const normas = $('e-normas').value.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!titulo) return toast('Escribe un título.', 'err');
    if (!fin || Number.isNaN(fin.getTime())) return toast('Pon una fecha de cierre válida.', 'err');
    if (!normas.length) return toast('Escribe al menos una norma.', 'err');

    await setDoc(
      doc(db, 'config', 'evento'),
      {
        titulo,
        subtitulo: $('e-subtitulo').value.trim(),
        normas,
        finEvento: Timestamp.fromDate(fin),
        activo: $('e-activo').checked,
      },
      { merge: true }
    );
    await cargar();
    pintarTodo();
    toast('Configuración guardada.');
  });
});

// Fuerza a todos los visitantes a volver a descargar las imágenes (incluso con la página abierta).
$('btn-cache').addEventListener('click', (e) => {
  if (!S.evento) return toast('Primero guarda la configuración del evento.', 'err');
  conBoton(e.currentTarget, async () => {
    await setDoc(doc(db, 'config', 'evento'), { cacheVersion: Date.now() }, { merge: true });
    await cargar();
    toast('Listo: los visitantes descargarán las imágenes de nuevo.');
  });
});

/* ------------------------------------------------------------------ */
/*  Pestaña: Rondas                                                   */
/* ------------------------------------------------------------------ */
function pintarRondas() {
  const ev = S.evento;
  const lista = [...S.rondas].sort((a, b) => (b.numero || 0) - (a.numero || 0));
  $('rondas-list').innerHTML = lista.length
    ? lista
        .map((r) => {
          const enCurso = ev?.rondaActiva === r.id && r.estado === 'activa';
          const acciones = [
            `<button type="button" class="btn btn-ghost btn-sm" data-act="editar" data-id="${esc(r.id)}">Editar</button>`,
            r.estado === 'proxima' ? `<button type="button" class="btn btn-sm" data-act="activar" data-id="${esc(r.id)}">Activar</button>` : '',
            r.estado === 'activa' ? `<button type="button" class="btn btn-danger btn-sm" data-act="cerrar" data-id="${esc(r.id)}">Cerrar ronda</button>` : '',
            r.estado === 'proxima' ? `<button type="button" class="btn btn-ghost btn-sm" data-act="eliminar" data-id="${esc(r.id)}">Eliminar</button>` : '',
          ].join('');
          const thumbs = cartasDe(r)
            .map(
              (c) => `
              <div class="thumb">
                <img src="${esc(imgUrl(c.imagen, Date.now()))}" alt="" loading="lazy">
                <b>${esc(c.nombre)}</b>${esc(c.tipo === 'kakeras' ? premioTexto(c) : 'Carta')}
              </div>`
            )
            .join('');
          return `
            <article class="ronda-card${enCurso ? ' live' : ''}">
              <div class="ronda-head">
                <h3>Ronda ${esc(r.numero)}</h3>
                <span class="pill ${esc(r.estado)}">${esc(r.estado)}</span>
                ${enCurso ? '<span class="pill activa">en la web ahora</span>' : ''}
              </div>
              <p class="ronda-dates">Inicio: ${esc(fmtDateTime(tsToDate(r.inicio)))} · Cierre: ${esc(fmtDateTime(tsToDate(r.fin)))}</p>
              <div class="thumbs">${thumbs}</div>
              <div class="ronda-actions">${acciones}</div>
            </article>`;
        })
        .join('')
    : '<p class="muted">Todavía no hay rondas. Crea la primera con «Nueva ronda».</p>';

  $('rondas-list').querySelectorAll('img').forEach((img) => {
    img.addEventListener('error', () => { img.src = FALLBACK_IMG; }, { once: true });
  });
}

function imagenPorDefecto(numero, i) {
  return numero === 1 ? `assets/cards/carta${i}.svg` : `assets/cards/r${numero}-c${i}.webp`;
}

function cartaFormHTML(i, c, numero) {
  const tipo = c?.tipo || 'carta';
  const imagen = c?.imagen ?? imagenPorDefecto(numero, i);
  return `
    <fieldset class="cfs" data-i="${i}">
      <legend>Carta ${i}</legend>
      <label class="label">Nombre</label>
      <input class="input" data-f="nombre" maxlength="60" value="${esc(c?.nombre || '')}" placeholder="Nombre de la carta">

      <div class="row2">
        <div>
          <label class="label">Tipo de premio</label>
          <select class="input" data-f="tipo">
            <option value="carta"${tipo === 'carta' ? ' selected' : ''}>Carta</option>
            <option value="kakeras"${tipo === 'kakeras' ? ' selected' : ''}>Kakeras</option>
          </select>
        </div>
        <div data-cant${tipo === 'kakeras' ? '' : ' hidden'}>
          <label class="label">Cantidad de kakeras</label>
          <input class="input" data-f="cantidad" type="number" inputmode="numeric" min="1" step="1" value="${esc(c?.cantidad ?? '')}">
        </div>
      </div>

      <label class="label">Ruta de la imagen</label>
      <input class="input" data-f="imagen" value="${esc(imagen)}" placeholder="assets/cards/mi-carta.webp" autocapitalize="none" spellcheck="false">

      <label class="label">Descripción (opcional)</label>
      <input class="input" data-f="descripcion" maxlength="120" value="${esc(c?.descripcion || '')}">

      <img class="prev" data-prev src="${esc(imgUrl(imagen, Date.now()))}" alt="Vista previa">
    </fieldset>`;
}

function abrirFormRonda(id) {
  const r = id ? rondaPorId(id) : null;
  const numero = r ? r.numero : Math.max(0, ...S.rondas.map((x) => x.numero || 0)) + 1;
  S.editId = id;
  S.editNumero = numero;

  const inicio = tsToDate(r?.inicio) || new Date();
  inicio.setSeconds(0, 0);
  let fin = tsToDate(r?.fin);
  if (!fin) {
    fin = new Date(inicio);
    fin.setDate(fin.getDate() + 3);
    fin.setHours(23, 59, 0, 0);
  }

  $('ronda-form-title').textContent = r ? `Editar ronda ${numero}` : `Nueva ronda ${numero}`;
  $('rf-inicio').value = toInputValue(inicio);
  $('rf-fin').value = toInputValue(fin);
  $('ronda-cartas').innerHTML = [1, 2, 3].map((i) => cartaFormHTML(i, r?.cartas?.[`c${i}`], numero)).join('');
  $('rondas-list-view').hidden = true;
  $('ronda-form-view').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cerrarFormRonda() {
  $('ronda-form-view').hidden = true;
  $('rondas-list-view').hidden = false;
}

function leerCartas() {
  const cartas = {};
  for (const fs of document.querySelectorAll('#ronda-cartas .cfs')) {
    const i = fs.dataset.i;
    const g = (f) => fs.querySelector(`[data-f="${f}"]`).value.trim();
    const nombre = g('nombre');
    const imagen = g('imagen');
    const tipo = g('tipo');
    const descripcion = g('descripcion');
    if (!nombre) return { error: `Carta ${i}: falta el nombre.` };
    if (!imagen) return { error: `Carta ${i}: falta la ruta de la imagen.` };
    const c = { orden: Number(i), nombre, tipo, imagen };
    if (descripcion) c.descripcion = descripcion;
    if (tipo === 'kakeras') {
      const n = Number(g('cantidad'));
      if (!Number.isInteger(n) || n <= 0) return { error: `Carta ${i}: la cantidad de kakeras debe ser un entero mayor que 0.` };
      c.cantidad = n;
    }
    cartas[`c${i}`] = c;
  }
  return { cartas };
}

// Avisa si una carta (tipo "carta") ya salió en otra ronda: las cartas retiradas no deberían volver.
function repetidas(cartas, idActual) {
  const out = new Set();
  for (const r of S.rondas) {
    if (r.id === idActual) continue;
    for (const o of cartasDe(r)) {
      if (o.tipo !== 'carta') continue;
      for (const c of Object.values(cartas)) {
        if (c.tipo !== 'carta') continue;
        const mismoNombre = o.nombre.trim().toLowerCase() === c.nombre.trim().toLowerCase();
        if (mismoNombre || o.imagen === c.imagen) out.add(`«${c.nombre}» ya salió en la ronda ${r.numero}`);
      }
    }
  }
  return [...out];
}

async function tieneVotos(rondaId) {
  const snap = await getDocs(query(collection(db, 'votos'), where('rondaId', '==', rondaId), limit(1)));
  return !snap.empty;
}

$('form-ronda').addEventListener('submit', (e) => {
  e.preventDefault();
  conBoton(e.submitter, async () => {
    const inicio = fromInputValue($('rf-inicio').value);
    const fin = fromInputValue($('rf-fin').value);
    if (!inicio || !fin || Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) return toast('Pon fechas de inicio y cierre válidas.', 'err');
    if (fin <= inicio) return toast('El cierre debe ser posterior al inicio.', 'err');

    const { cartas, error } = leerCartas();
    if (error) return toast(error, 'err');

    const rep = repetidas(cartas, S.editId);
    if (rep.length && !confirm(`${rep.join('\n')}\n\nSi la repites, la gente podrá conseguirla otra vez. ¿Guardar igualmente?`)) return;

    const id = S.editId || `ronda${S.editNumero}`;
    if (S.editId && (await tieneVotos(id)) && !confirm('Esta ronda ya tiene votos. Cambiar las cartas puede dejarlos inconsistentes. ¿Continuar?')) return;

    const previa = S.editId ? rondaPorId(id) : null;
    await setDoc(doc(db, 'rondas', id), {
      numero: S.editNumero,
      inicio: Timestamp.fromDate(inicio),
      fin: Timestamp.fromDate(fin),
      estado: previa?.estado || 'proxima',
      cartas,
      // Cada vez que se guarda la ronda cambia la versión: los visitantes vuelven a descargar las imágenes.
      version: Date.now(),
    });
    await cargar();
    pintarTodo();
    cerrarFormRonda();
    toast(`Ronda ${S.editNumero} guardada.`);
  });
});

async function activar(id, btn) {
  const r = rondaPorId(id);
  if (!r) return;
  if (!S.evento) return toast('Primero guarda la configuración del evento (pestaña Evento).', 'err');
  const fin = tsToDate(r.fin);
  if (fin && fin <= new Date()) return toast('El cierre de esa ronda ya pasó. Edítala y pon una fecha futura.', 'err');

  const vigente = S.rondas.find((x) => x.estado === 'activa' && x.id !== id);
  const aviso =
    `¿Activar la ronda ${r.numero}?` +
    (vigente ? `\n\nLa ronda ${vigente.numero} se cerrará y sus cartas ya no se podrán conseguir.` : '');
  if (!confirm(aviso)) return;

  await conBoton(btn, async () => {
    const b = writeBatch(db);
    if (vigente) b.update(doc(db, 'rondas', vigente.id), { estado: 'cerrada' });
    b.update(doc(db, 'rondas', id), { estado: 'activa' });
    b.set(doc(db, 'config', 'evento'), { rondaActiva: id }, { merge: true });
    await b.commit();
    await cargar();
    pintarTodo();
    toast(`Ronda ${r.numero} activada.`);
  });
}

async function cerrar(id, btn) {
  const r = rondaPorId(id);
  if (!r || !confirm(`¿Cerrar la ronda ${r.numero} ahora? Las cartas saldrán de rotación y nadie más podrá elegirlas.`)) return;
  await conBoton(btn, async () => {
    const data = { estado: 'cerrada' };
    const fin = tsToDate(r.fin);
    if (fin && fin > new Date()) data.fin = Timestamp.now();
    await updateDoc(doc(db, 'rondas', id), data);
    await cargar();
    pintarTodo();
    toast(`Ronda ${r.numero} cerrada.`);
  });
}

async function eliminar(id, btn) {
  const r = rondaPorId(id);
  if (!r || !confirm(`¿Eliminar la ronda ${r.numero}? Esta acción no se puede deshacer.`)) return;
  await conBoton(btn, async () => {
    await deleteDoc(doc(db, 'rondas', id));
    await cargar();
    pintarTodo();
    toast('Ronda eliminada.');
  });
}

$('rondas-list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const { act, id } = b.dataset;
  if (act === 'editar') abrirFormRonda(id);
  else if (act === 'activar') activar(id, b);
  else if (act === 'cerrar') cerrar(id, b);
  else if (act === 'eliminar') eliminar(id, b);
});
$('btn-nueva').addEventListener('click', () => abrirFormRonda(null));
$('btn-ronda-volver').addEventListener('click', cerrarFormRonda);
$('btn-ronda-cancel').addEventListener('click', cerrarFormRonda);

// Vista previa de imagen y campo de cantidad según el tipo
$('ronda-cartas').addEventListener('input', (e) => {
  if (e.target.matches('[data-f="imagen"]')) {
    const prev = e.target.closest('.cfs').querySelector('[data-prev]');
    prev.src = imgUrl(e.target.value.trim(), Date.now()) || FALLBACK_IMG;
  }
});
$('ronda-cartas').addEventListener('change', (e) => {
  if (e.target.matches('[data-f="tipo"]')) {
    e.target.closest('.cfs').querySelector('[data-cant]').hidden = e.target.value !== 'kakeras';
  }
});
$('ronda-cartas').addEventListener('error', (e) => {
  if (e.target.matches('[data-prev]')) e.target.src = FALLBACK_IMG;
}, true);

/* ------------------------------------------------------------------ */
/*  Pestaña: Participantes                                            */
/* ------------------------------------------------------------------ */
function pintarSelectorRondas() {
  const sel = $('p-ronda');
  const previo = sel.value;
  const opts = [...S.rondas]
    .sort((a, b) => (b.numero || 0) - (a.numero || 0))
    .map((r) => `<option value="${esc(r.id)}">Ronda ${esc(r.numero)} (${esc(r.estado)})</option>`);
  opts.push('<option value="*">Todas las rondas</option>');
  sel.innerHTML = opts.join('');
  const valores = [...sel.options].map((o) => o.value);
  sel.value = valores.includes(previo) ? previo : valores.includes(S.evento?.rondaActiva) ? S.evento.rondaActiva : valores[0];
}

async function cargarVotos() {
  const rid = $('p-ronda').value;
  if (!rid) { S.votos = []; return pintarVotos(); }
  const col = collection(db, 'votos');
  const snap = rid === '*' ? await getDocs(col) : await getDocs(query(col, where('rondaId', '==', rid)));
  S.votos = snap.docs
    .map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))
    .sort((a, b) => (a.rondaId || '').localeCompare(b.rondaId || '') || (tsToDate(a.creado)?.getTime() || 0) - (tsToDate(b.creado)?.getTime() || 0));
  pintarVotos();
}

function infoCarta(v) {
  const r = rondaPorId(v.rondaId);
  const c = r?.cartas?.[v.cartaId];
  return {
    ronda: r?.numero ?? '?',
    nombre: c?.nombre ?? v.cartaId,
    tipo: c?.tipo || '',
    cantidad: c?.tipo === 'kakeras' ? c.cantidad : '',
    premio: c ? (c.tipo === 'kakeras' ? premioTexto(c) : 'Carta') : '',
  };
}

function votosFiltrados() {
  const q = $('p-buscar').value.trim().toLowerCase();
  return q ? S.votos.filter((v) => (v.usuarioLower || '').includes(q)) : S.votos;
}

function pintarVotos() {
  const lista = votosFiltrados();
  const multi = $('p-ronda').value === '*';

  const conteo = {};
  lista.forEach((v) => {
    const i = infoCarta(v);
    const k = multi ? `R${i.ronda} · ${i.nombre}` : i.nombre;
    conteo[k] = (conteo[k] || 0) + 1;
  });
  const entregados = lista.filter((v) => v.entregado).length;
  $('p-resumen').textContent =
    `Total: ${lista.length} · Entregados: ${entregados}` +
    (Object.keys(conteo).length ? ' · ' + Object.entries(conteo).map(([k, n]) => `${k}: ${n}`).join(' · ') : '');

  $('p-body').innerHTML = lista.length
    ? lista
        .map((v) => {
          const i = infoCarta(v);
          return `
            <tr>
              <td><b>${esc(v.usuario)}</b></td>
              <td>${multi ? `R${esc(i.ronda)} · ` : ''}${esc(i.nombre)}<br><span class="muted small">${esc(i.premio)}</span></td>
              <td>${esc(fmtDateTime(tsToDate(v.creado)))}</td>
              <td><input type="checkbox" data-ent="${esc(v.id)}"${v.entregado ? ' checked' : ''} aria-label="Entregado"></td>
              <td><button type="button" class="btn btn-ghost btn-sm" data-del="${esc(v.id)}">Quitar</button></td>
            </tr>`;
        })
        .join('')
    : '<tr><td colspan="5" class="empty-row">Sin participantes.</td></tr>';
}

$('p-ronda').addEventListener('change', () => conBoton(null, cargarVotos));
$('p-buscar').addEventListener('input', pintarVotos);

$('p-body').addEventListener('change', (e) => {
  const cb = e.target.closest('[data-ent]');
  if (!cb) return;
  const v = S.votos.find((x) => x.id === cb.dataset.ent);
  conBoton(null, async () => {
    try {
      await updateDoc(doc(db, 'votos', cb.dataset.ent), { entregado: cb.checked });
      if (v) v.entregado = cb.checked;
      pintarVotos();
    } catch (err) {
      cb.checked = !cb.checked;
      throw err;
    }
  });
});

$('p-body').addEventListener('click', (e) => {
  const b = e.target.closest('[data-del]');
  if (!b) return;
  const v = S.votos.find((x) => x.id === b.dataset.del);
  if (!v || !confirm(`¿Quitar la participación de «${v.usuario}»? Podrá volver a elegir en esa ronda.`)) return;
  conBoton(b, async () => {
    await deleteDoc(doc(db, 'votos', v.id));
    S.votos = S.votos.filter((x) => x.id !== v.id);
    pintarVotos();
    toast('Participación eliminada.');
  });
});

$('btn-csv').addEventListener('click', () => {
  const lista = votosFiltrados();
  if (!lista.length) return toast('No hay nada que exportar.', 'err');
  const celda = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`;
  const filas = [['Ronda', 'Usuario', 'Carta', 'Premio', 'Cantidad kakeras', 'Fecha', 'Entregado']];
  lista.forEach((v) => {
    const i = infoCarta(v);
    filas.push([i.ronda, v.usuario, i.nombre, i.premio, i.cantidad, fmtDateTime(tsToDate(v.creado)), v.entregado ? 'Sí' : 'No']);
  });
  const csv = '﻿' + filas.map((f) => f.map(celda).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `participantes-halloween-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});

/* ------------------------------------------------------------------ */
/*  Pestañas                                                          */
/* ------------------------------------------------------------------ */
document.querySelector('.tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === b));
  ['evento', 'rondas', 'part'].forEach((t) => { $(`tab-${t}`).hidden = t !== b.dataset.tab; });
  if (b.dataset.tab === 'part') conBoton(null, cargarVotos);
});

/* ------------------------------------------------------------------ */
/*  Sesión                                                            */
/* ------------------------------------------------------------------ */
const mostrar = (login) => {
  $('login-view').hidden = !login;
  $('panel-view').hidden = login;
};

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('login-error');
  err.hidden = true;
  if (!configurado) {
    err.textContent = 'Falta configurar Firebase en js/firebase-config.js.';
    err.hidden = false;
    return;
  }
  const btn = $('login-btn');
  btn.disabled = true;
  btn.textContent = 'Entrando…';
  try {
    await signInWithEmailAndPassword(auth, $('l-mail').value.trim(), $('l-pass').value);
  } catch (ex) {
    console.error(ex);
    const bad = ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'];
    err.textContent = bad.includes(ex.code)
      ? 'Correo o contraseña incorrectos.'
      : ex.code === 'auth/too-many-requests'
        ? 'Demasiados intentos. Espera unos minutos.'
        : 'No se pudo iniciar sesión. Revisa la configuración de Firebase.';
    err.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
});

$('btn-salir').addEventListener('click', () => signOut(auth));

makeEmbers(8);

if (!configurado) {
  mostrar(true);
  $('login-error').textContent = 'Falta configurar Firebase en js/firebase-config.js.';
  $('login-error').hidden = false;
} else {
  onAuthStateChanged(auth, async (user) => {
    if (!user) return mostrar(true);
    mostrar(false);
    $('user-mail').textContent = user.email || '';
    try {
      await cargar();
      pintarTodo();
    } catch (err) {
      console.error(err);
      toast(errMsg(err), 'err');
    }
  });
}
