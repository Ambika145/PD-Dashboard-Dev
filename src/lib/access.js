/** Local roles & programme assignments (browser storage — no server auth). */

import { keyOf } from './junkCore.js';

export const ROLES = {
  SUPERADMIN: 'superadmin',
  ADMIN: 'admin',
};

export const ROLE_LABEL = {
  superadmin: 'Super Admin',
  admin: 'Admin',
};

/** Seed team — Super Admin assigns programmes to these people. */
export const DEFAULT_USERS = [
  { id: 'user_super', name: 'Priya', role: ROLES.SUPERADMIN, pin: '1234', active: true },
  { id: 'user_ravi', name: 'Ravi', role: ROLES.ADMIN, pin: '1234', active: true },
  { id: 'user_jitendar', name: 'Jitendar', role: ROLES.ADMIN, pin: '1234', active: true },
  { id: 'user_manjusha', name: 'Manjusha', role: ROLES.ADMIN, pin: '1234', active: true },
];

export const newUserId = () => `user_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export function normalizeUser(input, { id, createdAt } = {}) {
  const name = String(input.name || '').trim();
  const role = input.role === ROLES.SUPERADMIN ? ROLES.SUPERADMIN : ROLES.ADMIN;
  const pin = String(input.pin || '').trim();
  const active = input.active !== false;
  if (!name) return { ok: false, error: 'Name is required.' };
  if (pin.length < 4) return { ok: false, error: 'PIN must be at least 4 characters.' };
  const now = new Date().toISOString();
  return {
    ok: true,
    user: {
      id: id || input.id || newUserId(),
      name,
      role,
      pin,
      active,
      createdAt: createdAt || input.createdAt || now,
      updatedAt: now,
    },
  };
}

export function ensureUsers(users) {
  const now = new Date().toISOString();
  if (Array.isArray(users) && users.length) {
    // Soft rename: older seed used "Super Admin" as the person name (looked duplicated next to the role).
    return users.map((u) => (
      u.id === 'user_super' && u.name === 'Super Admin'
        ? { ...u, name: 'Priya', updatedAt: now }
        : u
    ));
  }
  return DEFAULT_USERS.map((u) => ({ ...u, createdAt: now, updatedAt: now }));
}

export function authenticate(users, nameOrId, pin) {
  const q = String(nameOrId || '').trim().toLowerCase();
  const p = String(pin || '').trim();
  const user = (users || []).find((u) =>
    u.active !== false
    && (u.id === nameOrId || u.name.toLowerCase() === q),
  );
  if (!user) return { ok: false, error: 'User not found.' };
  if (user.pin !== p) return { ok: false, error: 'Incorrect PIN.' };
  return { ok: true, user: publicUser(user) };
}

export function publicUser(u) {
  if (!u) return null;
  return { id: u.id, name: u.name, role: u.role, active: u.active !== false };
}

export const isSuperAdmin = (user) => user?.role === ROLES.SUPERADMIN;
export const isAdmin = (user) => user?.role === ROLES.ADMIN;

/** assignments: [{ programmeKey, programmeLabel, userId, assignedAt, assignedBy }] */
export function assignmentsForUser(assignments, userId) {
  return (assignments || []).filter((a) => a.userId === userId);
}

/** Ownership list for an Admin (empty array if none). Super Admin → null (N/A).
 *  Data views are NOT filtered by this — every user sees all programmes. */
export function programmeKeysForUser(assignments, user) {
  if (!user) return null;
  if (isSuperAdmin(user)) return null;
  return assignmentsForUser(assignments, user.id).map((a) => a.programmeKey);
}

export function assigneeForProgramme(assignments, programmeKey) {
  const key = keyOf(programmeKey);
  return (assignments || []).find((a) => a.programmeKey === key) || null;
}

/** Replace all assignees for one programme (one owner at a time). */
export function setProgrammeAssignee(assignments, { programmeKey, programmeLabel, userId, assignedBy }) {
  const key = keyOf(programmeKey);
  const rest = (assignments || []).filter((a) => a.programmeKey !== key);
  if (!userId) return rest;
  return [
    ...rest,
    {
      programmeKey: key,
      programmeLabel: programmeLabel || programmeKey,
      userId,
      assignedAt: new Date().toISOString(),
      assignedBy: assignedBy || null,
    },
  ];
}

/** Set the full programme list for one team member (replaces their previous set).
 *  A programme can only belong to one person — claiming it moves it from anyone else. */
export function setUserProgrammes(assignments, { userId, programmes, assignedBy }) {
  const selected = (programmes || []).map((p) => ({
    key: keyOf(p.key || p),
    label: p.label || p.key || String(p),
  }));
  const selectedKeys = new Set(selected.map((p) => p.key));
  const rest = (assignments || []).filter(
    (a) => a.userId !== userId && !selectedKeys.has(a.programmeKey),
  );
  const now = new Date().toISOString();
  return [
    ...rest,
    ...selected.map((p) => ({
      programmeKey: p.key,
      programmeLabel: p.label,
      userId,
      assignedAt: now,
      assignedBy: assignedBy || null,
    })),
  ];
}

const PROG_NUM = ['total', 'junk', 'jl', 'fin', 'ni', 'started', 'submitted', 'enrolled'];

/** Filter one stored week down to assigned programmes (Admin scope). */
export function scopeWeek(w, programmeKeys) {
  if (!w || programmeKeys == null) return w;
  const set = new Set(programmeKeys);
  const programmes = (w.programmes || []).filter((p) => set.has(p.key));
  const labels = new Set(programmes.map((p) => p.label));
  const campaigns = (w.campaigns || []).filter((c) => labels.has(c.course));
  const totals = { total: 0, junk: 0, jl: 0, fin: 0, ni: 0, started: 0, submitted: 0, enrolled: 0 };
  const counts = {};
  for (const p of programmes) {
    for (const f of PROG_NUM) totals[f] += p[f] || 0;
    for (const [k, n] of Object.entries(p.counts || {})) counts[k] = (counts[k] || 0) + n;
  }
  const hasApps = w.totals?.started !== null && w.totals?.started !== undefined;
  const hasCats = w.totals?.jl !== null && w.totals?.jl !== undefined;
  let rows = w.rows;
  if (rows?.leads?.length && rows.courses) {
    const allowIdx = new Set(rows.courses.map((c, i) => (set.has(keyOf(c)) ? i : -1)).filter((i) => i >= 0));
    const leads = rows.leads.filter(([ci]) => allowIdx.has(ci));
    rows = { ...rows, leads };
  }
  return {
    ...w,
    programmes,
    campaigns,
    totals: {
      ...w.totals,
      total: totals.total,
      junk: totals.junk,
      jl: hasCats ? totals.jl : w.totals?.jl ?? null,
      fin: hasCats ? totals.fin : w.totals?.fin ?? null,
      ni: hasCats ? totals.ni : w.totals?.ni ?? null,
      started: hasApps ? totals.started : null,
      submitted: hasApps ? totals.submitted : null,
      enrolled: hasApps ? totals.enrolled : null,
      counts,
    },
    rows,
    scoped: true,
  };
}

/** Scope a list of weeks before aggregating (keeps sparklines / series correct). */
export function scopeWeeks(weeks, programmeKeys) {
  if (!weeks || programmeKeys == null) return weeks;
  return weeks.map((w) => scopeWeek(w, programmeKeys));
}

/**
 * Scope an aggregate to assigned programmes for Admin users.
 * Prefer scopeWeeks() + aggregate() when week-level series must match.
 * Super Admin (programmeKeys === null) gets the full aggregate.
 */
export function scopeAggregate(agg, programmeKeys) {
  if (!agg || programmeKeys == null) return agg;
  const set = new Set(programmeKeys);
  const programmes = (agg.programmes || []).filter((p) => set.has(p.key));
  const labels = new Set(programmes.map((p) => p.label));
  const campaigns = (agg.campaigns || []).filter((c) => labels.has(c.course));

  const totals = { total: 0, junk: 0, started: 0, submitted: 0, enrolled: 0, untouched: 0, dnp: 0, qualified: 0 };
  const cat = { total: 0, junk: 0, jl: 0, fin: 0, ni: 0 };
  for (const p of programmes) {
    totals.total += p.total || 0;
    totals.junk += p.junk || 0;
    totals.started += p.started || 0;
    totals.submitted += p.submitted || 0;
    totals.enrolled += p.enrolled || 0;
    totals.untouched += p.untouched || 0;
    totals.dnp += p.dnp || 0;
    totals.qualified = (totals.qualified || 0) + (p.qualified || 0);
    cat.total += p.total || 0;
    cat.junk += p.junk || 0;
    cat.jl += p.jl || 0;
    cat.fin += p.fin || 0;
    cat.ni += p.ni || 0;
  }
  const qualified = totals.qualified || 0;
  const withPct = {
    ...totals,
    qualified,
    junkPct: totals.total ? totals.junk / totals.total : 0,
    qualifiedPct: totals.total ? qualified / totals.total : 0,
    untouchedPct: totals.total ? totals.untouched / totals.total : 0,
    dnpPct: totals.total ? totals.dnp / totals.total : 0,
  };
  return {
    ...agg,
    programmes,
    campaigns,
    totals: withPct,
    categories: { ...cat, other: cat.total - cat.junk },
    weeksDetailed: programmes.length ? agg.weeksDetailed : 0,
    scoped: true,
    scopedTo: programmeKeys.length,
  };
}

/**
 * Access matrix
 * ─────────────
 * Super Admin — full authority: every page, weekly run, team, clients,
 *               settings, and history import/delete.
 * Admin (team) — analyse all programmes (for comparison): Overview,
 *               Programmes, Campaigns, Records, History (view/export).
 *               Assignments mark ownership only — they do not hide data.
 *               No Weekly run, Team, Clients, or Settings.
 */
export const ALL_VIEWS = [
  'overview', 'leads', 'junk', 'qualified', 'dnp', 'untouched', 'apps',
  'programmes', 'campaigns', 'records', 'run',
  'history', 'clients', 'team', 'settings',
];

export const ADMIN_VIEWS = [
  'overview', 'leads', 'junk', 'qualified', 'dnp', 'untouched', 'apps',
  'programmes', 'campaigns', 'records', 'history',
];

/** Nav pages each role may open. */
export function allowedViews(user) {
  if (!user) return [];
  if (isSuperAdmin(user)) return [...ALL_VIEWS];
  if (isAdmin(user)) return [...ADMIN_VIEWS];
  return [];
}

export function canAccess(user, view) {
  return allowedViews(user).includes(view);
}

/** Super Admin only — upload / approve weekly Meritto files. */
export const canRunWeekly = (user) => isSuperAdmin(user);

/** Super Admin only — Team page (add users, assign programmes). */
export const canManageTeam = (user) => isSuperAdmin(user);

/** Super Admin only — Clients page (add/edit/switch workspace clients). */
export const canManageClients = (user) => isSuperAdmin(user);

/** Super Admin only — Settings (exclusions, managed list, goals). */
export const canManageSettings = (user) => isSuperAdmin(user);

/** Super Admin only — import history or delete saved weeks. */
export const canMutateHistory = (user) => isSuperAdmin(user);

/** Any signed-in Super Admin or Admin may open analyse pages. */
export const canAnalyse = (user) => isSuperAdmin(user) || isAdmin(user);
