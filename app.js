import { db } from './db.js';
import { buildPdf } from './pdf.js';
import { prepareImage } from './scan.js';
import * as G from './google.js';

/* =====================================================================
   Costanti e utilità
   ===================================================================== */
const CATEGORIES = [
  'Cassa malati',
  'Assicurazioni',
  'Cantone e imposte',
  'Casa e affitto',
  'Energia e acqua',
  'Telefono e internet',
  'Medico e salute',
  'Altro',
];
const MAX_PAGES = 20;

const $ = (sel, root = document) => root.querySelector(sel);
const parseJSON = (s, fb) => {
  try {
    return JSON.parse(s) ?? fb;
  } catch {
    return fb;
  }
};
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

const ICONS = {
  camera: '<path d="M4 8h3l2-2h6l2 2h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M4 18l5-5 4 4 3-3 4 4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 8.7 4.7 4.7 0 0 1 17.5 18z"/>',
  file: '<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/>',
  link: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.5-4M4 5v4h4M4 13a8 8 0 0 0 14.5 4M20 19v-4h-4"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
};
function icon(name) {
  const t = document.createElement('template');
  t.innerHTML = `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
  return t.content.firstChild;
}

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

let toastTimer;
function toast(msg, ms = 4200) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

/* ---------- formati ---------- */
const chf = new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' });
const fmtAmount = (n) => (n == null || n === '' ? '—' : chf.format(n));
const dateFmt = new Intl.DateTimeFormat('it-CH', { day: 'numeric', month: 'short', year: 'numeric' });
const parseDay = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const fmtDay = (s) => (s ? dateFmt.format(parseDay(s)) : '—');
const daysUntil = (s) => {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.round((parseDay(s) - t) / 864e5);
};
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const parseAmount = (s) => {
  const n = parseFloat(String(s ?? '').replace(/[’'\s]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};
const plural = (n, one, many) => (n === 1 ? one : many);

function pillFor(d) {
  if (d.status === 'paid') return { cls: 'paid', text: 'Pagata' };
  if (!d.due) return { cls: '', text: 'Senza scadenza' };
  const n = daysUntil(d.due);
  if (n < 0) return { cls: 'late', text: `Scaduta da ${-n} ${plural(-n, 'giorno', 'giorni')}` };
  if (n === 0) return { cls: 'late', text: 'Scade oggi' };
  if (n === 1) return { cls: 'soon', text: 'Scade domani' };
  if (n <= 7) return { cls: 'soon', text: `Tra ${n} giorni` };
  return { cls: '', text: `Entro il ${dateFmt.format(parseDay(d.due))}` };
}

/* =====================================================================
   Stato
   ===================================================================== */
let docs = [];
let tab = 'open';
let query = '';

const settings = {
  autoDrive: true,
  autoCal: true,
  clientId: '',
  tipDismissed: false,
  ...parseJSON(localStorage.getItem('fatture.settings'), {}),
};
const saveSettings = () => localStorage.setItem('fatture.settings', JSON.stringify(settings));
G.setClientId(settings.clientId || window.FATTURE_CONFIG?.clientId || '');

const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

/** Quali operazioni Google mancano per questa fattura? */
const needsDrive = (d) => settings.autoDrive && G.canDrive() && !d.driveId;
const needsCal = (d) =>
  settings.autoCal && G.canCalendar() && d.status === 'open' && d.due && !d.eventId && daysUntil(d.due) >= 0;
const needsSync = (d) => needsDrive(d) || needsCal(d);

async function reload() {
  docs = await db.all();
  render();
}

function friendly(e) {
  const body = e?.body || '';
  if (/accessNotConfigured|SERVICE_DISABLED|has not been used/i.test(body))
    return 'Drive o Calendar non sono abilitati nel progetto Google (vedi guida, punto 2).';
  if (e?.status === 401 || e?.status === 403) return 'Google ha negato il permesso: ricollega l’account dalle Impostazioni.';
  if (!navigator.onLine) return 'Sei offline: riprova quando c’è rete.';
  return e?.message || 'Errore sconosciuto.';
}

/* =====================================================================
   Sincronizzazione Google
   ===================================================================== */
const eventInfo = (d) => ({
  title: `Paga fattura: ${d.supplier}${d.amount != null ? ` — ${fmtAmount(d.amount).replace(/ /g, ' ')}` : ''}`,
  description: [d.category, d.notes, d.driveLink && `Fattura su Drive: ${d.driveLink}`].filter(Boolean).join('\n'),
  date: d.due,
});

const fileName = (d) => {
  const clean = (s) => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = [d.due || todayStr(), clean(d.category), clean(d.supplier)];
  if (d.amount != null) parts.push(d.amount.toFixed(2));
  return `${parts.join(' - ')}.pdf`;
};

/** Invia a Drive / crea il promemoria per una fattura. Lancia se qualcosa fallisce. */
async function syncDoc(id) {
  const d = await db.get(id);
  if (!d) return;
  try {
    if (needsDrive(d)) {
      const blob = await db.getFile(id);
      if (!blob) throw new Error('File PDF non trovato sul telefono.');
      const year = (d.due || d.createdAt).slice(0, 4);
      const r = await G.uploadPdf(blob, fileName(d), ['Fatture', year, d.category]);
      d.driveId = r.id;
      d.driveLink = r.webViewLink || '';
      await db.put(d);
    }
    if (needsCal(d)) {
      d.eventId = await G.createEvent(eventInfo(d));
      await db.put(d);
    }
    if (d.syncError) {
      d.syncError = '';
      await db.put(d);
    }
  } catch (e) {
    d.syncError = friendly(e);
    await db.put(d);
    throw e;
  }
}

async function syncAll() {
  const todo = docs.filter(needsSync);
  if (!todo.length) return;
  try {
    await G.getToken();
  } catch (e) {
    toast(friendly(e));
    return;
  }
  let ok = 0;
  let ko = 0;
  let lastErr = '';
  for (const d of todo) {
    try {
      await syncDoc(d.id);
      ok++;
    } catch (e) {
      ko++;
      lastErr = friendly(e);
    }
  }
  await reload();
  toast(ko ? `${ok} inviate, ${ko} no. ${lastErr}` : `${ok} ${plural(ok, 'fattura inviata', 'fatture inviate')} a Google ✓`);
}

/* =====================================================================
   Schermata principale
   ===================================================================== */
function render() {
  renderStatus();
  renderSummary();
  renderTabs();
  renderList();
}

function renderStatus() {
  const b = $('#sync-status');
  const on = G.isConnected();
  b.classList.toggle('on', on);
  b.textContent = on ? 'Collegato a Google · copia sul tuo Drive' : 'Solo su questo telefono · collega Google';
}

function renderSummary() {
  const box = $('#summary');
  const open = docs.filter((d) => d.status === 'open');
  const total = open.reduce((s, d) => s + (d.amount || 0), 0);
  const overdue = open.filter((d) => d.due && daysUntil(d.due) < 0);
  const next = open.filter((d) => d.due && daysUntil(d.due) >= 0).sort((a, b) => a.due.localeCompare(b.due))[0];
  const toSend = docs.filter(needsSync).length;

  const sub = open.length
    ? `${open.length} ${plural(open.length, 'fattura', 'fatture')}${next ? ` · prossima: ${next.supplier}, ${fmtDay(next.due)}` : ''}`
    : 'Nessuna fattura da pagare';

  box.replaceChildren(...[
    h('div', { class: 'hero' },
      h('span', { class: 'hero-lbl', text: 'Da pagare' }),
      h('span', { class: 'hero-amt', text: fmtAmount(total) }),
      h('span', { class: 'hero-sub', text: sub })
    ),
    overdue.length &&
      h('button', { class: 'alert danger', type: 'button', onclick: () => { tab = 'open'; render(); } },
        icon('alert'),
        h('span', { class: 'grow', text: `${overdue.length} ${plural(overdue.length, 'fattura scaduta', 'fatture scadute')}: pagala subito` })
      ),
    toSend > 0 &&
      h('button', { class: 'alert warn', type: 'button', onclick: syncAll },
        icon('sync'),
        h('span', { class: 'grow', text: `${toSend} da inviare a Google: tocca per inviare` })
      ),
    !isStandalone() && !settings.tipDismissed && docs.length > 0 &&
      h('div', { class: 'alert tip' },
        h('span', { class: 'grow', text: 'Aggiungi l’app alla schermata Home dal menù del browser: così i dati restano al sicuro sul telefono.' }),
        h('button', { class: 'x', type: 'button', 'aria-label': 'Chiudi suggerimento', onclick: () => { settings.tipDismissed = true; saveSettings(); render(); } }, icon('close'))
      )
  ].filter(Boolean));
}

function renderTabs() {
  const counts = {
    open: docs.filter((d) => d.status === 'open').length,
    paid: docs.filter((d) => d.status === 'paid').length,
    all: docs.length,
  };
  const labels = { open: 'Da pagare', paid: 'Pagate', all: 'Tutte' };
  $('#tabs').replaceChildren(
    ...Object.keys(labels).map((k) =>
      h('button', {
        class: 'tab', type: 'button', role: 'tab', 'aria-selected': String(tab === k),
        text: `${labels[k]}${counts[k] ? ` (${counts[k]})` : ''}`,
        onclick: () => { tab = k; render(); },
      })
    )
  );
  $('#search-wrap').classList.toggle('hidden', docs.length < 4);
}

function visibleDocs() {
  let l = [...docs];
  if (tab === 'open') l = l.filter((d) => d.status === 'open').sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
  else if (tab === 'paid') l = l.filter((d) => d.status === 'paid').sort((a, b) => (b.paidAt || '').localeCompare(a.paidAt || ''));
  else l.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (query) {
    const q = query.toLowerCase();
    l = l.filter((d) => [d.supplier, d.category, d.notes].join(' ').toLowerCase().includes(q));
  }
  return l;
}

function thumbEl(d, cls = 'thumb') {
  return d.thumb ? h('img', { class: cls, src: d.thumb, alt: '' }) : h('span', { class: cls }, icon('file'));
}

function docItem(d) {
  const pill = pillFor(d);
  let cloud = null;
  if (d.driveId) cloud = h('span', { class: 'ok', title: 'Salvata su Drive' }, icon('cloud'));
  else if (needsDrive(d)) cloud = h('span', { class: 'warn', title: 'Da inviare a Drive' }, icon('cloud'));
  return h('li', {},
    h('button', { class: 'doc', type: 'button', onclick: () => openDetail(d.id) },
      thumbEl(d),
      h('span', { class: 'doc-main' },
        h('span', { class: 'doc-title', text: d.supplier }),
        h('span', { class: 'doc-sub' }, d.category, cloud)
      ),
      h('span', { class: 'doc-side' },
        h('span', { class: 'doc-amount', text: fmtAmount(d.amount) }),
        h('span', { class: `pill ${pill.cls}`, text: pill.text })
      )
    )
  );
}

function renderList() {
  const l = visibleDocs();
  $('#list').replaceChildren(...l.map(docItem));
  const empty = $('#empty');
  empty.classList.toggle('hidden', l.length > 0);
  if (!l.length) {
    let t = 'Nessuna fattura qui';
    let s = 'Tocca “Scansiona fattura” per aggiungere la prima.';
    if (query) { t = 'Nessun risultato'; s = 'Prova con un’altra parola.'; }
    else if (docs.length && tab === 'open') { t = 'Tutto pagato 🎉'; s = 'Non hai fatture in sospeso.'; }
    else if (docs.length && tab === 'paid') { t = 'Ancora nessuna pagata'; s = 'Le fatture che segni come pagate finiscono qui.'; }
    empty.replaceChildren(h('strong', { text: t }), s);
  }
}

/* =====================================================================
   Fogli (dialog)
   ===================================================================== */
function sheet(dlg, title, body, foot) {
  dlg.replaceChildren(...[
    h('div', { class: 'sheet-head' },
      h('h2', { text: title }),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Chiudi', onclick: () => dlg.close() }, icon('close'))
    ),
    h('div', { class: 'sheet-body' }, body),
    foot && h('div', { class: 'sheet-foot' }, foot),
  ].filter(Boolean));
  if (!dlg.dataset.bound) {
    dlg.dataset.bound = '1';
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  }
  if (!dlg.open) dlg.showModal();
}

/* ---------- modulo dati (nuova fattura e modifica) ---------- */
function buildForm(init = {}, { showStatus = true, id = 'doc-form' } = {}) {
  const startStatus = init.status || 'open';
  const supplier = h('input', { type: 'text', name: 'supplier', required: true, maxlength: 80, autocomplete: 'off', placeholder: 'es. Helsana, Cantone Ticino', value: init.supplier || '' });
  const category = h('select', { name: 'category' },
    CATEGORIES.map((c) => h('option', { value: c, selected: c === (init.category || CATEGORIES[0]) ? true : null, text: c }))
  );
  const amount = h('input', { type: 'text', name: 'amount', inputmode: 'decimal', autocomplete: 'off', placeholder: '0.00', value: init.amount != null ? Number(init.amount).toFixed(2) : '' });
  const due = h('input', { type: 'date', name: 'due', value: init.due || '' });
  const notes = h('textarea', { name: 'notes', rows: 2, maxlength: 300, placeholder: 'Numero fattura, riferimento…' }, init.notes || '');
  const dueHint = h('span', { class: 'hint' });

  const radios = [['open', 'Da pagare'], ['paid', 'Già pagata']].map(([v, label]) =>
    h('label', {}, h('input', { type: 'radio', name: 'status', value: v, checked: v === startStatus ? true : null }), h('span', { text: label }))
  );

  const form = h('form', { class: 'form', id, novalidate: false },
    showStatus && h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Stato' }, radios),
    h('label', { class: 'field' }, h('span', { class: 'lbl', text: 'Fornitore' }), supplier),
    h('label', { class: 'field' }, h('span', { class: 'lbl', text: 'Categoria (cartella su Drive)' }), category),
    h('div', { class: 'row2' },
      h('label', { class: 'field' }, h('span', { class: 'lbl', text: 'Importo (CHF)' }), amount),
      h('label', { class: 'field' }, h('span', { class: 'lbl', text: 'Scadenza' }), due)
    ),
    dueHint,
    h('label', { class: 'field' }, h('span', { class: 'lbl', text: 'Note (facoltative)' }), notes)
  );

  const status = () => (showStatus ? form.elements.status.value : startStatus);
  const applyStatus = () => {
    const open = status() === 'open';
    due.required = open;
    dueHint.textContent = open
      ? 'Ti ricordo la scadenza su Google Calendar: 7, 3 e 1 giorno prima, e il giorno stesso.'
      : 'Per le fatture già pagate scadenza e importo sono facoltativi.';
  };
  form.addEventListener('change', applyStatus);
  amount.addEventListener('input', () => amount.setCustomValidity(''));
  applyStatus();

  return {
    el: form,
    validate() {
      const a = parseAmount(amount.value);
      amount.setCustomValidity('');
      if (amount.value.trim() && a == null) amount.setCustomValidity('Importo non valido');
      else if (status() === 'open' && (a == null || a <= 0)) amount.setCustomValidity('Inserisci l’importo da pagare');
      return form.reportValidity();
    },
    read() {
      const fd = new FormData(form);
      return {
        supplier: String(fd.get('supplier')).trim(),
        category: String(fd.get('category')),
        amount: parseAmount(fd.get('amount')),
        due: String(fd.get('due') || ''),
        notes: String(fd.get('notes') || '').trim(),
        status: status(),
      };
    },
  };
}

/* ---------- nuova fattura ---------- */
function openNew() {
  const dlg = $('#dlg-new');
  const draft = { photos: [], pdf: null, busy: false };
  const form = buildForm({}, { showStatus: true, id: 'new-form' });

  const strip = h('div', { class: 'strip' });
  const meta = h('div', { class: 'scan-meta' });
  const box = h('div', { class: 'scan-box' });
  const scanWrap = h('div', {});
  const saveBtn = h('button', { class: 'btn primary', type: 'submit', form: 'new-form' }, icon('check'), 'Salva');

  const inCam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'hidden' });
  const inGal = h('input', { type: 'file', accept: 'image/*,application/pdf', multiple: true, class: 'hidden' });

  const camBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => inCam.click() }, icon('camera'), 'Scatta foto');
  const galBtn = h('button', { class: 'btn', type: 'button', onclick: () => inGal.click() }, icon('image'), 'Galleria / PDF');
  const actions = h('div', { class: 'scan-actions' }, camBtn, galBtn);

  function refresh() {
    const has = draft.photos.length || draft.pdf;
    strip.replaceChildren(...[
      ...draft.photos.map((p, i) =>
        h('div', { class: 'page' },
          h('img', { src: p.thumb, alt: `Pagina ${i + 1}` }),
          h('span', { class: 'num', text: i + 1 }),
          h('button', { class: 'rm', type: 'button', 'aria-label': `Rimuovi pagina ${i + 1}`, onclick: () => { draft.photos.splice(i, 1); refresh(); } }, icon('close'))
        )
      ),
      draft.pdf &&
        h('div', { class: 'page pdf' },
          icon('file'),
          h('span', { text: draft.pdf.name }),
          h('button', { class: 'rm', type: 'button', 'aria-label': 'Rimuovi PDF', onclick: () => { draft.pdf = null; refresh(); } }, icon('close'))
        )
    ].filter(Boolean));
    const bytes = draft.photos.reduce((s, p) => s + p.bytes.length, 0) || draft.pdf?.size || 0;
    meta.textContent = has
      ? draft.pdf
        ? `PDF · ${(bytes / 1048576).toFixed(1)} MB`
        : `${draft.photos.length} ${plural(draft.photos.length, 'pagina', 'pagine')} · circa ${(bytes / 1048576).toFixed(1)} MB`
      : '';
    camBtn.lastChild.textContent = draft.photos.length ? 'Altra pagina' : 'Scatta foto';
    box.classList.toggle('hidden', !!has);
    strip.classList.toggle('hidden', !has);
    meta.classList.toggle('hidden', !has);
    galBtn.disabled = camBtn.disabled = draft.busy || draft.photos.length >= MAX_PAGES;
    saveBtn.disabled = draft.busy;
  }

  async function addFiles(files) {
    if (!files.length) return;
    draft.busy = true;
    refresh();
    toast('Elaboro…', 60000);
    try {
      for (const f of files) {
        if (f.type === 'application/pdf') {
          if (draft.photos.length || files.length > 1) toast('Un PDF alla volta e senza foto: aggiungi prima il PDF.');
          else draft.pdf = f;
          continue;
        }
        if (draft.pdf) { toast('C’è già un PDF: toglilo per aggiungere foto.'); break; }
        if (draft.photos.length >= MAX_PAGES) { toast(`Massimo ${MAX_PAGES} pagine.`); break; }
        draft.photos.push(await prepareImage(f));
      }
      toast('Pronto ✓', 1200);
    } catch (e) {
      toast(e.message);
    } finally {
      draft.busy = false;
      refresh();
    }
  }
  inCam.addEventListener('change', () => { addFiles([...inCam.files]); inCam.value = ''; });
  inGal.addEventListener('change', () => { addFiles([...inGal.files]); inGal.value = ''; });

  box.append(
    icon('camera'),
    h('div', {}, h('strong', { text: 'Fotografa la fattura' }), h('br'), 'Inquadra il foglio con buona luce. Per più pagine, aggiungile una alla volta.')
  );
  scanWrap.append(box, strip, meta, actions);

  form.el.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (draft.busy) return;
    if (!draft.photos.length && !draft.pdf) { toast('Aggiungi prima almeno una foto o un PDF.'); return; }
    if (!form.validate()) return;

    const v = form.read();
    // Il token Google va chiesto subito, mentre il tocco è "fresco" (altrimenti il browser blocca il popup).
    const wantGoogle = G.isConnected() && (settings.autoDrive || (settings.autoCal && v.status === 'open'));
    const tokenP = wantGoogle ? G.getToken().catch(() => null) : null;

    saveBtn.disabled = true;
    try {
      const blob = draft.pdf
        ? draft.pdf
        : new Blob([buildPdf(draft.photos.map((p) => ({ jpeg: p.bytes, w: p.w, h: p.h })))], { type: 'application/pdf' });
      const doc = {
        id: newId(),
        ...v,
        createdAt: new Date().toISOString(),
        paidAt: v.status === 'paid' ? new Date().toISOString() : '',
        pages: draft.photos.length || 1,
        thumb: draft.photos[0]?.thumb || '',
        driveId: '', driveLink: '', eventId: '', syncError: '',
      };
      await db.save(doc, blob);
      navigator.storage?.persist?.().catch(() => {});
      dlg.close();
      tab = v.status === 'paid' ? 'paid' : 'open';
      await reload();
      toast('Salvata sul telefono ✓');
      if (tokenP && (await tokenP)) {
        toast('Invio a Google…', 60000);
        try {
          await syncDoc(doc.id);
          await reload();
          toast('Salvata anche su Google ✓');
        } catch (e) {
          await reload();
          toast(`Salvata sul telefono, ma non inviata: ${friendly(e)}`, 7000);
        }
      } else if (wantGoogle) {
        await reload();
        toast('Salvata sul telefono. L’invio a Google non è partito: riprova dal banner arancione.', 7000);
      }
    } catch (e) {
      saveBtn.disabled = false;
      toast(`Non sono riuscito a salvare: ${e.message}`, 7000);
    }
  });

  sheet(dlg, 'Nuova fattura', [scanWrap, form.el, inCam, inGal], [saveBtn]);
  refresh();
}

/* ---------- dettaglio / modifica ---------- */
async function openPdf(id) {
  const blob = await db.getFile(id);
  if (!blob) { toast('File non trovato sul telefono.'); return; }
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) {
    const a = h('a', { href: url, download: 'fattura.pdf' });
    document.body.append(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
}

async function setPaid(d, paid) {
  const tokenP = d.eventId && G.isConnected() ? G.getToken().catch(() => null) : null;
  const nd = { ...d, status: paid ? 'paid' : 'open', paidAt: paid ? new Date().toISOString() : '' };
  let note = '';
  if (paid && d.eventId) {
    try {
      if (!(await tokenP)) throw new Error('nessun accesso');
      await G.deleteEvent(d.eventId);
      nd.eventId = '';
    } catch {
      nd.eventId = '';
      note = ' Il promemoria su Calendar va tolto a mano.';
    }
  }
  await db.put(nd);
  $('#dlg-detail').close();
  await reload();
  toast(paid ? `Segnata come pagata ✓${note}` : 'Fattura riaperta.');
  if (!paid && needsCal(nd)) toast('Fattura riaperta. Tocca il banner arancione per rimettere il promemoria.');
}

async function openDetail(id) {
  const d = docs.find((x) => x.id === id);
  if (!d) return;
  const dlg = $('#dlg-detail');
  const form = buildForm(d, { showStatus: false, id: 'detail-form' });
  const pill = pillFor(d);

  const saveBtn = h('button', { class: 'btn ghost hidden', type: 'submit', form: 'detail-form' }, 'Salva modifiche');
  form.el.addEventListener('input', () => saveBtn.classList.remove('hidden'));
  form.el.addEventListener('change', () => saveBtn.classList.remove('hidden'));

  form.el.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!form.validate()) return;
    const v = form.read();
    const nd = { ...d, ...v, status: d.status };
    const tokenP = nd.eventId && G.isConnected() ? G.getToken().catch(() => null) : null;
    await db.put(nd);
    let msg = 'Modifiche salvate ✓';
    if (nd.eventId && nd.due) {
      try {
        if (!(await tokenP)) throw new Error('nessun accesso');
        await G.updateEvent(nd.eventId, eventInfo(nd));
      } catch {
        msg = 'Modifiche salvate. Il promemoria su Calendar non è stato aggiornato.';
      }
    }
    dlg.close();
    await reload();
    toast(msg);
  });

  const actions = h('div', { class: 'actions' },
    h('button', { class: 'btn', type: 'button', onclick: () => openPdf(d.id) }, icon('file'), 'Apri PDF'),
    d.driveLink && h('a', { class: 'btn', href: d.driveLink, target: '_blank', rel: 'noopener noreferrer' }, icon('link'), 'Apri su Drive'),
    needsSync(d) &&
      h('button', { class: 'btn', type: 'button', onclick: async () => {
        try {
          await G.getToken();
          await syncDoc(d.id);
          dlg.close();
          await reload();
          toast('Inviata a Google ✓');
        } catch (e) {
          await reload();
          toast(friendly(e), 7000);
        }
      } }, icon('sync'), 'Invia a Google ora'),
    h('button', { class: 'btn danger', type: 'button', onclick: async () => {
      const extra = d.driveId ? ' La copia su Drive resta dov’è.' : ' Non c’è una copia su Drive: sparirà del tutto.';
      if (!confirm(`Eliminare la fattura “${d.supplier}” dal telefono?${extra}`)) return;
      const tokenP = d.eventId && G.isConnected() ? G.getToken().catch(() => null) : null;
      if (d.eventId) { try { if (await tokenP) await G.deleteEvent(d.eventId); } catch { /* promemoria da togliere a mano */ } }
      await db.del(d.id);
      dlg.close();
      await reload();
      toast('Fattura eliminata.');
    } }, icon('trash'), 'Elimina dal telefono')
  );

  sheet(
    dlg,
    d.supplier,
    [
      h('div', { class: 'preview' },
        thumbEl(d),
        h('div', { class: 'preview-info' },
          h('span', { class: 'big', text: fmtAmount(d.amount) }),
          h('span', { class: `pill ${pill.cls}`, text: pill.text }),
          h('span', { text: `Aggiunta il ${fmtDay(d.createdAt.slice(0, 10))}` }),
          d.paidAt && h('span', { text: `Pagata il ${fmtDay(d.paidAt.slice(0, 10))}` })
        )
      ),
      d.syncError && h('div', { class: 'err', text: `Ultimo invio a Google non riuscito: ${d.syncError}` }),
      form.el,
      actions,
    ],
    [
      saveBtn,
      h('button', { class: `btn ${d.status === 'open' ? 'primary' : ''}`, type: 'button', onclick: () => setPaid(d, d.status === 'open') },
        icon(d.status === 'open' ? 'check' : 'undo'),
        d.status === 'open' ? 'Segna come pagata' : 'Riapri')
    ]
  );
}

/* ---------- impostazioni ---------- */
function openSettings() {
  const dlg = $('#dlg-settings');
  const st = G.state();
  const connected = G.isConnected();

  const sw = (label, key, hintText) =>
    h('label', { class: 'switch' },
      h('span', {}, label, hintText && h('div', { class: 'hint', text: hintText })),
      h('input', { type: 'checkbox', checked: settings[key] ? true : null, onchange: (e) => { settings[key] = e.target.checked; saveSettings(); render(); } })
    );

  const clientInput = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: '123456-abc.apps.googleusercontent.com', value: settings.clientId || window.FATTURE_CONFIG?.clientId || '' });

  const connectBtn = connected
    ? h('button', { class: 'btn danger block', type: 'button', onclick: () => {
        if (!confirm('Scollegare Google? Le fatture già su Drive restano dove sono.')) return;
        G.disconnect();
        render();
        openSettings();
        toast('Google scollegato.');
      } }, 'Scollega Google')
    : h('button', { class: 'btn primary block', type: 'button', onclick: async () => {
        try {
          await G.getToken();
          render();
          openSettings();
          const s = G.state();
          toast(s.drive && s.cal ? 'Google collegato ✓' : 'Collegato, ma hai concesso solo alcuni permessi.', 6000);
          syncAll();
        } catch (e) {
          toast(friendly(e), 7000);
        }
      } }, 'Collega Google');

  const statusLine = connected
    ? `Collegato · Drive ${st.drive ? '✓' : '✗ (permesso negato)'} · Calendar ${st.cal ? '✓' : '✗ (permesso negato)'}`
    : G.hasClientId()
    ? 'Non collegato. Collegando Google, ogni fattura viene copiata nel tuo Drive e la scadenza finisce sul tuo Calendar.'
    : 'Prima di collegare Google serve il Client ID: aprilo in “Avanzate” qui sotto (vedi README).';

  sheet(dlg, 'Impostazioni', [
    h('div', { class: 'card' },
      h('h3', { text: 'Google' }),
      h('p', { class: 'muted', text: statusLine }),
      connectBtn,
      sw('Salva i PDF su Drive', 'autoDrive', 'Cartelle: Fatture / anno / categoria'),
      sw('Promemoria su Calendar', 'autoCal', 'Avvisi 7, 3 e 1 giorno prima, e il giorno stesso')
    ),
    h('div', { class: 'card' },
      h('h3', { text: 'Privacy' }),
      h('p', { class: 'muted', text: 'Non c’è nessun server: le fatture stanno sul telefono e nel tuo Drive. L’app vede solo i file che crea lei e non può leggere né pagare nulla. Per revocare ogni accesso: myaccount.google.com/permissions.' })
    ),
    h('details', { class: 'card' },
      h('summary', { text: 'Avanzate' }),
      h('label', { class: 'field' },
        h('span', { class: 'lbl', text: 'Client ID Google' }),
        clientInput,
        h('span', { class: 'hint', text: 'Non è un segreto. Cambiarlo scollega l’account.' })
      ),
      h('button', { class: 'btn block', type: 'button', onclick: () => {
        settings.clientId = clientInput.value.trim();
        saveSettings();
        G.setClientId(settings.clientId || window.FATTURE_CONFIG?.clientId || '');
        render();
        openSettings();
        toast('Client ID salvato.');
      } }, 'Salva Client ID')
    ),
  ]);
}

/* =====================================================================
   Avvio
   ===================================================================== */
$('#btn-settings').replaceChildren(icon('gear'));
$('#fab').replaceChildren(icon('camera'), 'Scansiona fattura');
$('#fab').addEventListener('click', openNew);
$('#btn-settings').addEventListener('click', openSettings);
$('#sync-status').addEventListener('click', openSettings);
$('#search').addEventListener('input', (e) => { query = e.target.value.trim(); renderList(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && docs.length) render(); });

(async function boot() {
  try {
    await reload();
  } catch (e) {
    render();
    toast(`Archivio locale non disponibile: ${e.message}`, 9000);
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
