/* Core logic — pure functions that reproduce the documented manual process
   (_Junk Analysis Process.md). No DOM or React; covered by tests/core.test.mjs. */

export const BLANK = '(blank)';

// Doc Step 6 — programmes not managed by the team.
export const DEFAULT_EXCLUDED = [
  'BACHELOR OF SCIENCE IN PSYCHOLOGY',
  'COURSE NOT AVAILABLE',
  'M.SC. IN FAMILY BUSINESS',
  'M.SC. IN STRATEGIC COMMUNICATION',
  "MASTER'S OF DESIGN IN USER EXPERIENCE",
  BLANK,
];

// Programmes that appear in the team's past weekly reports. Anything not here
// and not excluded is flagged for a decision.
export const DEFAULT_MANAGED = [
  'B.A. IN DIGITAL GOVERNANCE, REGULATION & POLICY',
  'B.A. IN GEOPOLITICS & GEOECONOMICS',
  'B.COM (INTERNATIONAL ACCOUNTING AND FINANCE)',
  'B.SC. IN ARTIFICIAL INTELLIGENCE & FINANCE',
  'B.SC. IN AI & FINANCE',
  'B.SC. IN FINANCE & ENTREPRENEURSHIP',
  'BACHELORS PROGRAMME',
  'M.A. IN CRIMINOLOGY & CRIMINAL JUSTICE',
  'M.A. IN EDUCATIONAL LEADERSHIP AND GOVERNANCE',
  'M.A IN EDUCATIONAL LEADERSHIP AND GOVERNANCE HIGHER EDUCATION',
  'M.A IN EDUCATIONAL LEADERSHIP AND GOVERNANCE K-12 SCHOOL EDUCATION',
  'M.A. IN INDIA STUDIES',
  'M.A. IN INTERNATIONAL RELATIONS, SECURITY AND STRATEGY',
  'M.A. IN MUSEOLOGY AND CULTURAL HERITAGE',
  'M.A. IN PUBLIC POLICY',
  'M.A. LEGISLATIVE DRAFTING',
  'M.SC. (AI & FINANCE)',
  'M.SC. (GLOBAL RISK MANAGEMENT)',
  'M.SC. IN DESIGN THINKING, INNOVATION AND STRATEGY',
  'M.SC. IN DEVELOPMENT STUDIES',
  'M.SC. IN DIGITAL GOVERNANCE AND DIGITAL PUBLIC INFRASTRUCTURE',
  'M.SC. IN ENTREPRENEURSHIP, INNOVATION & START-UPS',
  'M.SC. IN ENVIRONMENTAL MANAGEMENT',
  'MASTER OF ARTS (M.A.) IN AMERICAN STUDIES',
  'MASTER OF ARTS (M.A.) IN CRIMINOLOGY & CRIMINAL JUSTICE',
  'MASTER OF ARTS (M.A.) IN ELECTORAL ANALYSIS AND MANAGEMENT',
  'MASTER OF ARTS (MA) IN POLITICAL COMMUNICATION',
  'MASTER OF ARTS IN TEACHING ENGLISH TO SPEAKERS OF OTHER LANGUAGES (TESOL)',
  'MASTERS IN ELECTORAL MANAGEMENT',
  'MASTERS IN ENVIRONMENTAL CHANGE AND SUSTAINABILITY',
  'MASTERS IN GLOBAL HEALTH AND HUMAN DEVELOPMENT',
  'MBA IN BUSINESS ANALYTICS',
];

// Lead stages seen in past reports; a stage outside this list is reported.
export const DEFAULT_KNOWN_STAGES = [
  'ALREADY ENROLLED - UPGRAD / COUSERA / OP JINDAL', 'APP - ADMIT (DOCUMENTS VERIFIED)', 'APP - REJECTED', 'APP SUBMITTED',
  'CONNECTED ON EMAIL', 'CONNECTED ON WHATSAPP', 'COUNSELLED', 'COURSERA PROSPECT',
  'DID NOT PICK (DNP)', 'DOCUMENT REJECTED', 'ENROLLED WITH ANOTHER UNIVERSITY',
  'FINANCIAL BARRIER', 'FOLLOW UP - POST COUNSELLED', 'INTERESTED IN NEXT COHORT WARM',
  'JUNK LEAD', 'NOT INTERESTED IN THE PROGRAM', 'OL SENT', 'PROSPECT',
  'REATTEMPT UNTOUCHED', 'REGISTRATION FEE PAID', 'REQUEST CALL BACK', 'UNTOUCHED',
  'WEBINAR PROSPECT', BLANK,
];

// Doc Step 8 — Junk = Financial Barrier + Junk + Not Interested in the Programme.
export const JUNK_CATEGORIES = [
  { id: 'jl', label: 'Junk Lead', keys: ['JUNK LEAD', 'JUNK'] },
  { id: 'fin', label: 'Financial Barrier', keys: ['FINANCIAL BARRIER'] },
  {
    id: 'ni',
    label: 'Not Interested in the Program',
    keys: ['NOT INTERESTED IN THE PROGRAM', 'NOT INTERESTED IN THE PROGRAMME', 'NOT INTERESTED IN PROGRAMME'],
  },
];
const JUNK_STAGE_KEYS = new Set(JUNK_CATEGORIES.flatMap((c) => c.keys));
const CATEGORY_OF = new Map(JUNK_CATEGORIES.flatMap((c) => c.keys.map((k) => [k, c.id])));
export const isJunkStage = (key) => JUNK_STAGE_KEYS.has(key);

export const FIELD_CANDIDATES = {
  course: ['course', 'course name', 'programme', 'program', 'programme name', 'program name'],
  stage: ['lead stage', 'stage'],
  // DNP detail — optional Meritto columns (Customise Columns on leads export).
  subStage: ['lead sub stage', 'dnp sub stage', 'sub stage', 'substage', 'lead sub-stage'],
  noteCount: [
    'note count', 'notes count', 'dnp history', 'dnp note count', 'history count',
    'total notes', 'notes', 'lead notes', 'note',
    'call attempts', 'call attempt', 'number of calls', 'no of calls', 'no. of calls', 'call count', 'calls count',
    'total calls', 'dial count', 'attempt count',
  ],
  campaign: ['primary registration campaign', 'registration campaign', 'primary campaign', 'campaign'],
  payment: ['payment status', 'application payment status'],
  enrolStatus: ['enrolment status', 'enrollment status'],
  leadDate: ['user registration date', 'registration date', 'registered on', 'lead created date', 'created on'],
  enrolDate: ['enrolment date', 'enrollment date'],
  formDate: ['form starting date', 'form start date', 'form started on', 'application start date'],
};

/** Parse Meritto note/history count cells (number or numeric string). */
export function parseNoteCount(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.round(v));
  const s = clean(v).replace(/,/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Normalises text the way an Excel pivot groups it, and repairs the
// UTF-8/Latin-1 artefact seen in past reports ("SECURITY ANDÂ STRATEGY").
export function clean(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/^﻿/, '')
    .replace(/Â(?=[\s ])/g, '')
    .replace(/[   ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
export const keyOf = (v) => (clean(v) ? clean(v).toUpperCase() : BLANK.toUpperCase());
export const labelOf = (v) => clean(v) || BLANK;

export function compareLabels(a, b) {
  if (a === b) return 0;
  if (a === BLANK) return 1;
  if (b === BLANK) return -1;
  return a.localeCompare(b, 'en', { sensitivity: 'base' });
}

export function detectColumn(headers, field) {
  const norm = headers.map((h) => clean(h).toLowerCase());
  // Avoid "Lead Sub Stage" matching the Lead Stage field via includes("stage").
  const skip = (h) => {
    if (field === 'stage' && (/\bsub\b/.test(h) || h.includes('payment') || h.includes('enrol'))) return true;
    if (field === 'noteCount' && (h.includes('remark') || h.includes('comment text') || h.includes('date') || h.includes('time'))) return true;
    return false;
  };
  for (const c of FIELD_CANDIDATES[field] || []) {
    const i = norm.findIndex((h, idx) => h === c && !skip(norm[idx]));
    if (i >= 0) return headers[i];
  }
  for (const c of FIELD_CANDIDATES[field] || []) {
    const i = norm.findIndex((h) => h.includes(c) && !skip(h));
    if (i >= 0) return headers[i];
  }
  return '';
}

function makeDate(y, m, d) {
  const dt = new Date(y, m, d);
  return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d ? dt : null;
}

// Accepts ISO, DD-MM-YYYY / DD/MM/YYYY (Indian order), "14 Oct 2026", "Oct 14, 2026".
export function parseDate(v) {
  if (v instanceof Date) return isNaN(v) ? null : makeDate(v.getFullYear(), v.getMonth(), v.getDate());
  const s = clean(v);
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return makeDate(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) return makeDate(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1]);
  m = s.match(/^(\d{1,2})[\s-]+([A-Za-z]{3})[A-Za-z]*[\s,-]+(\d{4})/);
  if (m && MONTHS.includes(m[2].toLowerCase())) return makeDate(+m[3], MONTHS.indexOf(m[2].toLowerCase()), +m[1]);
  m = s.match(/^([A-Za-z]{3})[A-Za-z]*\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && MONTHS.includes(m[1].toLowerCase())) return makeDate(+m[3], MONTHS.indexOf(m[1].toLowerCase()), +m[2]);
  return null;
}

export function addDays(d, n) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() + n);
  return r;
}

export const isoDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const fromIso = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// Reporting week is Wednesday → Tuesday; default is the last completed one.
export function defaultWeek(today = new Date()) {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let back = (d.getDay() - 2 + 7) % 7;
  if (back === 0) back = 7;
  const end = addDays(d, -back);
  return { start: addDays(end, -6), end };
}
export const weekFromStart = (start) => ({ start, end: addDays(start, 6) });

const shortMonth = (d) => MONTHS[d.getMonth()].replace(/^./, (c) => c.toUpperCase());
export const formatDay = (d) => `${d.getDate()} ${shortMonth(d)} ${d.getFullYear()}`;
export const formatDayShort = (d) => `${d.getDate()} ${shortMonth(d)}`;

// Same heading style as the past reports: "14 Oct - 20 Oct 2026".
export function weekLabel(week) {
  const { start, end } = week;
  const a = start.getFullYear() === end.getFullYear() ? formatDayShort(start) : formatDay(start);
  return `${a} - ${formatDay(end)}`;
}

const bump = (map, k, n = 1) => map.set(k, (map.get(k) || 0) + n);
export const pct = (v) => `${Math.round(v * 100)}%`;

export function summarise(counts) {
  let total = 0;
  let junk = 0;
  for (const [k, n] of counts) {
    total += n;
    if (JUNK_STAGE_KEYS.has(k)) junk += n;
  }
  return { total, junk, junkPct: total ? junk / total : 0 };
}

/**
 * Stage buckets used on Overview (from the live Meritto Lead Stage list).
 * Junk stays the three Doc Step 8 stages; Qualified is the counselled funnel —
 * not simply Total − Junk.
 */
export const UNTOUCHED_KEY = 'UNTOUCHED';
export const UNTOUCHED_KEYS = ['UNTOUCHED', 'REATTEMPT UNTOUCHED'];
export const DNP_KEYS = ['DID NOT PICK (DNP)'];
export const isDnpStage = (key) => DNP_KEYS.includes(key) || String(key || '').toUpperCase().includes('DID NOT PICK');
export const QUALIFIED_KEYS = [
  'COUNSELLED',
  'OL SENT',
  'REGISTRATION FEE PAID',
  'FOLLOW UP - POST COUNSELLED',
];

export function stageCount(counts, keys) {
  if (!counts) return 0;
  const list = Array.isArray(keys) ? keys : [keys];
  let n = 0;
  for (const k of list) {
    if (counts instanceof Map) n += counts.get(k) || 0;
    else n += counts[k] || 0;
  }
  return n;
}

export function untouchedCount(counts) {
  return stageCount(counts, UNTOUCHED_KEYS);
}

/** Every Did Not Pick stage, so the KPI matches the Calling report and Records. */
export function dnpCount(counts) {
  if (!counts) return 0;
  const entries = counts instanceof Map ? [...counts.entries()] : Object.entries(counts);
  return entries.reduce((n, [k, v]) => (isDnpStage(k) ? n + (v || 0) : n), 0);
}

/**
 * DNP Calling report buckets — Note Count = Call Attempts.
 * Standard ops layout: 1–4 Calls; 0 and 5+ keep the total reconcilable.
 */
export const CALL_ATTEMPT_BUCKETS = [
  { key: '1', label: '1 Call', min: 1, max: 1 },
  { key: '2', label: '2 Calls', min: 2, max: 2 },
  { key: '3', label: '3 Calls', min: 3, max: 3 },
  { key: '4', label: '4 Calls', min: 4, max: 4 },
  { key: '5+', label: '5+ Calls', min: 5, max: Infinity },
  { key: '0', label: '0 Calls', min: 0, max: 0 },
];

export function emptyCallAttempts() {
  return Object.fromEntries(CALL_ATTEMPT_BUCKETS.map((b) => [b.key, 0]));
}

export function callAttemptKey(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const v = Math.max(0, Math.floor(Number(n)));
  if (v === 0) return '0';
  if (v >= 5) return '5+';
  return String(v);
}

export function bumpCallAttempt(counts, n) {
  const key = callAttemptKey(n);
  if (!key || !counts) return;
  counts[key] = (counts[key] || 0) + 1;
}

/** Rows for the Calling report table (always includes 1–4 Calls). */
export function callAttemptsReport(counts, denom) {
  const c = counts || emptyCallAttempts();
  const base = denom || 0;
  return CALL_ATTEMPT_BUCKETS.map((b) => {
    const n = c[b.key] || 0;
    return { key: b.key, label: b.label, n, pct: base ? n / base : 0 };
  });
}

/** Rebuild DNP detail from compact lead rows (used after custom date slicing). */
export function dnpDetailFromRows(rows) {
  if (!rows?.leads?.length) return null;
  const { stages = [], substages = [], leads } = rows;
  const sub = new Map();
  const callAttempts = emptyCallAttempts();
  let total = 0;
  let withNotes = 0;
  let withoutNotes = 0;
  let notesKnown = 0;
  let noteSum = 0;
  let substagesMapped = Array.isArray(substages) && substages.length > 0;
  let notesMapped = false;
  for (const row of leads) {
    const stage = stages[row[1]];
    const sk = keyOf(stage);
    if (!isDnpStage(sk)) continue;
    total++;
    const subLabel = substages[row[4]] ?? '';
    const subKey = keyOf(subLabel) || BLANK.toUpperCase();
    if (!sub.has(subKey)) sub.set(subKey, { key: subKey, label: labelOf(subLabel), n: 0, withNotes: 0, noteSum: 0 });
    const b = sub.get(subKey);
    b.n++;
    const notesRaw = row[5];
    const notes = notesRaw === '' || notesRaw === undefined || notesRaw === null ? null : Number(notesRaw);
    if (notes !== null && Number.isFinite(notes)) {
      notesMapped = true;
      notesKnown++;
      noteSum += notes;
      b.noteSum += notes;
      bumpCallAttempt(callAttempts, notes);
      if (notes > 0) { withNotes++; b.withNotes++; }
      else withoutNotes++;
    }
  }
  if (!total) return null;
  return {
    total,
    withNotes,
    withoutNotes,
    notesKnown,
    noteSum,
    substagesMapped,
    notesMapped,
    callAttempts,
    callAttemptsReport: callAttemptsReport(callAttempts, notesKnown),
    substages: [...sub.values()].sort((a, b) => b.n - a.n || compareLabels(a.label, b.label)),
  };
}

/** Merge week-level DNP substage / note snapshots for a period. */
export function mergeDnpDetail(weeks) {
  const sub = new Map();
  const callAttempts = emptyCallAttempts();
  let total = 0;
  let withNotes = 0;
  let withoutNotes = 0;
  let notesKnown = 0;
  let noteSum = 0;
  let substagesMapped = false;
  let notesMapped = false;
  let weeksWithDetail = 0;
  for (const w of weeks || []) {
    const d = w.dnpDetail;
    if (!d || !d.total) continue;
    weeksWithDetail++;
    total += d.total || 0;
    withNotes += d.withNotes || 0;
    withoutNotes += d.withoutNotes || 0;
    notesKnown += d.notesKnown || 0;
    noteSum += d.noteSum || 0;
    if (d.substagesMapped) substagesMapped = true;
    if (d.notesMapped) notesMapped = true;
    if (d.callAttempts) {
      for (const b of CALL_ATTEMPT_BUCKETS) callAttempts[b.key] += d.callAttempts[b.key] || 0;
    } else if (d.notesMapped && w.rows?.leads?.length) {
      // Older weeks: rebuild from compact rows when the snapshot has no buckets yet.
      const rebuilt = dnpDetailFromRows(w.rows);
      if (rebuilt?.callAttempts) {
        for (const b of CALL_ATTEMPT_BUCKETS) callAttempts[b.key] += rebuilt.callAttempts[b.key] || 0;
      }
    }
    for (const s of d.substages || []) {
      const key = s.key || keyOf(s.label);
      if (!sub.has(key)) sub.set(key, { key, label: s.label, n: 0, withNotes: 0, noteSum: 0 });
      const b = sub.get(key);
      b.n += s.n || 0;
      b.withNotes += s.withNotes || 0;
      b.noteSum += s.noteSum || 0;
    }
  }
  if (!weeksWithDetail) return null;
  return {
    total,
    withNotes,
    withoutNotes,
    notesKnown,
    noteSum,
    substagesMapped,
    notesMapped,
    weeksWithDetail,
    callAttempts,
    callAttemptsReport: callAttemptsReport(callAttempts, notesKnown),
    substages: [...sub.values()].sort((a, b) => b.n - a.n || compareLabels(a.label, b.label)),
  };
}

/**
 * Programme-wise DNP Calling report. DNP leads come from programme stage counts
 * (every week); call attempts come from lead rows (approved weeks with Note Count).
 * DNP leads without a known Note Count land in `noNote`, so each row reconciles:
 * DNP = 1 + 2 + 3 + 4 + 5+ + 0 Calls + No Note Count.
 */
export function dnpProgrammeReport(weeks, programmes) {
  const by = new Map();
  const row = (key, label) => {
    if (!by.has(key)) by.set(key, { key, label, leads: 0, dnp: 0, notesKnown: 0, noteSum: 0, callAttempts: emptyCallAttempts() });
    return by.get(key);
  };
  for (const p of programmes || []) {
    const r = row(p.key, p.label);
    r.leads += p.total || 0;
    r.dnp += dnpCount(p.counts);
  }
  for (const w of weeks || []) {
    if (!w.rows?.leads?.length) continue;
    const { courses = [], stages = [], leads } = w.rows;
    for (const t of leads) {
      if (!isDnpStage(keyOf(stages[t[1]]))) continue;
      const notesRaw = t[5];
      const notes = notesRaw === '' || notesRaw === undefined || notesRaw === null ? null : Number(notesRaw);
      if (notes === null || !Number.isFinite(notes)) continue;
      const r = row(keyOf(courses[t[0]]), labelOf(courses[t[0]]));
      r.notesKnown++;
      r.noteSum += notes;
      bumpCallAttempt(r.callAttempts, notes);
    }
  }
  return [...by.values()]
    .filter((r) => r.dnp || r.notesKnown)
    .map((r) => {
      const dnp = Math.max(r.dnp, r.notesKnown);
      return {
        ...r,
        dnp,
        dnpPct: r.leads ? dnp / r.leads : 0,
        noNote: dnp - r.notesKnown,
        avgCalls: r.notesKnown ? r.noteSum / r.notesKnown : 0,
      };
    })
    .sort((a, b) => b.dnp - a.dnp || compareLabels(a.label, b.label));
}

export function qualifiedCount(counts) {
  return stageCount(counts, QUALIFIED_KEYS);
}

export function untouchedPct(counts, total) {
  if (!total) return 0;
  return untouchedCount(counts) / total;
}

// Counts per documented Junk category ({ jl, fin, ni }).
export function junkBreakdown(counts) {
  const out = { jl: 0, fin: 0, ni: 0 };
  const entries = counts instanceof Map ? counts.entries() : Object.entries(counts);
  for (const [k, n] of entries) {
    const c = CATEGORY_OF.get(k);
    if (c) out[c] += n;
  }
  return out;
}

const listCounts = (map) =>
  [...map.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} (${n})`).join('; ');

/**
 * Builds the weekly report.
 * Each dataset: { name, rows: [{header: value}], cols: {field: header} } or null.
 */
export function buildReport({ leads, enrol, apps, settings, week }) {
  const excluded = new Set(settings.excluded.map(keyOf));
  const managed = new Set(settings.managed.map(keyOf));
  const knownStages = new Set(settings.knownStages.map(keyOf));
  const checks = [];
  const add = (level, title, detail = '', doc = '', action = null) => checks.push({ level, title, detail, doc, action });

  const courses = new Map();
  const course = (raw) => {
    const key = keyOf(raw);
    if (!courses.has(key)) courses.set(key, { key, label: labelOf(raw), leads: 0, enrol: 0, apps: 0 });
    return courses.get(key);
  };
  const statusOf = (key) => (excluded.has(key) ? 'excluded' : managed.has(key) ? 'managed' : 'new');
  const ready = (ds, ...fields) => !!ds && fields.every((f) => ds.cols[f]);

  // ---- Inputs present ---------------------------------------------------
  const inputs = [
    ['Part 1 leads export', leads, ['course', 'stage'], 'Steps 2–4'],
    ['Part 2 enrolment export', enrol, ['course'], 'Steps 10–12'],
    ['Part 3 application export', apps, ['course', 'payment'], 'Steps 14–15'],
  ];
  for (const [name, ds, req, doc] of inputs) {
    if (!ds) add('error', `${name} not uploaded`, 'All three Meritto exports are needed for the weekly report.', doc);
    else {
      const missing = req.filter((f) => !ds.cols[f]);
      if (missing.length) add('error', `${name}: column not chosen — ${missing.join(', ')}`, 'Pick the matching column on the upload step.', doc);
    }
  }

  // ---- Part 1 · Steps 5, 6, 8 ------------------------------------------
  const stageLabel = new Map();
  const matrix = new Map();
  const camp = new Map();
  const excCounts = new Map();
  const leadRows = [];
  let included = 0;
  let blankCourse = 0;
  const hasCampaign = ready(leads, 'course', 'stage') && !!leads.cols.campaign;

  const hasSubStage = ready(leads, 'course', 'stage') && !!leads.cols.subStage;
  const hasNoteCount = ready(leads, 'course', 'stage') && !!leads.cols.noteCount;
  // DNP detail: Lead Sub Stage + Note Count / DNP History (optional Meritto columns).
  const dnpSub = new Map(); // key → { label, n, withNotes, noteSum }
  const callAttempts = emptyCallAttempts();
  let dnpTotal = 0;
  let dnpWithNotes = 0;
  let dnpWithoutNotes = 0;
  let dnpNoteSum = 0;
  let dnpNotesKnown = 0;

  if (ready(leads, 'course', 'stage')) {
    for (const r of leads.rows) {
      const c = course(r[leads.cols.course]);
      c.leads++;
      if (c.key === BLANK.toUpperCase()) blankCourse++;
      if (excluded.has(c.key)) {
        bump(excCounts, c.label);
        continue;
      }
      included++;
      const sk = keyOf(r[leads.cols.stage]);
      if (!stageLabel.has(sk)) stageLabel.set(sk, labelOf(r[leads.cols.stage]));
      if (!matrix.has(c.key)) matrix.set(c.key, new Map());
      bump(matrix.get(c.key), sk);
      const campLabel = hasCampaign ? labelOf(r[leads.cols.campaign]) : '';
      if (hasCampaign) {
        if (!camp.has(c.key)) camp.set(c.key, new Map());
        const cm = camp.get(c.key);
        const ck = keyOf(r[leads.cols.campaign]);
        if (!cm.has(ck)) cm.set(ck, { label: campLabel, counts: new Map() });
        bump(cm.get(ck).counts, sk);
      }
      const d = leads.cols.leadDate ? parseDate(r[leads.cols.leadDate]) : null;
      const subRaw = hasSubStage ? r[leads.cols.subStage] : '';
      const subKey = hasSubStage ? keyOf(subRaw) : '';
      const subLabel = hasSubStage ? labelOf(subRaw) : '';
      const notes = hasNoteCount ? parseNoteCount(r[leads.cols.noteCount]) : null;
      if (isDnpStage(sk)) {
        dnpTotal++;
        if (!dnpSub.has(subKey || BLANK.toUpperCase())) {
          dnpSub.set(subKey || BLANK.toUpperCase(), {
            key: subKey || BLANK.toUpperCase(),
            label: subLabel || BLANK,
            n: 0,
            withNotes: 0,
            noteSum: 0,
          });
        }
        const bucket = dnpSub.get(subKey || BLANK.toUpperCase());
        bucket.n++;
        if (notes !== null) {
          dnpNotesKnown++;
          dnpNoteSum += notes;
          bucket.noteSum += notes;
          bumpCallAttempt(callAttempts, notes);
          if (notes > 0) {
            dnpWithNotes++;
            bucket.withNotes++;
          } else dnpWithoutNotes++;
        }
      }
      leadRows.push({
        course: c.key,
        stage: sk,
        campaign: campLabel,
        date: d ? isoDate(d) : '',
        subStage: subLabel,
        notes,
      });
    }
  }

  const dnpDetail = {
    total: dnpTotal,
    substagesMapped: hasSubStage,
    notesMapped: hasNoteCount,
    withNotes: dnpWithNotes,
    withoutNotes: dnpWithoutNotes,
    notesKnown: dnpNotesKnown,
    noteSum: dnpNoteSum,
    callAttempts,
    callAttemptsReport: callAttemptsReport(callAttempts, dnpNotesKnown),
    substages: [...dnpSub.values()].sort((a, b) => b.n - a.n || compareLabels(a.label, b.label)),
  };

  const stageCols = [...stageLabel.keys()]
    .sort((a, b) => compareLabels(stageLabel.get(a), stageLabel.get(b)))
    .map((key) => ({ key, label: stageLabel.get(key), junk: JUNK_STAGE_KEYS.has(key) }));

  // Campaign-level app / enrolment counts (courseKey → campaignKey → metrics).
  // Filled when the Primary Registration Campaign column is mapped on those files.
  const campMetrics = new Map();
  const ensureCampMetric = (courseKey, campRaw) => {
    const ck = keyOf(campRaw);
    if (!campMetrics.has(courseKey)) campMetrics.set(courseKey, new Map());
    const m = campMetrics.get(courseKey);
    if (!m.has(ck)) m.set(ck, { label: labelOf(campRaw), started: 0, submitted: 0, enrolled: 0 });
    return m.get(ck);
  };

  // ---- Part 2 · Step 13 (Enrollment Done) ------------------------------
  const enrolled = new Map();
  const enrolHasCampaign = ready(enrol, 'course') && !!enrol.cols.campaign;
  if (ready(enrol, 'course')) {
    for (const r of enrol.rows) {
      const c = course(r[enrol.cols.course]);
      c.enrol++;
      if (excluded.has(c.key)) continue;
      bump(enrolled, c.key);
      if (enrolHasCampaign) ensureCampMetric(c.key, r[enrol.cols.campaign]).enrolled++;
    }
  }

  // ---- Part 3 · Step 16 (Payment Pending / Approved) -------------------
  const started = new Map();
  const submitted = new Map();
  const ignoredPay = new Map();
  const appsHasCampaign = ready(apps, 'course', 'payment') && !!apps.cols.campaign;
  if (ready(apps, 'course', 'payment')) {
    for (const r of apps.rows) {
      const c = course(r[apps.cols.course]);
      c.apps++;
      if (excluded.has(c.key)) continue;
      const pk = keyOf(r[apps.cols.payment]);
      if (pk.includes('PENDING')) {
        bump(started, c.key);
        if (appsHasCampaign) ensureCampMetric(c.key, r[apps.cols.campaign]).started++;
      } else if (pk.includes('APPROVED')) {
        bump(submitted, c.key);
        if (appsHasCampaign) ensureCampMetric(c.key, r[apps.cols.campaign]).submitted++;
      } else bump(ignoredPay, labelOf(r[apps.cols.payment]));
    }
  }

  // ---- Weekly Performance sheet rows (VLOOKUP by course; no match → 0) --
  const rows = [...matrix.keys()]
    .map((k) => {
      const counts = matrix.get(k);
      return {
        key: k,
        label: courses.get(k).label,
        counts,
        ...summarise(counts),
        started: started.get(k) || 0,
        submitted: submitted.get(k) || 0,
        enrolled: enrolled.get(k) || 0,
      };
    })
    .sort((a, b) => compareLabels(a.label, b.label));

  const totalCounts = new Map();
  rows.forEach((r) => r.counts.forEach((n, k) => bump(totalCounts, k, n)));
  const sumOf = (f) => rows.reduce((s, r) => s + r[f], 0);
  const totals = {
    label: 'Grand Total',
    counts: totalCounts,
    ...summarise(totalCounts),
    started: sumOf('started'),
    submitted: sumOf('submitted'),
    enrolled: sumOf('enrolled'),
  };

  // ---- Campaign-wise (Course → Primary Registration Campaign) ----------
  // Same columns as programme-wise: lead stages + Application Started /
  // Submitted + Enrollment Done, attributed by campaign when that column
  // was mapped on the leads / apps / enrolment files.
  const campaignRows = [];
  if (hasCampaign) {
    for (const r of rows) {
      campaignRows.push({
        type: 'course', course: r.label, label: r.label, counts: r.counts, ...summarise(r.counts),
        started: r.started, submitted: r.submitted, enrolled: r.enrolled,
      });
      const leadCamps = camp.get(r.key) || new Map();
      const metricCamps = campMetrics.get(r.key) || new Map();
      const keys = new Set([...leadCamps.keys(), ...metricCamps.keys()]);
      [...keys]
        .map((ck) => {
          const lead = leadCamps.get(ck);
          const met = metricCamps.get(ck) || { started: 0, submitted: 0, enrolled: 0 };
          const counts = lead?.counts || new Map();
          return {
            type: 'campaign',
            course: r.label,
            label: lead?.label || met.label,
            counts,
            ...summarise(counts),
            started: met.started || 0,
            submitted: met.submitted || 0,
            enrolled: met.enrolled || 0,
          };
        })
        .sort((a, b) => compareLabels(a.label, b.label))
        .forEach((row) => campaignRows.push(row));
    }
  }

  // ---- Checks -----------------------------------------------------------
  if (ready(leads, 'course', 'stage')) {
    const exc = leads.rows.length - included;
    add('ok', 'Leads reconciled',
      `${leads.rows.length} rows in file = ${included} counted + ${exc} excluded.` + (exc ? ` Excluded: ${listCounts(excCounts)}.` : ''),
      'Steps 5–6');
    if (!rows.length) add('error', 'No leads left after exclusions', 'Check the file and the exclusion list.', 'Step 6');

    const found = JUNK_CATEGORIES.filter((c) => c.keys.some((k) => stageLabel.has(k)));
    if (!found.length) {
      add('warn', 'None of the three Junk stages were found', 'Expected FINANCIAL BARRIER, JUNK LEAD, NOT INTERESTED IN THE PROGRAM. Check the Lead Stage column.', 'Step 8');
    } else {
      add('ok', `Junk = ${stageCols.filter((s) => s.junk).map((s) => s.label).join(' + ')}`,
        `${totals.junk} of ${totals.total} leads → Junk % ${pct(totals.junkPct)}.`, 'Step 8');
      const absent = JUNK_CATEGORIES.filter((c) => !found.includes(c)).map((c) => c.label);
      if (absent.length) add('info', `Junk stage(s) with no leads this week: ${absent.join(', ')}`, '', 'Step 8');
    }

    const newStages = stageCols.filter((s) => !knownStages.has(s.key));
    if (newStages.length) {
      add('info', `${newStages.length} lead stage(s) not seen in past reports`,
        `${newStages.map((s) => s.label).join('; ')} — shown as columns, not counted as Junk.`, 'Step 5',
        { type: 'knowStages', keys: newStages.map((s) => s.label) });
    }

    const untouchedN = untouchedCount(totals.counts);
    const untouchedShare = totals.total ? untouchedN / totals.total : 0;
    const untouchedTh = Number.isFinite(settings.untouchedThreshold) ? settings.untouchedThreshold : 30;
    if (totals.total && untouchedShare * 100 >= untouchedTh) {
      add('warn', `Untouched is ${pct(untouchedShare)} — above the ${untouchedTh}% alert`,
        `${untouchedN} of ${totals.total} leads are still Untouched / Reattempt Untouched. These need follow-up.`, 'Step 5');
    }

    if (dnpTotal > 0) {
      if (hasSubStage) {
        const top = dnpDetail.substages.slice(0, 3).map((s) => `${s.label}: ${s.n}`).join('; ');
        add('ok', `DNP substages for ${dnpTotal} Did Not Pick leads`,
          top || 'Sub stages counted.', 'Step 3');
      } else {
        add('info', 'Lead Sub Stage column not mapped',
          'Add Lead Sub Stage in Meritto Customise Columns to break DNP into substages (e.g. Follow-up Required).', 'Step 3');
      }
      if (hasNoteCount) {
        add('ok', `DNP note / history count`,
          `${dnpWithNotes} of ${dnpNotesKnown} DNP leads have notes (≥1) · ${dnpNoteSum} notes in total.`, 'Step 3');
      } else {
        add('info', 'Note Count / DNP History column not mapped',
          'Add Note Count (or DNP History) in Meritto Customise Columns to show how many DNP leads have counsellor notes.', 'Step 3');
      }
    }

    if (!leads.cols.campaign) add('warn', 'Primary Registration Campaign column not found', 'The campaign-wise report cannot be produced. Re-export with the column added (Step 3).', 'Step 3');
    else {
      if (ready(apps, 'course', 'payment') && !appsHasCampaign) {
        add('warn', 'Applications: Primary Registration Campaign column not mapped',
          'Campaign-wise Application Started / Submitted will show 0. Add the column in Meritto and map it on the upload step.', 'Step 14');
      }
      if (ready(enrol, 'course') && !enrolHasCampaign) {
        add('warn', 'Enrolments: Primary Registration Campaign column not mapped',
          'Campaign-wise Enrollment Done will show 0. Add the column in Meritto and map it on the upload step.', 'Step 11');
      }
      if (appsHasCampaign || enrolHasCampaign) {
        add('ok', 'Campaign-wise includes applications and enrolments',
          [
            appsHasCampaign ? 'Application Started / Submitted by campaign' : null,
            enrolHasCampaign ? 'Enrollment Done by campaign' : null,
          ].filter(Boolean).join('; ') + '.',
          'Steps 11, 14');
      }
    }
  }

  const newCourses = [...courses.values()].filter((c) => statusOf(c.key) === 'new');
  if (newCourses.length) {
    add('warn', `${newCourses.length} programme(s) not on the managed list — included for now`,
      `${newCourses.map((c) => c.label).join('; ')}. Decide in Programme review.`, 'Step 6',
      { type: 'reviewCourses', keys: newCourses.map((c) => c.label) });
  }

  if (ready(apps, 'course', 'payment')) {
    if (ignoredPay.size) add('info', 'Payment statuses not counted', `${listCounts(ignoredPay)}. Only Payment Pending (Started) and Payment Approved (Submitted) are used.`, 'Step 16');
    if (apps.rows.length && !started.size && !submitted.size) {
      add('warn', 'No Payment Pending / Payment Approved values found', 'Check the Payment Status column.', 'Step 16');
    }
  }

  const statusCheck = (ds, expectYes, name, doc) => {
    if (!ds || !ds.cols.enrolStatus) return;
    const bad = ds.rows.filter((r) => (keyOf(r[ds.cols.enrolStatus]) === 'YES') !== expectYes).length;
    if (bad) add('warn', `${name}: ${bad} row(s) with Enrolment Status ≠ ${expectYes ? 'Yes' : 'No'}`, 'The Meritto filter may not have been applied.', doc);
  };
  statusCheck(enrol, true, 'Part 2 enrolment export', 'Step 11');
  statusCheck(apps, false, 'Part 3 application export', 'Step 14');

  const dateCheck = (ds, field, name, doc) => {
    if (!ds || !ds.cols[field] || !week) return;
    let outside = 0;
    let unread = 0;
    for (const r of ds.rows) {
      if (!clean(r[ds.cols[field]])) continue;
      const d = parseDate(r[ds.cols[field]]);
      if (!d) unread++;
      else if (d < week.start || d > week.end) outside++;
    }
    if (outside) add('warn', `${name}: ${outside} row(s) dated outside ${weekLabel(week)}`, `Check the ${ds.cols[field]} filter in Meritto.`, doc);
    if (unread) add('info', `${name}: ${unread} date(s) in “${ds.cols[field]}” could not be read`, 'Date range not verified for those rows.', doc);
  };
  dateCheck(leads, 'leadDate', 'Part 1', 'Step 2');
  dateCheck(enrol, 'enrolDate', 'Part 2', 'Step 11');
  dateCheck(apps, 'formDate', 'Part 3', 'Step 14');

  const inReport = new Set(rows.map((r) => r.key));
  const unmatched = new Map();
  for (const [map, what] of [[enrolled, 'enrolled'], [started, 'app started'], [submitted, 'app submitted']]) {
    for (const [k, n] of map) if (!inReport.has(k)) bump(unmatched, `${courses.get(k).label} — ${what}`, n);
  }
  if (unmatched.size) {
    add('warn', 'Courses with applications/enrolments but no leads this week',
      `${listCounts(unmatched)}. Like the VLOOKUP, these are not shown in the report.`, 'Steps 13, 16');
  }

  if (totals.submitted > 0 && rows.every((r) => r.submitted === r.enrolled)) {
    // Common in the team's reports (paid applicants enrol the same week), so a note, not a warning.
    add('info', 'Application Submitted equals Enrollment Done on every row', 'Usual when paid applicants enrol the same week. If not expected, compare the Part 2 and Part 3 files.', 'Steps 13, 16');
  }

  const order = { error: 0, warn: 1, info: 2, ok: 3 };
  checks.sort((a, b) => order[a.level] - order[b.level]);

  return {
    stageCols,
    rows,
    totals,
    campaignRows,
    hasCampaign,
    leadRows,
    dnpDetail,
    courses: [...courses.values()].map((c) => ({ ...c, status: statusOf(c.key) })).sort((a, b) => compareLabels(a.label, b.label)),
    checks,
    stats: {
      fileRows: leads ? leads.rows.length : 0,
      included,
      excluded: leads ? leads.rows.length - included : 0,
      blankCourse,
      newCourses: newCourses.length,
      warnings: checks.filter((c) => c.level === 'warn').length,
      dnp: dnpTotal,
      dnpWithNotes,
      dnpNoteSum,
    },
  };
}

const toObj = (m) => Object.fromEntries(m);

/** Plain, storable snapshot of an approved week — the single source for
 *  History, period reports, Records and the Excel download. */
export function serializeWeek(report, { week, files = [], approvedAt = new Date().toISOString(), source = 'approved' }) {
  const label = weekLabel(week);
  const flat = (r) => ({
    label: r.label,
    key: r.key || keyOf(r.label),
    counts: toObj(r.counts),
    total: r.total,
    junk: r.junk,
    started: r.started ?? null,
    submitted: r.submitted ?? null,
    enrolled: r.enrolled ?? null,
    ...junkBreakdown(r.counts),
  });
  // Compact lead rows: indexes into lookup arrays keep IndexedDB small.
  // Tuple: [courseIdx, stageIdx, campaignIdx, date, subStageIdx, notes]
  // Older weeks may only have the first 4 fields — readers must tolerate that.
  const lookups = { courses: [], stages: [], campaigns: [], substages: [] };
  const idx = (arr, v) => {
    let i = arr.indexOf(v);
    if (i < 0) { arr.push(v); i = arr.length - 1; }
    return i;
  };
  const courseLabel = new Map(report.rows.map((r) => [r.key, r.label]));
  const stageLabel = new Map(report.stageCols.map((s) => [s.key, s.label]));
  const leads = report.leadRows.map((r) => [
    idx(lookups.courses, courseLabel.get(r.course) || r.course),
    idx(lookups.stages, stageLabel.get(r.stage) || r.stage),
    idx(lookups.campaigns, r.campaign),
    r.date,
    idx(lookups.substages, r.subStage || ''),
    r.notes == null ? '' : r.notes,
  ]);
  return {
    id: isoDate(week.start),
    start: isoDate(week.start),
    end: isoDate(week.end),
    label,
    source,
    approvedAt,
    files,
    stageCols: report.stageCols,
    totals: flat({ ...report.totals, key: 'GRAND TOTAL' }),
    programmes: report.rows.map(flat),
    campaigns: report.campaignRows.filter((r) => r.type === 'campaign').map((r) => ({
      course: r.course,
      label: r.label,
      counts: toObj(r.counts),
      total: r.total,
      junk: r.junk,
      started: r.started ?? 0,
      submitted: r.submitted ?? 0,
      enrolled: r.enrolled ?? 0,
      ...junkBreakdown(r.counts),
    })),
    dnpDetail: report.dnpDetail || null,
    stats: report.stats,
    checks: report.checks.map(({ level, title, detail, doc }) => ({ level, title, detail, doc })),
    rows: { ...lookups, leads },
  };
}

/** Rebuilds the report shape (Maps) from a stored week, for tables and Excel. */
export function weekToReport(w) {
  const toMap = (o) => new Map(Object.entries(o || {}));
  const withJunk = (r) => ({ ...r, counts: toMap(r.counts), junkPct: r.total ? r.junk / r.total : 0 });
  const programmes = (w.programmes || []).map(withJunk);
  const campaignRows = [];
  for (const p of programmes) {
    const cs = (w.campaigns || []).filter((c) => c.course === p.label).map((c) => ({ ...withJunk(c), type: 'campaign' }));
    if (!cs.length) continue;
    campaignRows.push({ ...p, type: 'course' });
    campaignRows.push(...cs);
  }
  return {
    stageCols: w.stageCols || [],
    rows: programmes,
    totals: { ...withJunk(w.totals), label: 'Grand Total' },
    campaignRows,
    hasCampaign: campaignRows.length > 0,
    checks: w.checks || [],
  };
}

// Tab-separated block ready to paste into the Weekly Performance sheet.
export function toTSV(report, kind, label) {
  const cell = (r, s) => r.counts.get(s.key) || '';
  const stageHeads = report.stageCols.map((s) => s.label);
  const lines = [[label]];
  if (kind === 'programme') {
    lines.push(['Row Labels', ...stageHeads, 'Grand Total', 'Junk', 'Junk %', 'Application Started', 'Application Submitted', 'Enrollment Done']);
    for (const r of [...report.rows, report.totals]) {
      lines.push([r.label, ...report.stageCols.map((s) => cell(r, s)), r.total, r.junk, pct(r.junkPct), r.started, r.submitted, r.enrolled]);
    }
  } else {
    lines.push(['Row Labels', ...stageHeads, 'Grand Total', 'Junk', 'Junk %', 'Application Started', 'Application Submitted', 'Enrollment Done']);
    for (const r of [...report.campaignRows, report.totals]) {
      lines.push([r.label, ...report.stageCols.map((s) => cell(r, s)), r.total, r.junk, pct(r.junkPct), r.started ?? 0, r.submitted ?? 0, r.enrolled ?? 0]);
    }
  }
  return lines.map((l) => l.join('\t')).join('\n');
}
