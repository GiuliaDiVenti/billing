// Google Drive + Calendar, direttamente dal browser (nessun server nostro).
// Permessi minimi:
//  - drive.file       → l'app vede SOLO i file e le cartelle che ha creato lei
//  - calendar.events  → crea/modifica/cancella solo eventi (non legge altro)
// Il token d'accesso vive solo in memoria e scade dopo circa un'ora.

const SCOPE_DRIVE = 'https://www.googleapis.com/auth/drive.file';
const SCOPE_CAL = 'https://www.googleapis.com/auth/calendar.events';
const STORE = 'fatture.google';
const FOLDER_CACHE = 'fatture.folders';

let clientId = '';
let tokenClient = null;
let token = null;
let tokenExp = 0;
let pending = null;
let inflight = null;

const load = (k, fb) => {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? fb;
  } catch {
    return fb;
  }
};

/* ---------- stato collegamento ---------- */
export const state = () => load(STORE, { connected: false });
const saveState = (s) => localStorage.setItem(STORE, JSON.stringify(s));
export const isConnected = () => state().connected === true;
export const canDrive = () => isConnected() && state().drive === true;
export const canCalendar = () => isConnected() && state().cal === true;
export const hasClientId = () => !!clientId;

export function setClientId(id) {
  const next = (id || '').trim();
  if (next === clientId) return;
  clientId = next;
  tokenClient = null;
  token = null;
  tokenExp = 0;
  saveState({ connected: false });
}

/* ---------- autenticazione ---------- */
function ensureClient() {
  if (tokenClient) return tokenClient;
  if (!clientId) throw new Error('Manca il Client ID di Google: vedi Impostazioni → Avanzate.');
  const oauth = window.google?.accounts?.oauth2;
  if (!oauth) throw new Error('Google non è raggiungibile (sei offline?).');
  tokenClient = oauth.initTokenClient({
    client_id: clientId,
    scope: `${SCOPE_DRIVE} ${SCOPE_CAL}`,
    callback: (resp) => {
      const p = pending;
      pending = null;
      if (!p) return;
      if (resp.error) {
        p.reject(new Error(resp.error_description || resp.error));
        return;
      }
      token = resp.access_token;
      tokenExp = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
      saveState({
        connected: true,
        drive: oauth.hasGrantedAllScopes(resp, SCOPE_DRIVE),
        cal: oauth.hasGrantedAllScopes(resp, SCOPE_CAL),
      });
      p.resolve(token);
    },
    error_callback: (err) => {
      const p = pending;
      pending = null;
      if (!p) return;
      const msg =
        err?.type === 'popup_closed'
          ? 'Accesso annullato.'
          : err?.type === 'popup_failed_to_open'
          ? 'Il browser ha bloccato la finestra di accesso a Google.'
          : 'Accesso a Google non riuscito.';
      p.reject(new Error(msg));
    },
  });
  return tokenClient;
}

/** Va chiamata subito dopo un tocco dell'utente (altrimenti il browser blocca il popup). */
export function getToken() {
  if (token && Date.now() < tokenExp - 60000) return Promise.resolve(token);
  if (inflight) return inflight;
  inflight = new Promise((resolve, reject) => {
    try {
      const c = ensureClient();
      pending = { resolve, reject };
      c.requestAccessToken({ prompt: isConnected() ? '' : 'consent' });
    } catch (e) {
      reject(e);
    }
  }).finally(() => {
    inflight = null;
  });
  return inflight;
}

export function disconnect() {
  const t = token;
  token = null;
  tokenExp = 0;
  saveState({ connected: false });
  localStorage.removeItem(FOLDER_CACHE);
  if (t && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(t, () => {});
}

/* ---------- chiamate REST ---------- */
async function gfetch(url, opts = {}, retry = true) {
  const t = await getToken();
  const res = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${t}` } });
  if (res.status === 401 && retry) {
    token = null;
    tokenExp = 0;
    return gfetch(url, opts, false);
  }
  if (!res.ok) {
    const err = new Error(`Google ha risposto ${res.status}`);
    err.status = res.status;
    err.body = await res.text().catch(() => '');
    throw err;
  }
  return res;
}

/* ---------- Drive ---------- */
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const folderCache = () => load(FOLDER_CACHE, {});
const clearFolderCache = () => localStorage.removeItem(FOLDER_CACHE);

async function folder(name, parentId) {
  const key = `${parentId || 'root'}/${name}`;
  const cache = folderCache();
  if (cache[key]) return cache[key];

  const q =
    `name='${esc(name)}' and mimeType='application/vnd.google-apps.folder' and trashed=false and ` +
    `'${parentId || 'root'}' in parents`;
  const found = await (
    await gfetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`)
  ).json();
  let id = found.files?.[0]?.id;
  if (!id) {
    const created = await (
      await gfetch('https://www.googleapis.com/drive/v3/files?fields=id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          mimeType: 'application/vnd.google-apps.folder',
          ...(parentId ? { parents: [parentId] } : {}),
        }),
      })
    ).json();
    id = created.id;
  }
  cache[key] = id;
  localStorage.setItem(FOLDER_CACHE, JSON.stringify(cache));
  return id;
}

/** Carica un PDF in Fatture/<anno>/<categoria>/ e restituisce { id, webViewLink }. */
export async function uploadPdf(blob, name, path) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      let parent = null;
      for (const seg of path) parent = await folder(seg, parent);
      const boundary = `fatt${Math.random().toString(36).slice(2)}`;
      const meta = { name, parents: [parent], mimeType: 'application/pdf' };
      const body = new Blob([
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
        `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
        blob,
        `\r\n--${boundary}--`,
      ]);
      const res = await gfetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
        { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body }
      );
      return await res.json();
    } catch (e) {
      // cartella cancellata a mano su Drive: svuota la cache e riprova una volta
      if (e.status === 404 && attempt === 0) {
        clearFolderCache();
        continue;
      }
      throw e;
    }
  }
}

/* ---------- Calendar ---------- */
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Zurich';

function eventBody({ title, description, date }) {
  return {
    summary: title,
    description,
    start: { dateTime: `${date}T09:00:00`, timeZone: tz() },
    end: { dateTime: `${date}T09:30:00`, timeZone: tz() },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 7 * 24 * 60 },
        { method: 'popup', minutes: 3 * 24 * 60 },
        { method: 'popup', minutes: 24 * 60 },
        { method: 'popup', minutes: 0 },
      ],
    },
  };
}

export async function createEvent(ev) {
  const res = await gfetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(eventBody(ev)),
  });
  return (await res.json()).id;
}

export async function updateEvent(id, ev) {
  await gfetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(eventBody(ev)),
  });
}

export async function deleteEvent(id) {
  try {
    await gfetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  } catch (e) {
    if (e.status !== 404 && e.status !== 410) throw e; // già cancellato: ok
  }
}
