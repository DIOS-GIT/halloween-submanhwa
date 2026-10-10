// Página pública del evento: ronda activa, contador, elección de carta y nombres de quienes ya eligieron.
import { db, configurado, OPCIONES } from './firebase-config.js';
import {
  collection, doc, onSnapshot, getDoc, getDocs, setDoc, query, where, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { syncServerTime, now, startCountdown } from './countdown.js';
import {
  esc, normalizeUser, validUser, voteId, tsToDate, fmtDateTime, premioTexto, cartasDe,
  FALLBACK_IMG, NORMAS_DEFAULT, store, makeEmbers,
} from './utils.js';

const $ = (id) => document.getElementById(id);

const state = {
  evento: null,
  rondas: {},
  listo: { evento: false, rondas: false },
  votos: [],            // votos de la ronda activa
  votosRonda: null,
  unsubVotos: null,
  historial: {},        // rondaId -> votos (se cargan bajo demanda en "Cartas retiradas")
  cdKey: '',
  stopCd: null,
  sel: null,            // { rondaId, cartaId } mientras el modal está abierto
  enviando: false,
  error: null,
};

/* ------------------------------------------------------------------ */
/*  Estado de la ronda                                                */
/* ------------------------------------------------------------------ */
function status() {
  const ev = state.evento;
  if (!ev) return { k: 'sinevento', msg: 'El evento aún no está configurado. Vuelve pronto.' };
  if (ev.activo === false) return { k: 'pausado', msg: 'El evento está en pausa. Vuelve pronto.' };

  const r = state.rondas[ev.rondaActiva];
  if (!r || r.estado === 'proxima') return { k: 'sinronda', msg: 'La próxima ronda de cartas llegará muy pronto…' };

  const t = now();
  const inicio = tsToDate(r.inicio);
  const fin = tsToDate(r.fin);
  const finEv = tsToDate(ev.finEvento);
  const num = r.numero ?? '';

  if (r.estado === 'cerrada') return { k: 'cerrada', ronda: r, msg: `La ronda ${num} terminó. Prepárate para la siguiente rotación.` };
  if (finEv && t >= finEv) return { k: 'finevento', ronda: r, msg: 'El evento terminó. ¡Gracias por participar!' };
  if (inicio && t < inicio) return { k: 'pronto', ronda: r, target: inicio, label: `La ronda ${num} abre en`, msg: `Las cartas de la ronda ${num} se revelan pronto.` };
  if (fin && t >= fin) return { k: 'terminada', ronda: r, msg: `La ronda ${num} terminó. Prepárate para la siguiente rotación.` };
  return { k: 'abierta', ronda: r, target: fin, label: `La ronda ${num} termina en`, msg: 'Elige una sola carta. Tu decisión es definitiva.' };
}

/* ------------------------------------------------------------------ */
/*  Render                                                            */
/* ------------------------------------------------------------------ */
function render() {
  const ev = state.evento;
  $('titulo').textContent = ev?.titulo || 'Noche de Tentación';
  $('subtitulo').textContent = ev?.subtitulo || 'Elige tu carta… si te atreves';
  document.title = `${ev?.titulo || 'Evento de Halloween'} · SubManhwa`;
  renderNormas(ev);

  if (state.error) {
    $('estado').textContent = state.error;
    updateCountdown({});
    $('cartas-section').hidden = true;
    return;
  }
  if (!state.listo.evento || !state.listo.rondas) {
    $('estado').textContent = 'Cargando evento…';
    return;
  }

  const st = status();
  $('estado').textContent = st.msg;
  updateCountdown(st);
  renderCartas(st);
  renderRetiradas();
}

function renderNormas(ev) {
  const normas = Array.isArray(ev?.normas) && ev.normas.length ? ev.normas : NORMAS_DEFAULT;
  $('normas').innerHTML = normas.map((n) => `<li>${esc(n)}</li>`).join('');
}

function updateCountdown(st) {
  const box = $('countdown');
  if (!st.target) {
    box.hidden = true;
    state.stopCd?.();
    state.stopCd = null;
    state.cdKey = '';
    return;
  }
  box.hidden = false;
  $('cd-label').textContent = st.label;
  const key = `${st.k}|${st.target.getTime()}`;
  if (key === state.cdKey) return;
  state.stopCd?.();
  state.cdKey = key;
  state.stopCd = startCountdown(
    st.target,
    (p) => {
      $('cd-d').textContent = p.d;
      $('cd-h').textContent = p.h;
      $('cd-m').textContent = p.m;
      $('cd-s').textContent = p.s;
    },
    () => {
      state.cdKey = '';
      render();
    }
  );
}

function cardHTML(c, opts) {
  const { retired = false, boton = '', mine = false } = opts;
  const prize = c.tipo === 'kakeras' ? premioTexto(c) : '';
  return `
    <article class="card${mine ? ' mine' : ''}${retired ? ' retired' : ''}" data-carta="${esc(c.id)}">
      <div class="card-img">
        <img src="${esc(c.imagen || '')}" alt="${esc(c.nombre)}" loading="lazy" decoding="async">
        <span class="badge">${c.tipo === 'kakeras' ? 'Kakeras' : 'Carta'}</span>
        ${mine ? '<span class="badge mine-badge">Tu elección</span>' : ''}
        ${retired ? '<div class="ribbon">Ya no disponible</div>' : ''}
      </div>
      <div class="card-body">
        <h3>${esc(c.nombre)}</h3>
        ${prize ? `<p class="prize">${esc(prize)}</p>` : ''}
        ${c.descripcion ? `<p class="desc">${esc(c.descripcion)}</p>` : ''}
        ${boton}
        <div class="voters">
          <p class="voters-title">Han elegido (<span data-count>0</span>)</p>
          <ul class="chips" data-voters></ul>
        </div>
      </div>
    </article>`;
}

function bindImgFallback(root) {
  root.querySelectorAll('img').forEach((img) => {
    img.addEventListener('error', () => { img.src = FALLBACK_IMG; }, { once: true });
  });
}

function renderCartas(st) {
  const sec = $('cartas-section');
  if (!st.ronda) {
    sec.hidden = true;
    $('cartas').innerHTML = '';
    return;
  }
  const r = st.ronda;
  const abierta = st.k === 'abierta';
  const miVoto = store.get(`voto:${r.id}`);
  $('ronda-num').textContent = r.numero ? `· Ronda ${r.numero}` : '';

  $('cartas').innerHTML = cartasDe(r)
    .map((c) => {
      let label = 'Ronda cerrada';
      let off = true;
      if (miVoto) label = 'Ya elegiste en esta ronda';
      else if (abierta) { label = 'Elegir esta carta'; off = false; }
      else if (st.k === 'pronto') label = 'Aún no abre';
      const boton = `<button type="button" class="btn" data-pick="${esc(c.id)}"${off ? ' disabled' : ''}>${label}</button>`;
      return cardHTML(c, { boton, mine: miVoto === c.id });
    })
    .join('');
  sec.hidden = false;
  bindImgFallback($('cartas'));
  updateVoters();
}

// Pinta los nombres bajo cada carta de la ronda activa sin rehacer toda la cuadrícula.
function updateVoters() {
  const box = $('cartas');
  const miUsuario = (store.get('usuario') || '').toLowerCase();
  box.querySelectorAll('[data-carta]').forEach((card) => {
    const id = card.dataset.carta;
    const lista = state.votos.filter((v) => v.cartaId === id);
    card.querySelector('[data-count]').textContent = lista.length;
    card.querySelector('[data-voters]').innerHTML = lista.length
      ? lista.map((v) => `<li${v.usuarioLower === miUsuario ? ' class="me"' : ''}>${esc(v.usuario)}</li>`).join('')
      : '<li class="empty">Nadie todavía…</li>';
  });
}

function renderRetiradas() {
  const act = state.evento?.rondaActiva;
  const lista = Object.values(state.rondas)
    .filter((r) => r.estado === 'cerrada' && r.id !== act)
    .sort((a, b) => (b.numero || 0) - (a.numero || 0));

  const sec = $('retiradas-section');
  sec.hidden = !lista.length;
  if (!lista.length) return;

  $('retiradas').innerHTML = lista
    .map((r) => {
      const cargado = state.historial[r.id];
      const btn = cargado ? '' : `<button type="button" class="btn btn-ghost btn-sm" data-ver="${esc(r.id)}">Ver quién las consiguió</button>`;
      return `
        <div class="retired-round" data-ronda="${esc(r.id)}">
          <div class="retired-head">
            <h3>Ronda ${esc(r.numero ?? '')}</h3>
            <span class="when">Cerró: ${esc(fmtDateTime(tsToDate(r.fin)))}</span>
            ${btn}
          </div>
          <div class="cards">${cartasDe(r).map((c) => cardHTML(c, { retired: true })).join('')}</div>
        </div>`;
    })
    .join('');

  bindImgFallback($('retiradas'));
  lista.forEach((r) => {
    const votos = state.historial[r.id];
    const wrap = $('retiradas').querySelector(`[data-ronda="${CSS.escape(r.id)}"]`);
    wrap?.querySelectorAll('[data-carta]').forEach((card) => {
      const ul = card.querySelector('[data-voters]');
      if (!votos) {
        card.querySelector('.voters').hidden = true;
        return;
      }
      const l = votos.filter((v) => v.cartaId === card.dataset.carta);
      card.querySelector('[data-count]').textContent = l.length;
      ul.innerHTML = l.length ? l.map((v) => `<li>${esc(v.usuario)}</li>`).join('') : '<li class="empty">Nadie la eligió</li>';
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Votos de la ronda activa                                          */
/* ------------------------------------------------------------------ */
const ordenarVotos = (arr) =>
  arr.sort((a, b) => (tsToDate(a.creado)?.getTime() || 0) - (tsToDate(b.creado)?.getTime() || 0));

const leerVotos = (snap) => ordenarVotos(snap.docs.map((d) => d.data({ serverTimestamps: 'estimate' })));

async function cargarVotosActivos() {
  if (!state.votosRonda) return;
  const q = query(collection(db, 'votos'), where('rondaId', '==', state.votosRonda));
  if (OPCIONES.votosEnVivo) {
    state.unsubVotos?.();
    state.unsubVotos = onSnapshot(
      q,
      (snap) => { state.votos = leerVotos(snap); updateVoters(); },
      (err) => console.warn('No se pudieron leer los votos', err)
    );
  } else {
    state.votos = leerVotos(await getDocs(q));
    updateVoters();
  }
}

function syncVotos() {
  const rid = state.evento?.rondaActiva || null;
  if (rid === state.votosRonda) return;
  state.unsubVotos?.();
  state.unsubVotos = null;
  state.votosRonda = rid;
  state.votos = [];
  if (rid) cargarVotosActivos().catch((e) => console.warn(e));
}

async function verHistorial(rondaId) {
  const btn = $('retiradas').querySelector(`[data-ver="${CSS.escape(rondaId)}"]`);
  if (btn) { btn.disabled = true; btn.textContent = 'Cargando…'; }
  try {
    const snap = await getDocs(query(collection(db, 'votos'), where('rondaId', '==', rondaId)));
    state.historial[rondaId] = leerVotos(snap);
  } catch (e) {
    console.warn(e);
    if (btn) { btn.disabled = false; btn.textContent = 'No se pudo cargar. Reintentar'; }
    return;
  }
  renderRetiradas();
}

/* ------------------------------------------------------------------ */
/*  Modal de elección                                                 */
/* ------------------------------------------------------------------ */
function abrirModal(cartaId) {
  const st = status();
  if (st.k !== 'abierta') return;
  const carta = cartasDe(st.ronda).find((c) => c.id === cartaId);
  if (!carta) return;
  state.sel = { rondaId: st.ronda.id, cartaId };

  $('modal-title').textContent = carta.nombre;
  $('modal-prize').textContent = carta.tipo === 'kakeras' ? premioTexto(carta) : 'Carta del evento';
  $('f-user').value = store.get('usuario') || '';
  $('f-ok').checked = false;
  errorModal('');
  $('modal-form-view').hidden = false;
  $('modal-done-view').hidden = true;
  $('modal').hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('f-user').focus(), 60);
}

function cerrarModal() {
  $('modal').hidden = true;
  document.body.style.overflow = '';
  state.sel = null;
}

function errorModal(msg) {
  const el = $('modal-error');
  el.textContent = msg;
  el.hidden = !msg;
}

async function confirmar(e) {
  e.preventDefault();
  if (state.enviando) return;

  const sel = state.sel;
  const st = status();
  if (!sel || st.k !== 'abierta' || st.ronda.id !== sel.rondaId) return errorModal('La ronda ya no está abierta.');

  const { display, lower } = normalizeUser($('f-user').value);
  if (!validUser(display)) return errorModal('Escribe tu usuario de SubManhwa (2 a 30 caracteres, sin símbolos raros).');
  if (!$('f-ok').checked) return errorModal('Marca la casilla para confirmar que tu elección es definitiva.');
  if (state.votos.some((v) => v.usuarioLower === lower)) return errorModal('Ese usuario ya participó en esta ronda.');

  state.enviando = true;
  $('btn-confirmar').disabled = true;
  $('btn-confirmar').textContent = 'Enviando…';
  errorModal('');

  try {
    const ref = doc(db, 'votos', voteId(sel.rondaId, lower));
    if ((await getDoc(ref)).exists()) {
      errorModal('Ese usuario ya participó en esta ronda.');
      return;
    }
    await setDoc(ref, {
      usuario: display,
      usuarioLower: lower,
      rondaId: sel.rondaId,
      cartaId: sel.cartaId,
      creado: serverTimestamp(),
      entregado: false,
    });

    store.set(`voto:${sel.rondaId}`, sel.cartaId);
    store.set('usuario', display);
    if (!OPCIONES.votosEnVivo) await cargarVotosActivos();

    const carta = cartasDe(st.ronda).find((c) => c.id === sel.cartaId);
    $('done-title').textContent = 'Elección registrada';
    $('done-text').textContent = `${display}, elegiste «${carta?.nombre ?? 'tu carta'}». El premio se enviará después de que cierre la ronda.`;
    $('modal-form-view').hidden = true;
    $('modal-done-view').hidden = false;
    render();
  } catch (err) {
    console.error(err);
    errorModal(
      err?.code === 'permission-denied'
        ? 'No se pudo registrar: la ronda pudo haber cerrado o este usuario ya participó.'
        : 'Ocurrió un error de conexión. Inténtalo de nuevo.'
    );
  } finally {
    state.enviando = false;
    $('btn-confirmar').disabled = false;
    $('btn-confirmar').textContent = 'Confirmar elección';
  }
}

/* ------------------------------------------------------------------ */
/*  Inicio                                                            */
/* ------------------------------------------------------------------ */
function fallo(err) {
  console.error(err);
  state.error = 'No se pudo cargar el evento. Revisa tu conexión e inténtalo de nuevo.';
  render();
}

function enlazarEventos() {
  $('cartas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (b && !b.disabled) abrirModal(b.dataset.pick);
  });
  $('retiradas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ver]');
    if (b) verHistorial(b.dataset.ver);
  });
  $('modal').addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) cerrarModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('modal').hidden) cerrarModal();
  });
  $('form-voto').addEventListener('submit', confirmar);
}

async function init() {
  makeEmbers();
  enlazarEventos();
  renderNormas(null);

  if (!configurado) {
    $('estado').textContent = 'Falta configurar Firebase en js/firebase-config.js.';
    return;
  }

  await syncServerTime();

  onSnapshot(
    doc(db, 'config', 'evento'),
    (snap) => {
      state.error = null;
      state.evento = snap.exists() ? snap.data() : null;
      state.listo.evento = true;
      syncVotos();
      render();
    },
    fallo
  );

  onSnapshot(
    collection(db, 'rondas'),
    (snap) => {
      state.rondas = {};
      snap.forEach((d) => { state.rondas[d.id] = { id: d.id, ...d.data() }; });
      state.listo.rondas = true;
      render();
    },
    fallo
  );
}

init();
