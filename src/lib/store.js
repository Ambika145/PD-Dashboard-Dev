import { createStore, get, set, del, entries } from 'idb-keyval';
import { DEFAULT_EXCLUDED, DEFAULT_MANAGED, DEFAULT_KNOWN_STAGES } from './junkCore.js';
import { SEED_WEEKS, SEED_VERSION } from './seed.js';
import { migrateLegacyClient, weekKey } from './clients.js';
import { ensureUsers } from './access.js';

export const defaultSettings = () => ({
  excluded: [...DEFAULT_EXCLUDED],
  managed: [...DEFAULT_MANAGED],
  knownStages: [...DEFAULT_KNOWN_STAGES],
  threshold: 50,
  /** Untouched stage share alert — highlight in red at or above this % (default 30). */
  untouchedThreshold: 30,
  activeClientId: null,
});

let db = null;
let memory = null; // fallback when IndexedDB is blocked (private window etc.)

function store() {
  if (!db) db = createStore('pd-junk-analysis', 'kv');
  return db;
}

/** Ensure at least the legacy workspace client exists; stamp untagged weeks. */
function ensureClients(settings, weeks, existingClients) {
  let clients = Array.isArray(existingClients) ? [...existingClients] : [];
  let activeClientId = settings.activeClientId || null;
  let weeksOut = weeks;
  let changed = false;

  if (clients.length === 0) {
    const legacy = migrateLegacyClient(settings);
    clients = [legacy];
    activeClientId = legacy.id;
    weeksOut = weeks.map((w) => (w.clientId ? w : { ...w, clientId: legacy.id }));
    changed = true;
  } else if (!activeClientId || !clients.some((c) => c.id === activeClientId)) {
    activeClientId = clients.find((c) => c.status !== 'inactive')?.id || clients[0].id;
    changed = true;
  }

  const legacyId = clients.find((c) => c.id === 'client_jgu_legacy')?.id;
  if (legacyId) {
    const stamped = weeksOut.map((w) => (w.clientId ? w : { ...w, clientId: legacyId }));
    if (stamped.some((w, i) => w !== weeksOut[i])) {
      weeksOut = stamped;
      changed = true;
    }
  }

  return {
    clients,
    settings: { ...settings, activeClientId, threshold: clients.find((c) => c.id === activeClientId)?.junkPct ?? settings.threshold },
    weeks: weeksOut,
    changed,
  };
}

export async function loadAll() {
  try {
    const s = store();
    // A newer seed replaces the earlier imported weeks; approved weeks are never touched.
    const seeded = await get('seeded', s);
    if (seeded !== SEED_VERSION) {
      for (const [k, w] of await entries(s)) {
        if (String(k).startsWith('week:') && w.source === 'imported') await del(k, s);
      }
      for (const w of SEED_WEEKS) {
        const cur = await get(`week:${w.id}`, s);
        if (!cur || cur.source !== 'approved') await set(`week:${w.id}`, w, s);
      }
      const saved = await get('settings', s);
      if (saved) {
        const add = (list, extra) => [...list, ...extra.filter((x) => !list.includes(x))];
        await set('settings', { ...saved, managed: add(saved.managed || [], DEFAULT_MANAGED), knownStages: add(saved.knownStages || [], DEFAULT_KNOWN_STAGES) }, s);
      }
      await set('seeded', SEED_VERSION, s);
    }
    let settings = { ...defaultSettings(), ...((await get('settings', s)) || {}) };
    let weeks = (await entries(s)).filter(([k]) => String(k).startsWith('week:')).map(([, v]) => v);
    let clients = (await get('clients', s)) || [];
    let users = ensureUsers(await get('users', s));
    let assignments = (await get('assignments', s)) || [];
    const ensured = ensureClients(settings, weeks, clients);
    settings = ensured.settings;
    weeks = ensured.weeks;
    clients = ensured.clients;
    if (ensured.changed) {
      await set('settings', settings, s);
      await set('clients', clients, s);
      for (const w of weeks) {
        if (w.clientId) await set(`week:${weekKey(w)}`, w, s);
      }
    }
    await set('users', users, s);
    if (!(await get('assignments', s))) await set('assignments', assignments, s);
    return { settings, weeks, clients, users, assignments, persistent: true };
  } catch (e) {
    const settings = defaultSettings();
    const ensured = ensureClients(settings, [...SEED_WEEKS], []);
    memory = memory || {
      settings: ensured.settings,
      weeks: ensured.weeks,
      clients: ensured.clients,
      users: ensureUsers(null),
      assignments: [],
    };
    return { ...memory, persistent: false };
  }
}

export async function saveSettings(settings) {
  if (memory) { memory.settings = settings; return; }
  await set('settings', settings, store());
}

export async function saveClients(clients) {
  if (memory) { memory.clients = clients; return; }
  await set('clients', clients, store());
}

export async function saveUsers(users) {
  if (memory) { memory.users = users; return; }
  await set('users', users, store());
}

export async function saveAssignments(assignments) {
  if (memory) { memory.assignments = assignments; return; }
  await set('assignments', assignments, store());
}

export async function saveWeek(week) {
  if (memory) { memory.weeks = [...memory.weeks.filter((w) => weekKey(w) !== weekKey(week)), week]; return; }
  await set(`week:${weekKey(week)}`, week, store());
}

/** Deletes one client's saved week (identity = client + start date). */
export async function deleteWeek(week) {
  if (memory) { memory.weeks = memory.weeks.filter((w) => weekKey(w) !== weekKey(week)); return; }
  await del(`week:${weekKey(week)}`, store());
}

export const FILE_TAG = 'jgu-junk-analysis-history';

export function historyFile(settings, weeks, clients = []) {
  return JSON.stringify({
    app: FILE_TAG,
    version: 2,
    exportedAt: new Date().toISOString(),
    settings,
    weeks,
    clients,
  });
}

/** Merges a shared history file: an approved week always beats an imported
 *  one; between two approved weeks the later approval wins. */
export function mergeHistory(current, incoming) {
  // Same week for two clients is two weeks: match on client + start date.
  const byId = new Map(current.map((w) => [weekKey(w), w]));
  let added = 0;
  let replaced = 0;
  let kept = 0;
  for (const w of incoming) {
    const cur = byId.get(weekKey(w));
    if (!cur) { byId.set(weekKey(w), w); added++; continue; }
    const better =
      (cur.source === 'imported' && w.source === 'approved') ||
      (cur.source === w.source && w.source === 'approved' && (w.approvedAt || '') > (cur.approvedAt || ''));
    if (better) { byId.set(weekKey(w), w); replaced++; } else kept++;
  }
  return { weeks: [...byId.values()], added, replaced, kept };
}

/** Merge client lists by id; incoming updates win on matching id. */
export function mergeClients(current = [], incoming = []) {
  const byId = new Map(current.map((c) => [c.id, c]));
  let added = 0;
  let updated = 0;
  for (const c of incoming) {
    if (!c?.id) continue;
    if (byId.has(c.id)) { byId.set(c.id, { ...byId.get(c.id), ...c }); updated++; }
    else { byId.set(c.id, c); added++; }
  }
  return { clients: [...byId.values()], added, updated };
}
