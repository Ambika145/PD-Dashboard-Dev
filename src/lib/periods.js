import {
  addDays, formatDay, formatDayShort, fromIso, isoDate, MONTH_NAMES, weekLabel, compareLabels,
  keyOf, isJunkStage, JUNK_CATEGORIES, untouchedCount, dnpCount, qualifiedCount, mergeDnpDetail, dnpDetailFromRows,
} from './junkCore.js';

const CAT_OF = new Map(JUNK_CATEGORIES.flatMap((c) => c.keys.map((k) => [k, c.id])));

/** Inclusive calendar-day span (local dates, no timezone shift). */
export function inclusiveDayCount(start, end) {
  const a = start instanceof Date ? start : fromIso(start);
  const b = end instanceof Date ? end : fromIso(end);
  return Math.round((b - a) / 864e5) + 1;
}

export function weekBounds(w) {
  const start = fromIso(w.start || w.id);
  const end = w.end ? fromIso(w.end) : addDays(fromIso(w.id), 6);
  return { start, end };
}

const overlaps = (a0, a1, b0, b1) => a0 <= b1 && a1 >= b0;

export const PERIOD_TYPES = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'quarter', label: 'Quarter' },
  { id: 'five', label: '5 months' },
  { id: 'year', label: 'Year' },
  { id: 'custom', label: 'Custom' },
];

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const parseMonth = (s) => {
  const [y, m] = s.split('-').map(Number);
  return { y, m: m - 1 };
};
const monthSpan = (a, b) =>
  a.getFullYear() === b.getFullYear()
    ? `${MONTH_NAMES[a.getMonth()].slice(0, 3)} – ${MONTH_NAMES[b.getMonth()].slice(0, 3)} ${b.getFullYear()}`
    : `${MONTH_NAMES[a.getMonth()].slice(0, 3)} ${a.getFullYear()} – ${MONTH_NAMES[b.getMonth()].slice(0, 3)} ${b.getFullYear()}`;

/** Anchor formats — week: 'YYYY-MM-DD' (Wednesday); month & five: 'YYYY-MM'
 *  (five = the 5 months ending in that month); quarter: 'YYYY-Qn'; year: 'YYYY';
 *  custom: { start, end } ISO dates. */
export function periodRange(type, anchor) {
  if (type === 'week') {
    const start = fromIso(anchor);
    const end = addDays(start, 6);
    return { type, anchor, start, end, label: weekLabel({ start, end }) };
  }
  if (type === 'month') {
    const { y, m } = parseMonth(anchor);
    return { type, anchor, start: new Date(y, m, 1), end: new Date(y, m + 1, 0), label: `${MONTH_NAMES[m]} ${y}` };
  }
  if (type === 'quarter') {
    const [y, q] = anchor.split('-Q').map(Number);
    const start = new Date(y, (q - 1) * 3, 1);
    const end = new Date(y, q * 3, 0);
    return { type, anchor, start, end, label: `Q${q} ${y} (${monthSpan(start, end)})` };
  }
  if (type === 'five') {
    const { y, m } = parseMonth(anchor);
    const start = new Date(y, m - 4, 1);
    const end = new Date(y, m + 1, 0);
    return { type, anchor, start, end, label: `5 months: ${monthSpan(start, end)}` };
  }
  if (type === 'year') {
    const y = Number(anchor);
    return { type, anchor, start: new Date(y, 0, 1), end: new Date(y, 11, 31), label: String(y) };
  }
  // Custom: any inclusive start→end (2 days, 7 days, etc.). Normalize order.
  let start = fromIso(anchor.start);
  let end = fromIso(anchor.end);
  if (end < start) { const tmp = start; start = end; end = tmp; }
  const days = inclusiveDayCount(start, end);
  return {
    type: 'custom',
    anchor: { start: isoDate(start), end: isoDate(end) },
    start,
    end,
    label: days === 1 ? formatDay(start) : `${formatDay(start)} – ${formatDay(end)} (${days} days)`,
  };
}

export function previousRange(r) {
  const shiftMonth = (anchor, n) => {
    const { y, m } = parseMonth(anchor);
    return monthKey(new Date(y, m + n, 1));
  };
  if (r.type === 'week') return periodRange('week', isoDate(addDays(r.start, -7)));
  if (r.type === 'month') return periodRange('month', shiftMonth(r.anchor, -1));
  if (r.type === 'five') return periodRange('five', shiftMonth(r.anchor, -5));
  if (r.type === 'year') return periodRange('year', String(Number(r.anchor) - 1));
  if (r.type === 'quarter') {
    const [y, q] = r.anchor.split('-Q').map(Number);
    return periodRange('quarter', q === 1 ? `${y - 1}-Q4` : `${y}-Q${q - 1}`);
  }
  const days = Math.round((r.end - r.start) / 864e5) + 1;
  return periodRange('custom', { start: isoDate(addDays(r.start, -days)), end: isoDate(addDays(r.start, -1)) });
}

/** A week (Wed → Tue) belongs to the period in which its Tuesday falls.
 *  Used for month / quarter / five / year. Custom ranges use overlap instead. */
export function weekIdsEndingIn(r) {
  if (r.type === 'week') return [isoDate(r.start)];
  if (r.type === 'custom') return overlappingWeekIds(r);
  const ids = [];
  let t = new Date(r.start);
  while (t.getDay() !== 2) t = addDays(t, 1);
  for (; t <= r.end; t = addDays(t, 7)) ids.push(isoDate(addDays(t, -6)));
  return ids;
}

/** Wed→Tue weeks whose calendar span overlaps [r.start, r.end] (inclusive). */
export function overlappingWeekIds(r) {
  const ids = [];
  // Earliest Wednesday that could still overlap: 6 days before range start, aligned to Wed.
  let wed = addDays(r.start, -6);
  while (wed.getDay() !== 3) wed = addDays(wed, 1);
  // Step back one more week if that earlier week still overlaps.
  const prev = addDays(wed, -7);
  if (overlaps(prev, addDays(prev, 6), r.start, r.end)) wed = prev;
  for (; wed <= r.end; wed = addDays(wed, 7)) {
    const tue = addDays(wed, 6);
    if (overlaps(wed, tue, r.start, r.end)) ids.push(isoDate(wed));
  }
  return ids;
}

export function weeksIn(r, weeks) {
  if (r.type === 'custom') {
    return weeks
      .filter((w) => {
        const { start, end } = weekBounds(w);
        return overlaps(start, end, r.start, r.end);
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }
  const ids = new Set(weekIdsEndingIn(r));
  return weeks.filter((w) => ids.has(w.id)).sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * For custom ranges: when a week has lead-level dates, keep only leads inside
 * [start, end] and rebuild totals. Weeks without row dates stay as full weeks
 * (imported history). Returns null when a detailed week has zero leads in range.
 */
export function sliceWeekToCustomDates(w, startIso, endIso) {
  const leads = w.rows?.leads;
  if (!leads?.length) return { ...w, customSliced: false };
  // No usable registration dates → keep the full reporting week (same as imported history).
  const anyDated = leads.some((row) => row[3]);
  if (!anyDated) return { ...w, customSliced: false };
  const kept = leads.filter((row) => {
    const d = row[3];
    return d && d >= startIso && d <= endIso;
  });
  if (kept.length === leads.length) return { ...w, customSliced: false };
  // Empty slice: keep the week id for completeness, with zero lead totals.

  const { courses, stages, campaigns, substages = [] } = w.rows;
  const prog = new Map();
  const camp = new Map();
  const stageCols = new Map((w.stageCols || []).map((s) => [s.key, s]));
  let total = 0; let junk = 0; let jl = 0; let fin = 0; let ni = 0;

  const bumpProg = (courseLabel, stageKey) => {
    const key = keyOf(courseLabel);
    if (!prog.has(key)) {
      prog.set(key, {
        key, label: courseLabel, counts: {}, total: 0, junk: 0, jl: 0, fin: 0, ni: 0,
        started: 0, submitted: 0, enrolled: 0,
      });
    }
    const p = prog.get(key);
    p.counts[stageKey] = (p.counts[stageKey] || 0) + 1;
    p.total += 1;
    if (isJunkStage(stageKey)) {
      p.junk += 1;
      const cat = CAT_OF.get(stageKey);
      if (cat === 'jl') p.jl += 1;
      else if (cat === 'fin') p.fin += 1;
      else if (cat === 'ni') p.ni += 1;
    }
  };

  for (const [ci, si, ki] of kept) {
    const course = courses[ci];
    const stage = stages[si];
    const campaign = campaigns[ki];
    const sk = keyOf(stage);
    if (!stageCols.has(sk)) stageCols.set(sk, { key: sk, label: stage });
    total += 1;
    if (isJunkStage(sk)) {
      junk += 1;
      const cat = CAT_OF.get(sk);
      if (cat === 'jl') jl += 1;
      else if (cat === 'fin') fin += 1;
      else if (cat === 'ni') ni += 1;
    }
    bumpProg(course, sk);
    if (campaign) {
      const ck = `${course}\u0000${campaign}`;
      if (!camp.has(ck)) {
        camp.set(ck, {
          course, label: campaign, total: 0, junk: 0, jl: 0, fin: 0, ni: 0,
          // Apps / enrolments are week-scoped files, not day-sliced with leads.
          started: null, submitted: null, enrolled: null,
        });
      }
      const c = camp.get(ck);
      c.total += 1;
      if (isJunkStage(sk)) {
        c.junk += 1;
        const cat = CAT_OF.get(sk);
        if (cat === 'jl') c.jl += 1;
        else if (cat === 'fin') c.fin += 1;
        else if (cat === 'ni') c.ni += 1;
      }
    }
  }

  const slicedRows = { courses, stages, campaigns, substages, leads: kept };
  return {
    ...w,
    customSliced: true,
    label: `${w.label} (filtered)`,
    stageCols: [...stageCols.values()],
    totals: {
      ...w.totals,
      total, junk, jl, fin, ni,
      // Application / enrolment exports are week-scoped, not day-scoped.
      started: null, submitted: null, enrolled: null,
    },
    programmes: [...prog.values()],
    campaigns: [...camp.values()],
    dnpDetail: dnpDetailFromRows(slicedRows),
    rows: slicedRows,
    stats: { ...(w.stats || {}), customFilteredLeads: kept.length, customSourceLeads: leads.length },
  };
}

/** Apply custom date slicing when the period is custom; otherwise return weeks as-is. */
export function prepareWeeksForPeriod(weeks, range) {
  if (!range || range.type !== 'custom') return weeks;
  const startIso = isoDate(range.start);
  const endIso = isoDate(range.end);
  return weeks.map((w) => sliceWeekToCustomDates(w, startIso, endIso)).filter(Boolean);
}

/** Which weeks the period should contain, which are present, and whether
 *  the period is over — used to label partial periods honestly. */
export function completeness(r, weeks, today = new Date()) {
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const all = weekIdsEndingIn(r);
  const ended = all.filter((id) => addDays(fromIso(id), 6) < t0);
  const have = new Set(weeks.map((w) => w.id));
  const missing = ended.filter((id) => !have.has(id));
  const notYet = all.length - ended.length;
  const periodOver = r.end < t0;
  return {
    expected: all.length,
    ended: ended.length,
    present: ended.filter((id) => have.has(id)).length,
    missing: missing.map((id) => weekLabel({ start: fromIso(id), end: addDays(fromIso(id), 6) })),
    notYet,
    periodOver,
    complete: all.length > 0 && periodOver && missing.length === 0,
  };
}

const addCounts = (into, from) => {
  for (const [k, n] of Object.entries(from || {})) into[k] = (into[k] || 0) + n;
};

/** Aggregates stored weeks. Period Junk % = total Junk ÷ total leads
 *  (never an average of weekly percentages). */
export function aggregate(weeks) {
  const t = { total: 0, junk: 0, started: 0, submitted: 0, enrolled: 0 };
  const cat = { total: 0, junk: 0, jl: 0, fin: 0, ni: 0 };
  const stats = { excluded: 0, blankCourse: 0, warnings: 0 };
  let weeksNoApps = 0;
  let weeksNoCats = 0;
  let weeksDetailed = 0;
  const prog = new Map();
  const camp = new Map();
  const stageCols = new Map();

  for (const w of weeks) {
    t.total += w.totals.total;
    t.junk += w.totals.junk;
    if (w.totals.started === null || w.totals.started === undefined) weeksNoApps++;
    else {
      t.started += w.totals.started;
      t.submitted += w.totals.submitted;
      t.enrolled += w.totals.enrolled;
    }
    if (w.totals.jl === null || w.totals.jl === undefined) weeksNoCats++;
    else {
      cat.total += w.totals.total;
      cat.junk += w.totals.junk;
      cat.jl += w.totals.jl;
      cat.fin += w.totals.fin;
      cat.ni += w.totals.ni;
    }
    if (w.stats) {
      stats.excluded += w.stats.excluded || 0;
      stats.blankCourse += w.stats.blankCourse || 0;
      stats.warnings += w.stats.warnings || 0;
    }
    if (w.programmes && w.programmes.length) {
      weeksDetailed++;
      (w.stageCols || []).forEach((s) => stageCols.set(s.key, s));
      for (const p of w.programmes) {
        if (!prog.has(p.key)) prog.set(p.key, { key: p.key, label: p.label, counts: {}, total: 0, junk: 0, jl: 0, fin: 0, ni: 0, started: 0, submitted: 0, enrolled: 0 });
        const a = prog.get(p.key);
        addCounts(a.counts, p.counts);
        for (const f of ['total', 'junk', 'jl', 'fin', 'ni', 'started', 'submitted', 'enrolled']) a[f] += p[f] || 0;
      }
      for (const c of w.campaigns || []) {
        const k = `${c.course}\u0000${c.label}`;
        if (!camp.has(k)) {
          camp.set(k, {
            course: c.course, label: c.label,
            total: 0, junk: 0, jl: 0, fin: 0, ni: 0,
            started: 0, submitted: 0, enrolled: 0,
          });
        }
        const a = camp.get(k);
        for (const f of ['total', 'junk', 'jl', 'fin', 'ni', 'started', 'submitted', 'enrolled']) a[f] += c[f] || 0;
      }
    }
  }
  const withPct = (x) => {
    const untouched = untouchedCount(x.counts);
    const dnp = dnpCount(x.counts);
    const qualified = qualifiedCount(x.counts);
    return {
      ...x,
      junkPct: x.total ? x.junk / x.total : 0,
      untouched,
      untouchedPct: x.total ? untouched / x.total : 0,
      dnp,
      dnpPct: x.total ? dnp / x.total : 0,
      qualified,
      qualifiedPct: x.total ? qualified / x.total : 0,
    };
  };
  const programmes = [...prog.values()].map(withPct).sort((a, b) => compareLabels(a.label, b.label));
  const untouched = programmes.reduce((s, p) => s + (p.untouched || 0), 0);
  const dnp = programmes.reduce((s, p) => s + (p.dnp || 0), 0);
  const qualified = programmes.reduce((s, p) => s + (p.qualified || 0), 0);
  const dnpDetail = mergeDnpDetail(weeks);
  return {
    totals: {
      ...withPct(t),
      untouched,
      untouchedPct: t.total ? untouched / t.total : 0,
      dnp,
      dnpPct: t.total ? dnp / t.total : 0,
      qualified,
      qualifiedPct: t.total ? qualified / t.total : 0,
    },
    categories: { ...cat, other: cat.total - cat.junk },
    stats,
    weeks: weeks.length,
    weeksNoApps,
    weeksNoCats,
    weeksDetailed,
    weeksImported: weeks.filter((w) => w.source === 'imported').length,
    dnpDetail,
    programmes,
    campaigns: [...camp.values()].map(withPct),
    stageCols: [...stageCols.values()].sort((a, b) => compareLabels(a.label, b.label)),
    series: weeks.map((w) => {
      const u = (w.programmes || []).reduce((s, p) => s + untouchedCount(p.counts), 0);
      const d = (w.programmes || []).reduce((s, p) => s + dnpCount(p.counts), 0);
      const q = (w.programmes || []).reduce((s, p) => s + qualifiedCount(p.counts), 0);
      return {
        id: w.id,
        label: w.label,
        short: formatDayShort(fromIso(w.id)),
        total: w.totals.total,
        junk: w.totals.junk,
        junkPct: w.totals.total ? w.totals.junk / w.totals.total : 0,
        qualified: q,
        dnp: d,
        untouched: u,
        untouchedPct: w.totals.total ? u / w.totals.total : 0,
        started: w.totals.started ?? null,
        submitted: w.totals.submitted ?? null,
        enrolled: w.totals.enrolled ?? null,
        jl: w.totals.jl ?? null,
        fin: w.totals.fin ?? null,
        ni: w.totals.ni ?? null,
        source: w.source,
      };
    }),
  };
}

/** Options for the anchor picker, spanning the stored history and today. */
export function anchorOptions(type, weeks, today = new Date()) {
  const ids = weeks.map((w) => w.id).sort();
  const first = ids.length ? fromIso(ids[0]) : today;
  const last = today;
  const opts = [];
  if (type === 'week') {
    return [...weeks].sort((a, b) => b.id.localeCompare(a.id)).map((w) => ({ value: w.id, label: w.label }));
  }
  if (type === 'month' || type === 'five') {
    for (let d = new Date(last.getFullYear(), last.getMonth(), 1); d >= new Date(first.getFullYear(), first.getMonth(), 1); d = new Date(d.getFullYear(), d.getMonth() - 1, 1)) {
      const r = periodRange(type, monthKey(d));
      opts.push({ value: monthKey(d), label: type === 'month' ? r.label : r.label.replace('5 months: ', '') });
    }
  }
  if (type === 'quarter') {
    for (let d = new Date(last.getFullYear(), Math.floor(last.getMonth() / 3) * 3, 1); d >= new Date(first.getFullYear(), Math.floor(first.getMonth() / 3) * 3, 1); d = new Date(d.getFullYear(), d.getMonth() - 3, 1)) {
      const a = `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
      opts.push({ value: a, label: periodRange('quarter', a).label });
    }
  }
  if (type === 'year') {
    for (let y = last.getFullYear(); y >= first.getFullYear(); y--) opts.push({ value: String(y), label: String(y) });
  }
  return opts;
}

export function defaultAnchor(type, weeks, today = new Date()) {
  const latest = [...weeks].sort((a, b) => b.id.localeCompare(a.id))[0];
  const ref = latest ? fromIso(latest.end) : today;
  if (type === 'week') return latest ? latest.id : null;
  if (type === 'month' || type === 'five') return monthKey(ref);
  if (type === 'quarter') return `${ref.getFullYear()}-Q${Math.floor(ref.getMonth() / 3) + 1}`;
  if (type === 'year') return String(ref.getFullYear());
  return { start: isoDate(addDays(ref, -27)), end: isoDate(ref) };
}
