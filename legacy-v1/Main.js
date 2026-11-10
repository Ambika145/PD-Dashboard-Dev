'use strict';

/* =====================================================================
   Core logic — pure functions that reproduce the documented manual
   process (_Junk Analysis Process.md). No DOM access, testable in Node.
   ===================================================================== */
const JunkCore = (() => {
  const BLANK = '(blank)';

  // Doc Step 6 — programmes not managed by the team.
  const DEFAULT_EXCLUDED = [
    'BACHELOR OF SCIENCE IN PSYCHOLOGY',
    'COURSE NOT AVAILABLE',
    'M.SC. IN FAMILY BUSINESS',
    'M.SC. IN STRATEGIC COMMUNICATION',
    "MASTER'S OF DESIGN IN USER EXPERIENCE",
    BLANK,
  ];

  // Programmes that appear in the team's past weekly reports. Anything not
  // here and not excluded is flagged for a decision ("check which
  // programmes are managed by the team").
  const DEFAULT_MANAGED = [
    'B.COM (INTERNATIONAL ACCOUNTING AND FINANCE)',
    'B.SC. IN ARTIFICIAL INTELLIGENCE & FINANCE',
    'B.SC. IN AI & FINANCE',
    'B.SC. IN FINANCE & ENTREPRENEURSHIP',
    'BACHELORS PROGRAMME',
    'M.A. IN CRIMINOLOGY & CRIMINAL JUSTICE',
    'M.A. IN EDUCATIONAL LEADERSHIP AND GOVERNANCE',
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
    'MASTER OF ARTS (M.A.) IN ELECTORAL ANALYSIS AND MANAGEMENT',
    'MASTER OF ARTS (MA) IN POLITICAL COMMUNICATION',
    'MASTER OF ARTS IN TEACHING ENGLISH TO SPEAKERS OF OTHER LANGUAGES (TESOL)',
    'MASTERS IN ELECTORAL MANAGEMENT',
    'MASTERS IN ENVIRONMENTAL CHANGE AND SUSTAINABILITY',
    'MASTERS IN GLOBAL HEALTH AND HUMAN DEVELOPMENT',
    'MBA IN BUSINESS ANALYTICS',
  ];

  // Lead stages seen in past reports; a stage outside this list is reported.
  const DEFAULT_KNOWN_STAGES = [
    'ALREADY ENROLLED - UPGRAD / COUSERA / OP JINDAL', 'APP - REJECTED', 'APP SUBMITTED',
    'CONNECTED ON EMAIL', 'CONNECTED ON WHATSAPP', 'COUNSELLED', 'COURSERA PROSPECT',
    'DID NOT PICK (DNP)', 'DOCUMENT REJECTED', 'ENROLLED WITH ANOTHER UNIVERSITY',
    'FINANCIAL BARRIER', 'FOLLOW UP - POST COUNSELLED', 'INTERESTED IN NEXT COHORT WARM',
    'JUNK LEAD', 'NOT INTERESTED IN THE PROGRAM', 'OL SENT', 'PROSPECT',
    'REATTEMPT UNTOUCHED', 'REGISTRATION FEE PAID', 'REQUEST CALL BACK', 'UNTOUCHED',
    'WEBINAR PROSPECT', BLANK,
  ];

  // Doc Step 8 — Junk = Financial Barrier + Junk + Not Interested in the Programme.
  const JUNK_GROUPS = {
    'Financial Barrier': ['FINANCIAL BARRIER'],
    'Junk': ['JUNK LEAD', 'JUNK'],
    'Not Interested in the Programme': [
      'NOT INTERESTED IN THE PROGRAM', 'NOT INTERESTED IN THE PROGRAMME', 'NOT INTERESTED IN PROGRAMME',
    ],
  };
  const JUNK_STAGE_KEYS = new Set(Object.values(JUNK_GROUPS).flat());

  const FIELD_CANDIDATES = {
    course: ['course', 'course name', 'programme', 'program', 'programme name', 'program name'],
    stage: ['lead stage', 'stage'],
    campaign: ['primary registration campaign', 'registration campaign', 'primary campaign', 'campaign'],
    payment: ['payment status', 'application payment status'],
    enrolStatus: ['enrolment status', 'enrollment status'],
    leadDate: ['user registration date', 'registration date', 'registered on', 'lead created date', 'created on'],
    enrolDate: ['enrolment date', 'enrollment date'],
    formDate: ['form starting date', 'form start date', 'form started on', 'application start date'],
  };

  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  // Normalises text the way an Excel pivot groups it, and repairs the
  // UTF-8/Latin-1 artefact seen in past reports ("SECURITY ANDÂ STRATEGY").
  function clean(v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/^﻿/, '')
      .replace(/Â(?=[\s ])/g, '')
      .replace(/[   ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  const keyOf = (v) => (clean(v) ? clean(v).toUpperCase() : BLANK.toUpperCase());
  const labelOf = (v) => clean(v) || BLANK;

  function compareLabels(a, b) {
    if (a === b) return 0;
    if (a === BLANK) return 1;
    if (b === BLANK) return -1;
    return a.localeCompare(b, 'en', { sensitivity: 'base' });
  }

  function detectColumn(headers, field) {
    const norm = headers.map((h) => clean(h).toLowerCase());
    for (const c of FIELD_CANDIDATES[field]) {
      const i = norm.indexOf(c);
      if (i >= 0) return headers[i];
    }
    for (const c of FIELD_CANDIDATES[field]) {
      const i = norm.findIndex((h) => h.includes(c));
      if (i >= 0) return headers[i];
    }
    return '';
  }

  function makeDate(y, m, d) {
    const dt = new Date(y, m, d);
    return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d ? dt : null;
  }

  // Accepts ISO, DD-MM-YYYY / DD/MM/YYYY (Indian order), "14 Oct 2026", "Oct 14, 2026".
  function parseDate(v) {
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

  function addDays(d, n) {
    const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    r.setDate(r.getDate() + n);
    return r;
  }

  // Reporting week is Wednesday → Tuesday; default is the last completed one.
  function defaultWeek(today = new Date()) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let back = (d.getDay() - 2 + 7) % 7;
    if (back === 0) back = 7;
    const end = addDays(d, -back);
    return { start: addDays(end, -6), end };
  }

  const shortMonth = (d) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  const formatDay = (d) => `${d.getDate()} ${shortMonth(d)} ${d.getFullYear()}`;
  const isoDate = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // Same heading style as the past reports: "14 Oct - 20 Oct 2026".
  function weekLabel(week) {
    const { start, end } = week;
    const a = start.getFullYear() === end.getFullYear() ? `${start.getDate()} ${shortMonth(start)}` : formatDay(start);
    return `${a} - ${formatDay(end)}`;
  }

  const bump = (map, k, n = 1) => map.set(k, (map.get(k) || 0) + n);
  const pct = (v) => `${Math.round(v * 100)}%`;

  function summarise(counts) {
    let total = 0;
    let junk = 0;
    for (const [k, n] of counts) {
      total += n;
      if (JUNK_STAGE_KEYS.has(k)) junk += n;
    }
    return { total, junk, junkPct: total ? junk / total : 0 };
  }

  const listCounts = (map) =>
    [...map.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} (${n})`).join('; ');

  /**
   * Builds the weekly report.
   * Each dataset: { name, rows: [{header: value}], cols: {field: header} } or null.
   */
  function buildReport({ leads, enrol, apps, settings, week }) {
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

    // ---- Inputs present -------------------------------------------------
    const inputs = [
      ['Part 1 leads export', leads, ['course', 'stage'], 'Steps 2–4'],
      ['Part 2 enrolment export', enrol, ['course'], 'Steps 10–12'],
      ['Part 3 application export', apps, ['course', 'payment'], 'Steps 14–15'],
    ];
    for (const [name, ds, req, doc] of inputs) {
      if (!ds) add('error', `${name} not uploaded`, 'All three Meritto exports are needed for the weekly report.', doc);
      else {
        const missing = req.filter((f) => !ds.cols[f]);
        if (missing.length) add('error', `${name}: column not mapped — ${missing.join(', ')}`, 'Choose the matching column in the upload card.', doc);
      }
    }

    // ---- Part 1 · Steps 5, 6, 8 ----------------------------------------
    const stageLabel = new Map();
    const matrix = new Map();
    const camp = new Map();
    const excCounts = new Map();
    let included = 0;
    const hasCampaign = ready(leads, 'course', 'stage') && !!leads.cols.campaign;

    if (ready(leads, 'course', 'stage')) {
      for (const r of leads.rows) {
        const c = course(r[leads.cols.course]);
        c.leads++;
        if (excluded.has(c.key)) {
          bump(excCounts, c.label);
          continue;
        }
        included++;
        const sk = keyOf(r[leads.cols.stage]);
        if (!stageLabel.has(sk)) stageLabel.set(sk, labelOf(r[leads.cols.stage]));
        if (!matrix.has(c.key)) matrix.set(c.key, new Map());
        bump(matrix.get(c.key), sk);
        if (hasCampaign) {
          if (!camp.has(c.key)) camp.set(c.key, new Map());
          const cm = camp.get(c.key);
          const ck = keyOf(r[leads.cols.campaign]);
          if (!cm.has(ck)) cm.set(ck, { label: labelOf(r[leads.cols.campaign]), counts: new Map() });
          bump(cm.get(ck).counts, sk);
        }
      }
    }

    const stageCols = [...stageLabel.keys()]
      .sort((a, b) => compareLabels(stageLabel.get(a), stageLabel.get(b)))
      .map((key) => ({ key, label: stageLabel.get(key), junk: JUNK_STAGE_KEYS.has(key) }));

    // ---- Part 2 · Step 13 (Enrollment Done) ----------------------------
    const enrolled = new Map();
    if (ready(enrol, 'course')) {
      for (const r of enrol.rows) {
        const c = course(r[enrol.cols.course]);
        c.enrol++;
        if (!excluded.has(c.key)) bump(enrolled, c.key);
      }
    }

    // ---- Part 3 · Step 16 (Payment Pending / Approved) -----------------
    const started = new Map();
    const submitted = new Map();
    const ignoredPay = new Map();
    if (ready(apps, 'course', 'payment')) {
      for (const r of apps.rows) {
        const c = course(r[apps.cols.course]);
        c.apps++;
        if (excluded.has(c.key)) continue;
        const pk = keyOf(r[apps.cols.payment]);
        if (pk.includes('PENDING')) bump(started, c.key);
        else if (pk.includes('APPROVED')) bump(submitted, c.key);
        else bump(ignoredPay, labelOf(r[apps.cols.payment]));
      }
    }

    // ---- Weekly Performance sheet rows (VLOOKUP by course; no match → 0)
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

    // ---- Campaign-wise (Course → Primary Registration Campaign) --------
    const campaignRows = [];
    if (hasCampaign) {
      for (const r of rows) {
        campaignRows.push({ type: 'course', label: r.label, counts: r.counts, ...summarise(r.counts) });
        [...camp.get(r.key).values()]
          .sort((a, b) => compareLabels(a.label, b.label))
          .forEach((v) => campaignRows.push({ type: 'campaign', label: v.label, counts: v.counts, ...summarise(v.counts) }));
      }
    }

    // ---- Checks ---------------------------------------------------------
    if (ready(leads, 'course', 'stage')) {
      const exc = leads.rows.length - included;
      add('ok', 'Leads reconciled',
        `${leads.rows.length} rows in file = ${included} counted + ${exc} excluded.` + (exc ? ` Excluded: ${listCounts(excCounts)}.` : ''),
        'Steps 5–6');
      if (!rows.length) add('error', 'No leads left after exclusions', 'Check the file and the exclusion list.', 'Step 6');

      const found = Object.entries(JUNK_GROUPS).filter(([, keys]) => keys.some((k) => stageLabel.has(k)));
      if (!found.length) {
        add('warn', 'None of the three junk stages were found', 'Expected FINANCIAL BARRIER, JUNK LEAD, NOT INTERESTED IN THE PROGRAM. Check the Lead Stage column mapping.', 'Step 8');
      } else {
        add('ok', `Junk = ${stageCols.filter((s) => s.junk).map((s) => s.label).join(' + ')}`,
          `${totals.junk} of ${totals.total} leads → Junk % ${pct(totals.junkPct)}.`, 'Step 8');
        const absent = Object.keys(JUNK_GROUPS).filter((g) => !found.some(([name]) => name === g));
        if (absent.length) add('info', `Junk stage(s) with no leads this week: ${absent.join(', ')}`, '', 'Step 8');
      }

      const newStages = stageCols.filter((s) => !knownStages.has(s.key));
      if (newStages.length) {
        add('info', `${newStages.length} lead stage(s) not seen in past reports`,
          `${newStages.map((s) => s.label).join('; ')} — shown as pivot columns, not counted as Junk.`, 'Step 5',
          { type: 'knowStages', keys: newStages.map((s) => s.label) });
      }

      if (!leads.cols.campaign) add('warn', 'Primary Registration Campaign column not found', 'The campaign-wise report cannot be produced. Re-export with the column added (Step 3).', 'Step 3');
    }

    const newCourses = [...courses.values()].filter((c) => statusOf(c.key) === 'new');
    if (newCourses.length) {
      add('warn', `${newCourses.length} programme(s) not on the managed list — included for now`,
        `${newCourses.map((c) => c.label).join('; ')}. Confirm in Programme review.`, 'Step 6');
    }

    if (ready(apps, 'course', 'payment')) {
      if (ignoredPay.size) add('info', 'Payment statuses not counted', `${listCounts(ignoredPay)}. Only Payment Pending (Started) and Payment Approved (Submitted) are used.`, 'Step 16');
      if (apps.rows.length && !started.size && !submitted.size) {
        add('warn', 'No Payment Pending / Payment Approved values found', 'Check the Payment Status column mapping.', 'Step 16');
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
      add('warn', 'Application Submitted equals Enrollment Done on every row', 'This usually means a copy error — compare the Part 2 and Part 3 files.', 'Steps 13, 16');
    }

    const order = { error: 0, warn: 1, info: 2, ok: 3 };
    checks.sort((a, b) => order[a.level] - order[b.level]);

    return {
      stageCols,
      rows,
      totals,
      campaignRows,
      hasCampaign,
      courses: [...courses.values()].map((c) => ({ ...c, status: statusOf(c.key) })).sort((a, b) => compareLabels(a.label, b.label)),
      checks,
    };
  }

  // Tab-separated block ready to paste into the Weekly Performance sheet.
  function toTSV(report, kind, label) {
    const cell = (r, s) => r.counts.get(s.key) || '';
    const stageHeads = report.stageCols.map((s) => s.label);
    const lines = [[label]];
    if (kind === 'programme') {
      lines.push(['Row Labels', ...stageHeads, 'Grand Total', 'Junk', 'Junk %', 'Application Started', 'Application Submitted', 'Enrollment Done']);
      for (const r of [...report.rows, report.totals]) {
        lines.push([r.label, ...report.stageCols.map((s) => cell(r, s)), r.total, r.junk, pct(r.junkPct), r.started, r.submitted, r.enrolled]);
      }
    } else {
      lines.push(['Row Labels', ...stageHeads, 'Grand Total', 'Junk', 'Junk %']);
      for (const r of [...report.campaignRows, report.totals]) {
        lines.push([r.label, ...report.stageCols.map((s) => cell(r, s)), r.total, r.junk, pct(r.junkPct)]);
      }
    }
    return lines.map((l) => l.join('\t')).join('\n');
  }

  return {
    BLANK, DEFAULT_EXCLUDED, DEFAULT_MANAGED, DEFAULT_KNOWN_STAGES, JUNK_GROUPS, FIELD_CANDIDATES,
    clean, keyOf, labelOf, detectColumn, parseDate, addDays, defaultWeek, weekLabel, formatDay, isoDate,
    pct, buildReport, toTSV,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = JunkCore;

/* =====================================================================
   Dashboard UI
   ===================================================================== */
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', initApp);

function initApp() {
  const C = JunkCore;
  const STORE_KEY = 'pdJunk.v1';

  const DATASETS = {
    leads: {
      step: 2, part: 'Part 1', title: 'Leads export (programme & campaign-wise)',
      docExport: 'Doc Steps 2–4', docCalc: 'Steps 5, 6, 8',
      fields: [
        { f: 'course', label: 'Course', req: true },
        { f: 'stage', label: 'Lead Stage', req: true },
        { f: 'campaign', label: 'Primary Registration Campaign', req: false },
        { f: 'leadDate', label: 'User Registration Date', req: false },
      ],
      steps: (w) => [
        'Open <b>Meritto</b> → <b>Lead Manager → Manage Leads</b>.',
        `Go to <b>User Registration Date</b> → custom range <b>${w.from}</b> to <b>${w.to}</b> → click the blue <b>Apply</b> button.`,
        'Top right, beside Search: <b>Customise Columns</b> → <b>Columns</b> → add <b>Course</b> and <b>Primary Registration Campaign</b> → <b>Apply</b>.',
        '<b>Download Leads</b> → <b>View Export</b> → search for <b>Course</b> and select it → <b>Apply</b> → choose <b>CSV</b> → <b>Download</b>.',
        '<b>View Export Status</b> → on the User Request Report page wait ~10 seconds and refresh → first row, last column → <b>⋮</b> beside 0 → download.',
        'Upload the file below with <b>all courses</b> — unmanaged programmes are removed here (Step 6).',
      ],
    },
    enrol: {
      step: 3, part: 'Part 2', title: 'Enrolment export (Enrollment Done)',
      docExport: 'Doc Steps 10–12', docCalc: 'Step 13',
      fields: [
        { f: 'course', label: 'Course', req: true },
        { f: 'enrolStatus', label: 'Enrolment Status', req: false },
        { f: 'enrolDate', label: 'Enrolment Date', req: false },
      ],
      steps: (w) => [
        'Open <b>Meritto</b> → <b>Application Manager → Manage Application</b> → <b>Advanced Filter</b> (top left).',
        '<b>Select Field</b> → <b>Enrolment Status</b> → <b>Equal</b> → <b>Yes</b>.',
        `Click <b>+</b> → <b>Enrolment Date</b> → <b>Between</b> → <b>${w.from}</b> to <b>${w.to}</b> → <b>Apply</b>.`,
        'Select <b>Course</b> in the columns → <b>Download Application</b> → <b>Click Here</b>.',
        'Wait ~10 seconds, refresh → first row, last column → <b>⋮</b> beside 0 → download.',
      ],
    },
    apps: {
      step: 4, part: 'Part 3', title: 'Application export (Started & Submitted)',
      docExport: 'Doc Steps 14–15', docCalc: 'Step 16',
      fields: [
        { f: 'course', label: 'Course', req: true },
        { f: 'payment', label: 'Payment Status', req: true },
        { f: 'enrolStatus', label: 'Enrolment Status', req: false },
        { f: 'formDate', label: 'Form Starting Date', req: false },
      ],
      steps: (w) => [
        'Open <b>Meritto</b> → <b>Application Manager → Manage Application</b> → <b>Advanced Filter</b>.',
        '<b>Enrolment Status</b> → <b>Equal</b> → <b>No</b>.',
        `Click <b>+</b> → <b>Form Starting Date</b> → <b>Between</b> → <b>${w.from}</b> to <b>${w.to}</b> → <b>Apply</b>.`,
        'Select <b>Course</b> in the columns → <b>Application Download</b> → download the file.',
        'Payment Pending = <b>Application Started</b>; Payment Approved = <b>Application Submitted</b>.',
      ],
    },
  };

  const defaults = () => ({
    excluded: [...C.DEFAULT_EXCLUDED],
    managed: [...C.DEFAULT_MANAGED],
    knownStages: [...C.DEFAULT_KNOWN_STAGES],
    threshold: 50,
    history: [],
  });

  function loadStore() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      if (saved) return { ...defaults(), ...saved };
    } catch (e) { /* storage unavailable */ }
    return defaults();
  }
  function saveStore() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* storage unavailable */ }
  }

  let store = loadStore();
  const state = {
    tab: 'run',
    week: C.defaultWeek(),
    files: { leads: null, enrol: null, apps: null },
    report: null,
    view: 'programme',
    reviewed: false,
  };

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const fmtN = (n) => (n ? n.toLocaleString('en-IN') : '');
  const settings = () => ({ excluded: store.excluded, managed: store.managed, knownStages: store.knownStages });

  function toast(msg, kind = 'ok') {
    const t = document.createElement('div');
    t.className = `toast toast-${kind}`;
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }

  // ---------------- File parsing ----------------
  function cellText(v) {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
    if (typeof v === 'object') {
      if (v.richText) return v.richText.map((p) => p.text).join('');
      if ('result' in v) return cellText(v.result);
      if ('text' in v) return String(v.text);
    }
    return String(v);
  }

  async function parseFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'xlsx') {
      if (typeof ExcelJS === 'undefined') throw new Error('Excel reader did not load (check the internet connection).');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0];
      if (!ws) throw new Error('The workbook has no sheets.');
      const headers = [];
      ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => { headers[col - 1] = C.clean(cellText(cell.value)) || `Column ${col}`; });
      const rows = [];
      for (let i = 2; i <= ws.rowCount; i++) {
        const row = ws.getRow(i);
        const obj = {};
        let any = false;
        headers.forEach((h, idx) => {
          const t = cellText(row.getCell(idx + 1).value);
          if (t !== '') any = true;
          obj[h] = t;
        });
        if (any) rows.push(obj);
      }
      return { headers, rows };
    }
    if (ext !== 'csv' && ext !== 'txt') throw new Error('Please upload the CSV (or .xlsx) file downloaded from Meritto.');
    if (typeof Papa === 'undefined') throw new Error('CSV reader did not load (check the internet connection).');
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: 'greedy',
        transformHeader: (h) => C.clean(h),
        complete: (res) => resolve({ headers: res.meta.fields || [], rows: res.data }),
        error: (err) => reject(err),
      });
    });
  }

  async function loadFile(ds, file) {
    try {
      const { headers, rows } = await parseFile(file);
      if (!headers.length) throw new Error('No header row found.');
      const cols = {};
      DATASETS[ds].fields.forEach(({ f }) => { cols[f] = C.detectColumn(headers, f); });
      state.files[ds] = { name: file.name, headers, rows, cols };
      state.reviewed = false;
      recompute();
      toast(`${DATASETS[ds].part}: ${rows.length.toLocaleString('en-IN')} rows loaded from ${file.name}`);
    } catch (e) {
      toast(`${DATASETS[ds].part}: ${e.message || e}`, 'err');
    }
  }

  // ---------------- Compute & render ----------------
  function recompute() {
    const f = state.files;
    state.report = (f.leads || f.enrol || f.apps)
      ? C.buildReport({ leads: f.leads, enrol: f.enrol, apps: f.apps, settings: settings(), week: state.week })
      : null;
    render();
  }

  function render() {
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
    document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== `view-${state.tab}`; });
    if (state.tab === 'run') {
      renderWeek();
      Object.keys(DATASETS).forEach(renderDataset);
      renderCourses();
      renderChecks();
      renderReport();
    } else if (state.tab === 'history') renderHistory();
    else renderSettings();
  }

  function renderWeek() {
    const { start, end } = state.week;
    const notWed = start.getDay() !== 3;
    $('#week').innerHTML = `
      <div class="card-head">
        <span class="step-no">1</span>
        <div><h2>Reporting week</h2><p class="sub">Wednesday → Tuesday. Used for every Meritto filter below.</p></div>
      </div>
      <div class="week-row">
        <label class="field">Week starts (Wednesday)
          <input type="date" id="weekStart" value="${C.isoDate(start)}">
        </label>
        <div class="week-label">
          <span class="muted">Report heading</span>
          <strong>${esc(C.weekLabel(state.week))}</strong>
          <span class="muted">${esc(C.formatDay(start))} → ${esc(C.formatDay(end))} (7 days)</span>
        </div>
      </div>
      ${notWed ? '<p class="note warn">The selected start date is not a Wednesday.</p>' : ''}`;
  }

  function renderDataset(ds) {
    const d = DATASETS[ds];
    const file = state.files[ds];
    const w = { from: C.formatDay(state.week.start), to: C.formatDay(state.week.end) };
    const missingReq = file ? d.fields.filter((x) => x.req && !file.cols[x.f]) : [];
    const status = !file ? '<span class="pill pill-wait">Waiting for file</span>'
      : missingReq.length ? '<span class="pill pill-err">Map columns</span>'
      : '<span class="pill pill-ok">Loaded</span>';

    const mapping = file ? `
      <div class="mapping">
        ${d.fields.map((x) => `
          <label class="field">${esc(x.label)}${x.req ? ' <span class="req">*</span>' : ' <span class="muted">(check only)</span>'}
            <select data-map="${ds}" data-field="${x.f}">
              <option value="">— not in file —</option>
              ${file.headers.map((h) => `<option value="${esc(h)}" ${h === file.cols[x.f] ? 'selected' : ''}>${esc(h)}</option>`).join('')}
            </select>
          </label>`).join('')}
      </div>` : '';

    $(`#ds-${ds}`).innerHTML = `
      <div class="card-head">
        <span class="step-no">${d.step}</span>
        <div><h2>${d.part} · ${esc(d.title)}</h2>
          <p class="sub"><span class="chip">${d.docExport}</span><span class="chip">Calculated: ${d.docCalc}</span></p></div>
        ${status}
      </div>
      <details class="howto" ${file ? '' : 'open'}>
        <summary>How to export from Meritto</summary>
        <ol>${d.steps(w).map((s) => `<li>${s}</li>`).join('')}</ol>
      </details>
      ${file ? `
        <div class="file-row">
          <div><strong>${esc(file.name)}</strong> <span class="muted">· ${file.rows.length.toLocaleString('en-IN')} rows · ${file.headers.length} columns</span></div>
          <div class="btns">
            <label class="btn btn-ghost">Replace<input type="file" accept=".csv,.xlsx,.txt" data-file="${ds}" hidden></label>
            <button class="btn btn-ghost" data-action="remove" data-ds="${ds}">Remove</button>
          </div>
        </div>${mapping}` : `
        <label class="dropzone" data-drop="${ds}">
          <input type="file" accept=".csv,.xlsx,.txt" data-file="${ds}" hidden>
          <strong>Drop the ${d.part} file here</strong><span class="muted">or click to choose · CSV or XLSX</span>
        </label>`}`;
  }

  function renderCourses() {
    const el = $('#courses');
    const r = state.report;
    if (!r || !r.courses.length) {
      el.innerHTML = `<div class="card-head"><span class="step-no">5</span><div><h2>Programme review</h2>
        <p class="sub"><span class="chip">Doc Step 6</span> Appears once a file is uploaded.</p></div></div>`;
      return;
    }
    const counts = { managed: 0, excluded: 0, new: 0 };
    r.courses.forEach((c) => counts[c.status]++);
    const label = { managed: 'Managed', excluded: 'Excluded', new: 'New — included' };
    el.innerHTML = `
      <div class="card-head"><span class="step-no">5</span>
        <div><h2>Programme review</h2>
          <p class="sub"><span class="chip">Doc Step 6</span> ${counts.managed} managed · ${counts.excluded} excluded · ${counts.new} new</p></div>
        ${counts.new ? '<span class="pill pill-warn">Decision needed</span>' : '<span class="pill pill-ok">OK</span>'}
      </div>
      <div class="table-wrap short">
        <table class="grid">
          <thead><tr><th class="l">Programme (Course)</th><th>Leads</th><th>Enrolled</th><th>Applications</th><th class="l">Status</th><th></th></tr></thead>
          <tbody>${r.courses.map((c) => `
            <tr class="${c.status === 'new' ? 'row-new' : c.status === 'excluded' ? 'row-excluded' : ''}">
              <td class="l">${esc(c.label)}</td><td>${fmtN(c.leads)}</td><td>${fmtN(c.enrol)}</td><td>${fmtN(c.apps)}</td>
              <td class="l"><span class="pill pill-${c.status}">${label[c.status]}</span></td>
              <td class="actions">
                ${c.status !== 'managed' ? `<button class="btn btn-sm" data-action="manage" data-course="${esc(c.label)}">${c.status === 'excluded' ? 'Include' : 'Managed'}</button>` : ''}
                ${c.status !== 'excluded' ? `<button class="btn btn-sm btn-ghost" data-action="exclude" data-course="${esc(c.label)}">Exclude</button>` : ''}
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function renderChecks() {
    const el = $('#checks');
    const r = state.report;
    if (!r) {
      el.innerHTML = '<div class="card-head"><span class="step-no">6</span><div><h2>Checks</h2><p class="sub">Run automatically on every change.</p></div></div>';
      return;
    }
    const n = (lvl) => r.checks.filter((c) => c.level === lvl).length;
    const icon = { error: '✕', warn: '!', info: 'i', ok: '✓' };
    el.innerHTML = `
      <div class="card-head"><span class="step-no">6</span>
        <div><h2>Checks</h2><p class="sub">${n('error')} blocking · ${n('warn')} warnings · ${n('info')} notes</p></div>
        ${n('error') ? '<span class="pill pill-err">Blocked</span>' : n('warn') ? '<span class="pill pill-warn">Review</span>' : '<span class="pill pill-ok">Passed</span>'}
      </div>
      <ul class="checks">${r.checks.map((c, i) => `
        <li class="check check-${c.level}">
          <span class="check-icon">${icon[c.level]}</span>
          <div><strong>${esc(c.title)}</strong>${c.doc ? ` <span class="chip">${esc(c.doc)}</span>` : ''}
            ${c.detail ? `<div class="muted">${esc(c.detail)}</div>` : ''}
            ${c.action ? `<button class="btn btn-sm btn-ghost" data-action="check" data-i="${i}">Mark these stages as known</button>` : ''}
          </div>
        </li>`).join('')}
      </ul>`;
  }

  function tableHTML(r, kind) {
    const th = store.threshold / 100;
    const stageHeads = r.stageCols.map((s) => `<th class="${s.junk ? 'junk' : ''}">${esc(s.label)}</th>`).join('');
    const extra = kind === 'programme' ? '<th>Application Started</th><th>Application Submitted</th><th>Enrollment Done</th>' : '';
    const body = kind === 'programme' ? r.rows : r.campaignRows;
    const rowHTML = (x, cls = '') => `
      <tr class="${cls}">
        <td class="l">${esc(x.label)}</td>
        ${r.stageCols.map((s) => `<td class="${s.junk ? 'junk-col' : ''}">${fmtN(x.counts.get(s.key))}</td>`).join('')}
        <td class="b">${fmtN(x.total)}</td><td class="b">${x.junk.toLocaleString('en-IN')}</td>
        <td class="${x.total && x.junkPct >= th ? 'hi' : ''}">${C.pct(x.junkPct)}</td>
        ${kind === 'programme' ? `<td>${x.started}</td><td>${x.submitted}</td><td>${x.enrolled}</td>` : ''}
      </tr>`;
    return `
      <div class="table-wrap">
        <table class="grid report">
          <thead>
            <tr><th class="l title" colspan="${r.stageCols.length + 4 + (kind === 'programme' ? 3 : 0)}">${esc(C.weekLabel(state.week))}</th></tr>
            <tr><th class="l">Row Labels</th>${stageHeads}<th>Grand Total</th><th>Junk</th><th>Junk %</th>${extra}</tr>
          </thead>
          <tbody>
            ${body.map((x) => rowHTML(x, x.type === 'course' ? 'row-course' : x.type === 'campaign' ? 'row-campaign' : '')).join('')}
            ${rowHTML(r.totals, 'row-total')}
          </tbody>
        </table>
      </div>`;
  }

  function renderReport() {
    const el = $('#report');
    const r = state.report;
    const head = `<div class="card-head"><span class="step-no">7</span>
      <div><h2>Weekly Performance (JGU) — report & approval</h2>
      <p class="sub"><span class="chip">Doc Step 8</span> Junk = Financial Barrier + Junk Lead + Not Interested in the Programme · Junk % = Junk ÷ Grand Total</p></div></div>`;
    if (!r || !r.rows.length) {
      el.innerHTML = `${head}<p class="muted pad">Upload the Part 1 leads export to see the report.</p>`;
      return;
    }
    const errors = r.checks.filter((c) => c.level === 'error').length;
    const t = r.totals;
    el.innerHTML = `${head}
      <div class="kpis">
        <div class="kpi"><span>Total leads</span><strong>${t.total.toLocaleString('en-IN')}</strong></div>
        <div class="kpi"><span>Junk</span><strong>${t.junk.toLocaleString('en-IN')}</strong></div>
        <div class="kpi ${t.junkPct >= store.threshold / 100 ? 'kpi-hi' : ''}"><span>Junk %</span><strong>${C.pct(t.junkPct)}</strong></div>
        <div class="kpi"><span>Application Started</span><strong>${t.started}</strong></div>
        <div class="kpi"><span>Application Submitted</span><strong>${t.submitted}</strong></div>
        <div class="kpi"><span>Enrollment Done</span><strong>${t.enrolled}</strong></div>
      </div>
      <div class="seg">
        <button class="seg-btn ${state.view === 'programme' ? 'active' : ''}" data-action="view" data-view="programme">Programme-wise</button>
        <button class="seg-btn ${state.view === 'campaign' ? 'active' : ''}" data-action="view" data-view="campaign" ${r.hasCampaign ? '' : 'disabled'}>Campaign-wise</button>
        <button class="btn btn-ghost right" data-action="copy">Copy table for Excel</button>
      </div>
      ${state.view === 'campaign' && r.hasCampaign
        ? `<p class="note">Campaign-wise does not include Application Started, Application Submitted or Enrollment Done (per the process document).</p>${tableHTML(r, 'campaign')}`
        : tableHTML(r, 'programme')}
      <div class="approve">
        <label class="check-line"><input type="checkbox" id="reviewed" ${state.reviewed ? 'checked' : ''} ${errors ? 'disabled' : ''}>
          I have reviewed the checks and the figures for ${esc(C.weekLabel(state.week))}.</label>
        <button class="btn btn-primary" data-action="approve" ${errors || !state.reviewed ? 'disabled' : ''}>Approve & download Excel</button>
        ${errors ? `<span class="muted">Resolve ${errors} blocking check(s) first.</span>` : ''}
      </div>`;
  }

  function renderHistory() {
    const el = $('#view-history');
    const list = [...store.history].sort((a, b) => b.start.localeCompare(a.start));
    if (!list.length) {
      el.innerHTML = '<section class="card"><h2>History</h2><p class="muted">Approved weeks appear here (stored in this browser).</p></section>';
      return;
    }
    el.innerHTML = `<section class="card"><h2>History</h2>
      <p class="sub">Approved weekly reports stored in this browser.</p>
      <div class="table-wrap"><table class="grid">
        <thead><tr><th class="l">Week</th><th>Total leads</th><th>Junk</th><th>Junk %</th><th>App Started</th><th>App Submitted</th><th>Enrolled</th><th class="l">Approved</th><th></th></tr></thead>
        <tbody>${list.map((h) => `
          <tr>
            <td class="l"><strong>${esc(h.label)}</strong></td>
            <td>${h.totals.total.toLocaleString('en-IN')}</td><td>${h.totals.junk.toLocaleString('en-IN')}</td>
            <td class="${h.totals.junkPct >= store.threshold / 100 ? 'hi' : ''}">${C.pct(h.totals.junkPct)}</td>
            <td>${h.totals.started}</td><td>${h.totals.submitted}</td><td>${h.totals.enrolled}</td>
            <td class="l muted">${esc(new Date(h.approvedAt).toLocaleString('en-IN'))}</td>
            <td class="actions"><button class="btn btn-sm btn-ghost" data-action="hist-view" data-id="${h.id}">Details</button>
              <button class="btn btn-sm btn-ghost" data-action="hist-del" data-id="${h.id}">Delete</button></td>
          </tr>
          ${state.histOpen === h.id ? `<tr class="row-detail"><td colspan="9">
            <table class="grid inner"><thead><tr><th class="l">Programme</th><th>Leads</th><th>Junk</th><th>Junk %</th><th>Started</th><th>Submitted</th><th>Enrolled</th></tr></thead>
            <tbody>${h.rows.map((x) => `<tr><td class="l">${esc(x.label)}</td><td>${x.total}</td><td>${x.junk}</td>
              <td class="${x.junkPct >= store.threshold / 100 ? 'hi' : ''}">${C.pct(x.junkPct)}</td><td>${x.started}</td><td>${x.submitted}</td><td>${x.enrolled}</td></tr>`).join('')}</tbody></table>
            <p class="muted">Files: ${esc(h.files.join(' · '))}</p></td></tr>` : ''}`).join('')}
        </tbody></table></div></section>`;
  }

  function renderSettings() {
    $('#view-settings').innerHTML = `
      <section class="card">
        <h2>Settings</h2>
        <p class="sub">Stored in this browser. Changes apply to the current run immediately.</p>
        <div class="settings-grid">
          <label class="field">Excluded programmes — not managed by the team (Doc Step 6), one per line
            <textarea id="set-excluded" rows="8">${esc(store.excluded.join('\n'))}</textarea></label>
          <label class="field">Managed programmes — anything else is flagged as new, one per line
            <textarea id="set-managed" rows="8">${esc(store.managed.join('\n'))}</textarea></label>
        </div>
        <label class="field narrow">Highlight Junk % at or above
          <span class="inline"><input type="number" id="set-threshold" min="0" max="100" value="${store.threshold}"> %</span></label>
        <div class="rule">
          <strong>Fixed business rules (Doc Steps 8, 16)</strong>
          <ul>
            <li>Junk = <b>FINANCIAL BARRIER</b> + <b>JUNK LEAD</b> + <b>NOT INTERESTED IN THE PROGRAM</b></li>
            <li>Junk % = Junk ÷ Grand Total (all lead stages)</li>
            <li>Payment Pending → Application Started · Payment Approved → Application Submitted</li>
            <li>Courses are matched like a VLOOKUP; no match → 0</li>
          </ul>
        </div>
        <div class="btns">
          <button class="btn btn-primary" data-action="save-settings">Save settings</button>
          <button class="btn btn-ghost" data-action="reset-settings">Restore defaults</button>
        </div>
      </section>`;
  }

  // ---------------- Excel export ----------------
  async function exportWorkbook() {
    if (typeof ExcelJS === 'undefined') { toast('Excel writer did not load (check the internet connection).', 'err'); return false; }
    const r = state.report;
    const label = C.weekLabel(state.week);
    const th = store.threshold / 100;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'PD Junk Analysis Dashboard';
    const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
    const border = { top: { style: 'thin', color: { argb: 'FFD9D9D9' } }, bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } } };

    const sheet = (name, rows, withApps) => {
      const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }] });
      const heads = ['Row Labels', ...r.stageCols.map((s) => s.label), 'Grand Total', 'Junk', 'Junk %',
        ...(withApps ? ['Application Started', 'Application Submitted', 'Enrollment Done'] : [])];
      ws.addRow([label]).font = { bold: true, size: 12 };
      const hr = ws.addRow(heads);
      hr.height = 48;
      hr.eachCell((cell, col) => {
        const stage = r.stageCols[col - 2];
        cell.font = { bold: true, size: 9 };
        cell.alignment = { wrapText: true, vertical: 'middle', horizontal: col === 1 ? 'left' : 'center' };
        cell.fill = fill(stage && stage.junk ? 'FFFFC000' : 'FFF2CEEF');
      });
      const pctCol = r.stageCols.length + 4;
      const write = (x, kind) => {
        const row = ws.addRow([x.label, ...r.stageCols.map((s) => x.counts.get(s.key) || null), x.total, x.junk, x.junkPct,
          ...(withApps ? [x.started, x.submitted, x.enrolled] : [])]);
        row.getCell(pctCol).numFmt = '0%';
        row.eachCell({ includeEmpty: true }, (cell, col) => {
          cell.border = border;
          if (col > 1) cell.alignment = { horizontal: 'center' };
        });
        if (kind === 'course') { row.font = { bold: true }; row.eachCell({ includeEmpty: true }, (c) => { c.fill = fill('FFDDEBF7'); }); }
        if (kind === 'campaign') row.getCell(1).alignment = { indent: 2 };
        if (kind === 'total') { row.font = { bold: true }; row.eachCell({ includeEmpty: true }, (c) => { c.fill = fill('FFBDD7EE'); }); }
        if (x.total && x.junkPct >= th) row.getCell(pctCol).fill = fill('FFFFC7CE');
      };
      rows.forEach((x) => write(x, x.type));
      write(r.totals, 'total');
      ws.getColumn(1).width = 62;
      for (let i = 2; i <= heads.length; i++) ws.getColumn(i).width = 12;
    };

    sheet('Programme-wise', r.rows, true);
    if (r.hasCampaign) sheet('Campaign-wise', r.campaignRows, false);
    const cs = wb.addWorksheet('Checks');
    cs.addRow(['Level', 'Check', 'Detail', 'Doc step']).font = { bold: true };
    r.checks.forEach((c) => cs.addRow([c.level.toUpperCase(), c.title, c.detail, c.doc]));
    cs.addRow([]);
    cs.addRow(['Files', Object.values(state.files).map((f) => f.name).join(' · ')]);
    cs.addRow(['Approved', new Date().toLocaleString('en-IN')]);
    cs.getColumn(1).width = 10; cs.getColumn(2).width = 60; cs.getColumn(3).width = 90; cs.getColumn(4).width = 14;

    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    a.download = `JGU Junk Report ${label}.xlsx`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    return true;
  }

  async function approve() {
    const r = state.report;
    if (!(await exportWorkbook())) return;
    const id = C.isoDate(state.week.start);
    const pick = (x) => ({ label: x.label, total: x.total, junk: x.junk, junkPct: x.junkPct, started: x.started, submitted: x.submitted, enrolled: x.enrolled });
    store.history = store.history.filter((h) => h.id !== id);
    store.history.push({
      id,
      start: id,
      label: C.weekLabel(state.week),
      approvedAt: new Date().toISOString(),
      totals: pick(r.totals),
      rows: r.rows.map(pick),
      files: Object.values(state.files).map((f) => f.name),
    });
    saveStore();
    toast(`Approved ${C.weekLabel(state.week)} — Excel downloaded and saved to History.`);
  }

  function setCourse(label, status) {
    const key = C.keyOf(label);
    store.excluded = store.excluded.filter((c) => C.keyOf(c) !== key);
    store.managed = store.managed.filter((c) => C.keyOf(c) !== key);
    (status === 'excluded' ? store.excluded : store.managed).push(label);
    saveStore();
    state.reviewed = false;
    recompute();
  }

  // ---------------- Events ----------------
  document.addEventListener('click', async (e) => {
    const tab = e.target.closest('.tab');
    if (tab) { state.tab = tab.dataset.tab; render(); return; }
    const b = e.target.closest('[data-action]');
    if (!b || b.disabled) return;
    const a = b.dataset.action;
    if (a === 'remove') { state.files[b.dataset.ds] = null; state.reviewed = false; recompute(); }
    else if (a === 'manage') setCourse(b.dataset.course, 'managed');
    else if (a === 'exclude') setCourse(b.dataset.course, 'excluded');
    else if (a === 'view') { state.view = b.dataset.view; renderReport(); }
    else if (a === 'check') {
      const act = state.report.checks[+b.dataset.i].action;
      store.knownStages = [...store.knownStages, ...act.keys];
      saveStore();
      recompute();
    } else if (a === 'copy') {
      try {
        await navigator.clipboard.writeText(C.toTSV(state.report, state.view, C.weekLabel(state.week)));
        toast('Table copied — paste into the Weekly Performance sheet.');
      } catch (err) { toast('Copy failed — use the Excel download instead.', 'err'); }
    } else if (a === 'approve') approve();
    else if (a === 'hist-view') { state.histOpen = state.histOpen === b.dataset.id ? null : b.dataset.id; renderHistory(); }
    else if (a === 'hist-del') {
      store.history = store.history.filter((h) => h.id !== b.dataset.id);
      saveStore();
      renderHistory();
    } else if (a === 'save-settings') {
      const lines = (id) => $(id).value.split('\n').map((s) => C.clean(s)).filter(Boolean);
      store.excluded = lines('#set-excluded');
      store.managed = lines('#set-managed');
      const t = Number($('#set-threshold').value);
      store.threshold = Number.isFinite(t) ? Math.min(100, Math.max(0, t)) : 50;
      saveStore();
      state.report = null;
      recompute();
      toast('Settings saved.');
    } else if (a === 'reset-settings') {
      store = { ...defaults(), history: store.history };
      saveStore();
      recompute();
      toast('Defaults restored (history kept).');
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('input[data-file]') && t.files[0]) loadFile(t.dataset.file, t.files[0]);
    else if (t.matches('select[data-map]')) {
      state.files[t.dataset.map].cols[t.dataset.field] = t.value;
      state.reviewed = false;
      recompute();
    } else if (t.id === 'weekStart' && t.value) {
      const [y, m, d] = t.value.split('-').map(Number);
      const start = new Date(y, m - 1, d);
      state.week = { start, end: C.addDays(start, 6) };
      state.reviewed = false;
      recompute();
    } else if (t.id === 'reviewed') { state.reviewed = t.checked; renderReport(); }
  });

  document.addEventListener('dragover', (e) => {
    const z = e.target.closest('[data-drop]');
    if (z) { e.preventDefault(); z.classList.add('over'); }
  });
  document.addEventListener('dragleave', (e) => {
    const z = e.target.closest('[data-drop]');
    if (z) z.classList.remove('over');
  });
  document.addEventListener('drop', (e) => {
    const z = e.target.closest('[data-drop]');
    if (!z) return;
    e.preventDefault();
    z.classList.remove('over');
    if (e.dataTransfer.files[0]) loadFile(z.dataset.drop, e.dataTransfer.files[0]);
  });

  render();
}
