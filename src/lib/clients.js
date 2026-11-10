/** Client records for multi-client junk analysis. Pure helpers — no UI. */

export const newClientId = () => `client_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/** Empty form defaults for Add Client. */
export const blankClient = () => ({
  name: '',
  websiteOrId: '',
  product: '',
  responsiblePerson: '',
  junkPct: 50,
  status: 'active',
});

/**
 * Normalise and validate a client payload.
 * Returns { ok, client?, error? }.
 */
export function normalizeClient(input, { id, createdAt } = {}) {
  const name = String(input.name || '').trim();
  const websiteOrId = String(input.websiteOrId || '').trim();
  const product = String(input.product || '').trim();
  const responsiblePerson = String(input.responsiblePerson || '').trim();
  let junkPct = Number(input.junkPct);
  if (!Number.isFinite(junkPct)) junkPct = 50;
  junkPct = Math.min(100, Math.max(0, junkPct));
  const status = input.status === 'inactive' ? 'inactive' : 'active';

  if (!name) return { ok: false, error: 'Client name is required.' };
  if (!websiteOrId) return { ok: false, error: 'Website / Client ID is required.' };

  const now = new Date().toISOString();
  return {
    ok: true,
    client: {
      id: id || input.id || newClientId(),
      name,
      websiteOrId,
      product,
      responsiblePerson,
      junkPct,
      status,
      createdAt: createdAt || input.createdAt || now,
      updatedAt: now,
    },
  };
}

/** One-time workspace client from existing threshold — preserves current JGU work. */
export function migrateLegacyClient(settings = {}) {
  const now = new Date().toISOString();
  return {
    id: 'client_jgu_legacy',
    name: 'JGU',
    websiteOrId: 'JGU Online',
    product: 'Online Ads — Junk Analysis',
    responsiblePerson: '',
    junkPct: Number.isFinite(Number(settings.threshold)) ? Number(settings.threshold) : 50,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
}

export const LEGACY_CLIENT_ID = 'client_jgu_legacy';

/**
 * Storage identity of a saved week: client + start date, so two clients can save the same week.
 * The original JGU client keeps the plain date, so weeks saved before multi-client support stay put.
 */
export function weekKey(w) {
  return !w.clientId || w.clientId === LEGACY_CLIENT_ID ? w.id : `${w.clientId}:${w.id}`;
}

/** Whether a saved week belongs to a client (untagged weeks → legacy client only). */
export function weekBelongsToClient(week, clientId, legacyClientId) {
  if (!clientId) return true;
  if (week.clientId) return week.clientId === clientId;
  return Boolean(legacyClientId && clientId === legacyClientId);
}

export function weeksForClient(weeks, clientId, legacyClientId) {
  return (weeks || []).filter((w) => weekBelongsToClient(w, clientId, legacyClientId));
}

/** Overall junk rate across a client's weeks (null if none). */
export function clientOverallJunkPct(weeks) {
  if (!weeks?.length) return null;
  let junk = 0;
  let total = 0;
  for (const w of weeks) {
    junk += w.totals?.junk || 0;
    total += w.totals?.total || 0;
  }
  return total ? junk / total : null;
}
