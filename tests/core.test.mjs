// Calculation tests, independent of any UI. Run: npm test
import assert from 'node:assert/strict';
import * as C from '../src/lib/junkCore.js';
import {
  periodRange, previousRange, weekIdsEndingIn, weeksIn, completeness, aggregate,
  overlappingWeekIds, prepareWeeksForPeriod, inclusiveDayCount, sliceWeekToCustomDates,
} from '../src/lib/periods.js';
import { SEED_WEEKS } from '../src/lib/seed.js';
import { normalizeClient, weekBelongsToClient, weeksForClient, clientOverallJunkPct, migrateLegacyClient, weekKey, LEGACY_CLIENT_ID } from '../src/lib/clients.js';
import { mergeHistory } from '../src/lib/store.js';
import {
  authenticate, setUserProgrammes, programmeKeysForUser, scopeAggregate, scopeWeeks,
  ensureUsers, ROLES, canAccess, canRunWeekly, canManageTeam, canManageClients,
  canManageSettings, canMutateHistory, ALL_VIEWS, ADMIN_VIEWS,
} from '../src/lib/access.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

// Synthetic export matching the 1–7 July 2026 report's Grand Total row.
const stageTotals = {
  'CONNECTED ON EMAIL': 6, 'CONNECTED ON WHATSAPP': 41, COUNSELLED: 76, 'DID NOT PICK (DNP)': 1235,
  'ENROLLED WITH ANOTHER UNIVERSITY': 7, 'FINANCIAL BARRIER': 227, 'INTERESTED IN NEXT COHORT WARM': 9,
  'JUNK LEAD': 1272, 'NOT INTERESTED IN THE PROGRAM': 543, 'OL SENT': 3, 'REGISTRATION FEE PAID': 1,
  'REQUEST CALL BACK': 115, UNTOUCHED: 252,
};
const courses = ['MBA IN BUSINESS ANALYTICS', 'M.A. IN PUBLIC POLICY', 'M.A. IN INTERNATIONAL RELATIONS, SECURITY ANDÂ STRATEGY',
  'M.A. IN INTERNATIONAL RELATIONS, SECURITY AND STRATEGY', 'Bachelors Programme'];
const leadRows = [];
let i = 0;
for (const [st, n] of Object.entries(stageTotals)) {
  for (let k = 0; k < n; k++, i++) {
    leadRows.push({ Course: courses[i % courses.length], 'Lead Stage': st, 'Primary Registration Campaign': i % 3 ? 'PURVIEW DIGITAL/FACEBOOK/X' : 'CHAT/CHATBOT/NIAA', 'User Registration Date': `0${1 + (i % 7)}-07-2026 10:00` });
  }
}
leadRows.push({ Course: 'COURSE NOT AVAILABLE', 'Lead Stage': 'JUNK LEAD' }, { Course: '', 'Lead Stage': 'JUNK LEAD' }, { Course: 'bachelor of science in psychology', 'Lead Stage': 'DID NOT PICK (DNP)' });
const leads = { rows: leadRows, cols: { course: 'Course', stage: 'Lead Stage', campaign: 'Primary Registration Campaign', leadDate: 'User Registration Date' } };
const enrol = { rows: [...Array(4)].map(() => ({ Course: 'MBA IN BUSINESS ANALYTICS', 'Enrolment Status': 'Yes' })), cols: { course: 'Course', enrolStatus: 'Enrolment Status' } };
const apps = {
  rows: [...Array(51)].map(() => ({ Course: 'M.A. IN PUBLIC POLICY', 'Payment Status': 'Payment Pending' }))
    .concat([...Array(10)].map(() => ({ Course: 'MBA IN BUSINESS ANALYTICS', 'Payment Status': 'Payment Approved' })),
      [{ Course: 'MBA IN BUSINESS ANALYTICS', 'Payment Status': 'Payment Failed' }, { Course: 'M.A. LEGISLATIVE DRAFTING', 'Payment Status': 'Payment Pending' }]),
  cols: { course: 'Course', payment: 'Payment Status' },
};
const week = { start: new Date(2026, 6, 1), end: new Date(2026, 6, 7) };
const settings = { excluded: C.DEFAULT_EXCLUDED, managed: C.DEFAULT_MANAGED, knownStages: C.DEFAULT_KNOWN_STAGES };
const r = C.buildReport({ leads, enrol, apps, settings, week });

console.log('Weekly report (Doc Steps 5–16)');
test('Grand Total matches the 1–7 Jul report: 3787 leads, 2042 junk, 54%', () => {
  assert.equal(r.totals.total, 3787);
  assert.equal(r.totals.junk, 2042);
  assert.equal(C.pct(r.totals.junkPct), '54%');
});
test('Junk categories add up to Junk', () => {
  const b = C.junkBreakdown(r.totals.counts);
  assert.deepEqual(b, { jl: 1272, fin: 227, ni: 543 });
});
test('Excluded programmes and blank course removed (Step 6)', () => {
  assert.equal(r.stats.excluded, 3);
  assert.equal(r.stats.blankCourse, 1);
  assert.ok(!r.rows.some((x) => x.label === 'COURSE NOT AVAILABLE'));
});
test('Encoding variants of one course merge into one row', () => assert.equal(r.rows.length, 4));
test('Every row sums to its Grand Total', () => r.rows.forEach((x) => assert.equal([...x.counts.values()].reduce((a, b) => a + b, 0), x.total)));
test('Pending → Started, Approved → Submitted, other statuses ignored (Step 16)', () => {
  assert.equal(r.totals.started, 51);
  assert.equal(r.totals.submitted, 10);
  assert.ok(r.checks.some((c) => c.title === 'Payment statuses not counted'));
});
test('Enrollment Done via course match (Step 13)', () => assert.equal(r.totals.enrolled, 4));
test('Unmatched course is reported, not added (VLOOKUP behaviour)', () => assert.ok(r.checks.some((c) => c.title.startsWith('Courses with applications'))));
test('Lead rows kept for Records = counted leads', () => assert.equal(r.leadRows.length, 3787));
test('Untouched above alert threshold is flagged in red-alert checks', () => {
  // 2 of 3 leads Untouched → 67% ≥ 30% default alert.
  const uLeads = {
    rows: [
      { Course: 'MBA', 'Lead Stage': 'UNTOUCHED', 'Primary Registration Campaign': 'FB' },
      { Course: 'MBA', 'Lead Stage': 'UNTOUCHED', 'Primary Registration Campaign': 'FB' },
      { Course: 'MBA', 'Lead Stage': 'COUNSELLED', 'Primary Registration Campaign': 'FB' },
    ],
    cols: { course: 'Course', stage: 'Lead Stage', campaign: 'Primary Registration Campaign' },
  };
  const empty = { rows: [], cols: { course: 'Course', payment: 'Payment Status', enrolStatus: 'Enrolment Status' } };
  const ur = C.buildReport({
    leads: uLeads,
    enrol: { rows: [], cols: { course: 'Course' } },
    apps: empty,
    settings: { ...settings, untouchedThreshold: 30 },
    week,
  });
  assert.ok(ur.checks.some((c) => c.level === 'warn' && c.title.startsWith('Untouched is')));
  const ok = C.buildReport({
    leads: uLeads,
    enrol: { rows: [], cols: { course: 'Course' } },
    apps: empty,
    settings: { ...settings, untouchedThreshold: 80 },
    week,
  });
  assert.ok(!ok.checks.some((c) => c.title.startsWith('Untouched is')));
});
test('Campaign-wise includes leads, applications and enrolments when campaign is mapped', () => {
  const campLeads = {
    rows: [
      { Course: 'MBA', 'Lead Stage': 'JUNK LEAD', 'Primary Registration Campaign': 'FB/ADS' },
      { Course: 'MBA', 'Lead Stage': 'COUNSELLED', 'Primary Registration Campaign': 'FB/ADS' },
      { Course: 'MBA', 'Lead Stage': 'JUNK LEAD', 'Primary Registration Campaign': 'GOOGLE' },
      { Course: 'MBA', 'Lead Stage': 'COUNSELLED', 'Primary Registration Campaign': 'GOOGLE' },
    ],
    cols: { course: 'Course', stage: 'Lead Stage', campaign: 'Primary Registration Campaign' },
  };
  const campEnrol = {
    rows: [
      { Course: 'MBA', 'Enrolment Status': 'Yes', 'Primary Registration Campaign': 'FB/ADS' },
      { Course: 'MBA', 'Enrolment Status': 'Yes', 'Primary Registration Campaign': 'FB/ADS' },
      { Course: 'MBA', 'Enrolment Status': 'Yes', 'Primary Registration Campaign': 'GOOGLE' },
    ],
    cols: { course: 'Course', enrolStatus: 'Enrolment Status', campaign: 'Primary Registration Campaign' },
  };
  const campApps = {
    rows: [
      { Course: 'MBA', 'Payment Status': 'Payment Pending', 'Enrolment Status': 'No', 'Primary Registration Campaign': 'FB/ADS' },
      { Course: 'MBA', 'Payment Status': 'Payment Approved', 'Enrolment Status': 'No', 'Primary Registration Campaign': 'FB/ADS' },
      { Course: 'MBA', 'Payment Status': 'Payment Pending', 'Enrolment Status': 'No', 'Primary Registration Campaign': 'GOOGLE' },
      { Course: 'MBA', 'Payment Status': 'Payment Approved', 'Enrolment Status': 'No', 'Primary Registration Campaign': 'GOOGLE' },
      { Course: 'MBA', 'Payment Status': 'Payment Approved', 'Enrolment Status': 'No', 'Primary Registration Campaign': 'GOOGLE' },
    ],
    cols: { course: 'Course', payment: 'Payment Status', enrolStatus: 'Enrolment Status', campaign: 'Primary Registration Campaign' },
  };
  const cr = C.buildReport({ leads: campLeads, enrol: campEnrol, apps: campApps, settings, week });
  assert.equal(cr.hasCampaign, true);
  const fb = cr.campaignRows.find((x) => x.type === 'campaign' && x.label === 'FB/ADS');
  const goog = cr.campaignRows.find((x) => x.type === 'campaign' && x.label === 'GOOGLE');
  assert.equal(fb.total, 2);
  assert.equal(fb.junk, 1);
  assert.equal(fb.started, 1);
  assert.equal(fb.submitted, 1);
  assert.equal(fb.enrolled, 2);
  assert.equal(goog.total, 2);
  assert.equal(goog.started, 1);
  assert.equal(goog.submitted, 2);
  assert.equal(goog.enrolled, 1);
  const storedCamp = C.serializeWeek(cr, { week });
  assert.equal(storedCamp.campaigns.find((c) => c.label === 'FB/ADS').enrolled, 2);
  assert.match(C.toTSV(cr, 'campaign', 'x'), /Application Started/);
});

console.log('Serialisation');
const stored = C.serializeWeek(r, { week, files: ['a.csv'] });
const back = C.weekToReport(stored);
test('Stored week round-trips to the same totals and Excel table', () => {
  assert.equal(stored.id, '2026-07-01');
  assert.equal(back.totals.total, 3787);
  assert.equal(back.totals.junk, 2042);
  assert.equal(C.toTSV(back, 'programme', 'x'), C.toTSV(r, 'programme', 'x'));
});
test('Compact lead rows decode to labels', () => {
  const [c, s, k, d] = stored.rows.leads[0];
  assert.ok(stored.rows.courses[c] && stored.rows.stages[s] !== undefined && stored.rows.campaigns[k] !== undefined);
  assert.match(d, /^2026-07-0\d$/);
});

console.log('Weeks and periods');
test('Default week is the last completed Wed → Tue', () => {
  assert.equal(C.weekLabel(C.defaultWeek(new Date(2026, 9, 26))), '14 Oct - 20 Oct 2026');
  assert.equal(C.weekLabel(C.defaultWeek(new Date(2026, 9, 21))), '14 Oct - 20 Oct 2026');
  assert.equal(C.defaultWeek(new Date(2026, 9, 20)).end.getDate(), 13);
});
test('DD-MM-YYYY dates read in Indian order', () => assert.equal(C.isoDate(C.parseDate('07-01-2026')), '2026-01-07'));
test('A week belongs to the month its Tuesday falls in', () => {
  // 29 Jul – 4 Aug 2026 ends in August.
  assert.deepEqual(weekIdsEndingIn(periodRange('month', '2026-07')), ['2026-07-01', '2026-07-08', '2026-07-15', '2026-07-22']);
  assert.ok(weekIdsEndingIn(periodRange('month', '2026-08')).includes('2026-07-29'));
});
test('Every week lands in exactly one month of the year', () => {
  const ids = [];
  for (let m = 1; m <= 12; m++) ids.push(...weekIdsEndingIn(periodRange('month', `2026-${String(m).padStart(2, '0')}`)));
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, weekIdsEndingIn(periodRange('year', '2026')));
});
test('Quarter, five-month and previous-period ranges', () => {
  assert.equal(periodRange('quarter', '2026-Q3').label, 'Q3 2026 (Jul – Sep 2026)');
  assert.equal(periodRange('five', '2026-10').label, '5 months: Jun – Oct 2026');
  assert.equal(previousRange(periodRange('quarter', '2026-Q1')).anchor, '2025-Q4');
  assert.equal(previousRange(periodRange('five', '2026-10')).anchor, '2026-05');
});
test('Seeded weeks: categories add up to Junk wherever known', () => {
  for (const w of SEED_WEEKS) if (w.totals.jl !== null) assert.equal(w.totals.jl + w.totals.fin + w.totals.ni, w.totals.junk, w.label);
});
test('Period Junk % is total junk ÷ total leads, not an average', () => {
  const jul = weeksIn(periodRange('month', '2026-07'), SEED_WEEKS);
  const a = aggregate(jul);
  const total = 3787 + 2949 + 2808 + 3395;
  const junk = 2042 + 1311 + 1234 + 1235;
  assert.equal(a.totals.total, total);
  assert.equal(a.totals.junk, junk);
  assert.equal(a.totals.junkPct, junk / total);
});
test('Overview metrics use stage buckets: Qualified / DNP / Untouched', () => {
  const jul = weeksIn(periodRange('month', '2026-07'), SEED_WEEKS);
  const a = aggregate(jul);
  assert.ok(a.totals.qualified >= 0);
  assert.ok(a.totals.dnp >= 0);
  assert.ok(a.totals.untouched >= 0);
  assert.equal(typeof a.totals.started, 'number');
  assert.equal(typeof a.totals.submitted, 'number');
  assert.equal(typeof a.totals.enrolled, 'number');
  const sample = {
    COUNSELLED: 10,
    'OL SENT': 2,
    'REGISTRATION FEE PAID': 1,
    'FOLLOW UP - POST COUNSELLED': 3,
    'DID NOT PICK (DNP)': 5,
    UNTOUCHED: 4,
    'REATTEMPT UNTOUCHED': 1,
    'JUNK LEAD': 7,
  };
  // Qualified is the counselled funnel — not Total − Junk.
  assert.equal(C.qualifiedCount(sample), 16);
  assert.equal(C.dnpCount(sample), 5);
  assert.equal(C.untouchedCount(sample), 5);
  assert.notEqual(C.qualifiedCount(sample), 10 + 2 + 1 + 3 + 5 + 4 + 1); // not all non-junk
});
test('DNP substages and note count from Lead Sub Stage / Note Count columns', () => {
  const leads = {
    rows: [
      { Course: 'MBA IN BUSINESS ANALYTICS', 'Lead Stage': 'DID NOT PICK (DNP)', 'Lead Sub Stage': 'FOLLOW-UP REQUIRED', 'Note Count': '3' },
      { Course: 'MBA IN BUSINESS ANALYTICS', 'Lead Stage': 'DID NOT PICK (DNP)', 'Lead Sub Stage': 'FOLLOW-UP REQUIRED', 'Note Count': '0' },
      { Course: 'MBA IN BUSINESS ANALYTICS', 'Lead Stage': 'DID NOT PICK (DNP)', 'Lead Sub Stage': 'CALLBACK LATER', 'Note Count': '1' },
      { Course: 'MBA IN BUSINESS ANALYTICS', 'Lead Stage': 'COUNSELLED', 'Lead Sub Stage': '', 'Note Count': '2' },
      { Course: 'MBA IN BUSINESS ANALYTICS', 'Lead Stage': 'JUNK LEAD', 'Lead Sub Stage': '', 'Note Count': '0' },
    ],
    cols: {
      course: 'Course', stage: 'Lead Stage', subStage: 'Lead Sub Stage', noteCount: 'Note Count',
      campaign: '', leadDate: '',
    },
  };
  const report = C.buildReport({
    leads,
    enrol: { rows: [], cols: { course: 'Course' } },
    apps: { rows: [], cols: { course: 'Course', payment: 'Payment Status' } },
    settings,
    week,
  });
  assert.equal(report.dnpDetail.total, 3);
  assert.equal(report.dnpDetail.withNotes, 2);
  assert.equal(report.dnpDetail.withoutNotes, 1);
  assert.equal(report.dnpDetail.noteSum, 4);
  assert.equal(report.dnpDetail.substages.length, 2);
  assert.equal(report.dnpDetail.substages.find((s) => s.key === 'FOLLOW-UP REQUIRED').n, 2);
  // Calling report: Note Count → Call Attempts (1 Call, 3 Calls, 0 Calls)
  assert.equal(report.dnpDetail.callAttempts['1'], 1);
  assert.equal(report.dnpDetail.callAttempts['3'], 1);
  assert.equal(report.dnpDetail.callAttempts['0'], 1);
  assert.equal(report.dnpDetail.callAttempts['2'], 0);
  assert.equal(report.dnpDetail.callAttempts['4'], 0);
  const oneCall = report.dnpDetail.callAttemptsReport.find((r) => r.key === '1');
  assert.equal(oneCall.n, 1);
  assert.ok(Math.abs(oneCall.pct - 1 / 3) < 1e-9);
  const stored = C.serializeWeek(report, { week });
  assert.equal(stored.dnpDetail.total, 3);
  assert.equal(stored.dnpDetail.callAttempts['3'], 1);
  assert.ok(stored.rows.substages.includes('FOLLOW-UP REQUIRED'));
  assert.equal(stored.rows.leads[0].length, 6);
  assert.equal(C.detectColumn(['Lead Stage', 'Lead Sub Stage', 'Note Count'], 'stage'), 'Lead Stage');
  assert.equal(C.detectColumn(['Lead Stage', 'Lead Sub Stage', 'Note Count'], 'subStage'), 'Lead Sub Stage');
  assert.equal(C.detectColumn(['Lead Stage', 'Lead Sub Stage', 'DNP History'], 'noteCount'), 'DNP History');
});
test('DNP Calling report programme-wise reconciles with DNP leads', () => {
  const dnp = (Course, n) => ({ Course, 'Lead Stage': 'DID NOT PICK (DNP)', 'Note Count': n });
  const leads = {
    rows: [
      dnp('MBA IN BUSINESS ANALYTICS', '3'), dnp('MBA IN BUSINESS ANALYTICS', '0'), dnp('MBA IN BUSINESS ANALYTICS', '1'),
      dnp('M.A. IN PUBLIC POLICY', '2'), dnp('M.A. IN PUBLIC POLICY', ''), dnp('M.A. IN PUBLIC POLICY', '7'),
      { Course: 'M.A. IN PUBLIC POLICY', 'Lead Stage': 'COUNSELLED', 'Note Count': '4' },
    ],
    cols: { course: 'Course', stage: 'Lead Stage', noteCount: 'Note Count', campaign: '', leadDate: '' },
  };
  const report = C.buildReport({
    leads,
    enrol: { rows: [], cols: { course: 'Course' } },
    apps: { rows: [], cols: { course: 'Course', payment: 'Payment Status' } },
    settings,
    week,
  });
  const stored = C.serializeWeek(report, { week });
  const a = aggregate([stored]);
  const rows = C.dnpProgrammeReport([stored], a.programmes);
  assert.equal(rows.length, 2);
  const mba = rows.find((r) => r.label === 'MBA IN BUSINESS ANALYTICS');
  const mpp = rows.find((r) => r.label === 'M.A. IN PUBLIC POLICY');
  assert.equal(mba.dnp, 3);
  assert.deepEqual([mba.callAttempts['1'], mba.callAttempts['3'], mba.callAttempts['0']], [1, 1, 1]);
  assert.equal(mba.noNote, 0);
  assert.equal(mpp.dnp, 3);
  assert.equal(mpp.leads, 4);
  assert.equal(mpp.callAttempts['2'], 1);
  assert.equal(mpp.callAttempts['5+'], 1);
  assert.equal(mpp.noNote, 1); // blank Note Count is not 0 Calls
  assert.equal(mpp.noteSum, 9);
  for (const r of rows) {
    const buckets = Object.values(r.callAttempts).reduce((x, y) => x + y, 0);
    assert.equal(buckets + r.noNote, r.dnp);
  }
  // Programme rows add up to the Overview DNP card.
  assert.equal(rows.reduce((s, r) => s + r.dnp, 0), a.totals.dnp);
  // Imported weeks (no lead rows) still count DNP, with call attempts unknown.
  const totalsOnly = { ...stored, rows: undefined };
  const imported = C.dnpProgrammeReport([totalsOnly], aggregate([totalsOnly]).programmes);
  assert.equal(imported.find((r) => r.key === mpp.key).noNote, 3);
});
test('Every page reconciles: Overview cards, detail pages, DNP Calling and Records', () => {
  // Approve 21–27 Oct from a leads file shaped like the imported week, with Note Count.
  const src = SEED_WEEKS.find((w) => w.id === '2026-10-21');
  const rows = []; let n = 0;
  for (const p of src.programmes) for (const [stage, k] of Object.entries(p.counts)) for (let j = 0; j < k; j++, n++) {
    rows.push({ Course: p.label, 'Lead Stage': stage, 'Note Count': n % 9 ? String(n % 7) : '' });
  }
  const wk = { start: new Date(2026, 9, 21), end: new Date(2026, 9, 27) };
  const rep = C.buildReport({
    leads: { rows, cols: { course: 'Course', stage: 'Lead Stage', noteCount: 'Note Count' } },
    enrol: { rows: [], cols: { course: 'Course' } },
    apps: { rows: [], cols: { course: 'Course', payment: 'Payment Status' } },
    settings, week: wk,
  });
  const approved = C.serializeWeek(rep, { week: wk });
  const ws = weeksIn(periodRange('month', '2026-10'), [...SEED_WEEKS.filter((w) => w.id !== approved.id), approved]);
  const a = aggregate(ws);
  const sum = (list, f) => list.reduce((s, x) => s + (x[f] || 0), 0);
  // Approving the same leads keeps every card the same as the imported week.
  assert.equal(approved.totals.total, src.totals.total);
  assert.equal(approved.totals.junk, src.totals.junk);
  for (const f of ['total', 'junk']) assert.equal(sum(a.programmes, f), a.totals[f], `${f} by programme`);
  for (const f of ['total', 'junk', 'qualified', 'dnp', 'untouched']) assert.equal(sum(a.series, f), a.totals[f], `${f} by week`);
  const dnp = C.dnpProgrammeReport(ws, a.programmes);
  assert.equal(sum(dnp, 'dnp'), a.totals.dnp);
  assert.equal(sum(dnp, 'notesKnown'), a.dnpDetail.notesKnown);
  for (const b of C.CALL_ATTEMPT_BUCKETS) assert.equal(dnp.reduce((s, r) => s + r.callAttempts[b.key], 0), a.dnpDetail.callAttempts[b.key]);
  // Records lists exactly the approved week.
  const leadsStored = approved.rows.leads.map((t) => C.keyOf(approved.rows.stages[t[1]]));
  assert.equal(leadsStored.length, approved.totals.total);
  assert.equal(leadsStored.filter(C.isDnpStage).length, a.dnpDetail.total);
  assert.equal(leadsStored.filter(C.isJunkStage).length, approved.totals.junk);
});
test('Call-count columns are detected for the DNP Calling report, dates are not', () => {
  assert.equal(C.detectColumn(['Course', 'Lead Stage', 'Call Attempts'], 'noteCount'), 'Call Attempts');
  assert.equal(C.detectColumn(['Course', 'No. of Calls'], 'noteCount'), 'No. of Calls');
  assert.equal(C.detectColumn(['Course', 'Last Call Date', 'Lead Remark'], 'noteCount'), '');
  assert.equal(C.detectColumn(['Note Count', 'Call Attempts'], 'noteCount'), 'Note Count');
});
test('Completeness: July 2026 complete, October 2026 partial', () => {
  const today = new Date(2026, 9, 26);
  const jul = periodRange('month', '2026-07');
  assert.equal(completeness(jul, weeksIn(jul, SEED_WEEKS), today).complete, true);
  const oct = periodRange('month', '2026-10');
  const c = completeness(oct, [], today);
  assert.equal(c.complete, false);
  assert.equal(c.expected, 4);
  assert.equal(c.ended, 3);
  assert.equal(c.notYet, 1);
});
test('Seed matches the Junk Report workbook', () => {
  const byId = new Map(SEED_WEEKS.map((w) => [w.id, w]));
  assert.equal(SEED_WEEKS.length, 27);
  assert.deepEqual([byId.get('2026-10-21').totals.total, byId.get('2026-10-21').totals.junk], [744, 258]);
  assert.deepEqual([byId.get('2026-07-01').totals.total, byId.get('2026-07-01').totals.junk], [3787, 2042]);
  // The report's Grand Total row adds the wrong columns here; its programme rows give 165.
  assert.equal(byId.get('2026-09-30').totals.junk, 165);
});
test('Seeded weeks: programme rows add up to the week totals', () => {
  for (const w of SEED_WEEKS) {
    assert.ok(w.programmes.length > 0, w.label);
    assert.equal(w.programmes.reduce((s, p) => s + p.total, 0), w.totals.total, w.label);
    assert.equal(w.programmes.reduce((s, p) => s + p.junk, 0), w.totals.junk, w.label);
  }
});
test('Seeded weeks all carry the category split', () => {
  const aug = aggregate(weeksIn(periodRange('month', '2026-08'), SEED_WEEKS));
  assert.equal(aug.weeksNoCats, 0);
  assert.equal(aug.categories.jl + aug.categories.fin + aug.categories.ni, aug.totals.junk);
});

console.log('Custom date ranges');
test('Custom range is inclusive and reports day count', () => {
  const r = periodRange('custom', { start: '2026-07-01', end: '2026-07-03' });
  assert.equal(inclusiveDayCount(r.start, r.end), 3);
  assert.match(r.label, /3 days/);
  // Swapped dates are normalized.
  const swapped = periodRange('custom', { start: '2026-07-03', end: '2026-07-01' });
  assert.equal(swapped.anchor.start, '2026-07-01');
  assert.equal(swapped.anchor.end, '2026-07-03');
});
test('Short mid-week custom range overlaps reporting weeks (not Tuesday-only)', () => {
  // Wed 1 Jul – Tue 7 Jul 2026. Custom Wed–Thu must include that week.
  const r = periodRange('custom', { start: '2026-07-01', end: '2026-07-02' });
  assert.deepEqual(overlappingWeekIds(r), ['2026-07-01']);
  assert.deepEqual(weeksIn(r, SEED_WEEKS).map((w) => w.id), ['2026-07-01']);
  // Custom membership uses overlap (same as weekIdsEndingIn for custom).
  assert.deepEqual(weekIdsEndingIn(r), ['2026-07-01']);
});
test('Custom 2–7 day picks all include overlapping seed weeks', () => {
  for (const end of ['2026-07-02', '2026-07-03', '2026-07-04', '2026-07-07']) {
    const r = periodRange('custom', { start: '2026-07-01', end });
    assert.ok(weeksIn(r, SEED_WEEKS).some((w) => w.id === '2026-07-01'), end);
  }
});
test('Previous custom range shifts by the same inclusive day count', () => {
  const r = periodRange('custom', { start: '2026-07-01', end: '2026-07-03' });
  const prev = previousRange(r);
  assert.equal(prev.anchor.start, '2026-06-28');
  assert.equal(prev.anchor.end, '2026-06-30');
  assert.equal(inclusiveDayCount(prev.start, prev.end), 3);
});
test('Lead-level custom slice filters KPIs to selected dates', () => {
  const week = {
    id: '2026-07-01',
    start: '2026-07-01',
    end: '2026-07-07',
    label: '1 Jul - 7 Jul 2026',
    totals: { total: 3, junk: 2, jl: 1, fin: 1, ni: 0, started: 1, submitted: 0, enrolled: 0 },
    programmes: [],
    campaigns: [],
    stageCols: [{ key: 'JUNK LEAD', label: 'Junk Lead' }, { key: 'COUNSELLED', label: 'Counselled' }],
    rows: {
      courses: ['MBA'],
      stages: ['JUNK LEAD', 'COUNSELLED', 'FINANCIAL BARRIER'],
      campaigns: ['FB'],
      leads: [
        [0, 0, 0, '2026-07-01'],
        [0, 1, 0, '2026-07-02'],
        [0, 2, 0, '2026-07-05'],
      ],
    },
  };
  const sliced = sliceWeekToCustomDates(week, '2026-07-01', '2026-07-02');
  assert.equal(sliced.customSliced, true);
  assert.equal(sliced.totals.total, 2);
  assert.equal(sliced.totals.junk, 1);
  assert.equal(sliced.totals.jl, 1);
  assert.equal(sliced.totals.started, null);
  assert.equal(sliced.rows.leads.length, 2);

  const range = periodRange('custom', { start: '2026-07-01', end: '2026-07-02' });
  const prepared = prepareWeeksForPeriod([week], range);
  assert.equal(aggregate(prepared).totals.total, 2);

  // Blank registration dates must not zero the week — treat like imported history.
  const noDates = {
    ...week,
    rows: {
      ...week.rows,
      leads: [
        [0, 0, 0, ''],
        [0, 1, 0, ''],
        [0, 2, 0, ''],
      ],
    },
  };
  const unsliced = sliceWeekToCustomDates(noDates, '2026-07-01', '2026-07-02');
  assert.equal(unsliced.customSliced, false);
  assert.equal(unsliced.totals.total, 3);
});

console.log('Access & programme assignment');
test('Seeded team includes Super Admin and Admins', () => {
  const users = ensureUsers(null);
  assert.ok(users.some((u) => u.role === ROLES.SUPERADMIN && u.name === 'Priya'));
  assert.ok(users.some((u) => u.name === 'Ravi' && u.role === ROLES.ADMIN));
  assert.ok(users.some((u) => u.name === 'Jitendar'));
  assert.ok(users.some((u) => u.name === 'Manjusha'));
});
test('Authenticate by name + PIN', () => {
  const users = ensureUsers(null);
  assert.equal(authenticate(users, 'Ravi', 'wrong').ok, false);
  const ok = authenticate(users, 'Ravi', '1234');
  assert.equal(ok.ok, true);
  assert.equal(ok.user.role, ROLES.ADMIN);
  assert.equal(ok.user.pin, undefined);
});
test('Super Admin assigns programmes to a team member', () => {
  const users = ensureUsers(null);
  const ravi = users.find((u) => u.name === 'Ravi');
  const manjusha = users.find((u) => u.name === 'Manjusha');
  let a = setUserProgrammes([], {
    userId: ravi.id,
    programmes: [{ key: 'MBA IN BUSINESS ANALYTICS', label: 'MBA IN BUSINESS ANALYTICS' }],
    assignedBy: 'user_super',
  });
  assert.deepEqual(programmeKeysForUser(a, ravi), ['MBA IN BUSINESS ANALYTICS']);
  assert.equal(programmeKeysForUser(a, { role: ROLES.SUPERADMIN }), null);
  // Claiming the same programme moves it to Manjusha.
  a = setUserProgrammes(a, {
    userId: manjusha.id,
    programmes: [{ key: 'MBA IN BUSINESS ANALYTICS', label: 'MBA IN BUSINESS ANALYTICS' }],
    assignedBy: 'user_super',
  });
  assert.deepEqual(programmeKeysForUser(a, ravi), []);
  assert.deepEqual(programmeKeysForUser(a, manjusha), ['MBA IN BUSINESS ANALYTICS']);
});
test('scopeAggregate helper can filter to selected programmes (optional; UI shows all)', () => {
  const agg = {
    programmes: [
      { key: 'A', label: 'A', total: 100, junk: 40, jl: 10, fin: 10, ni: 20, started: 1, submitted: 1, enrolled: 1, untouched: 5, junkPct: 0.4 },
      { key: 'B', label: 'B', total: 50, junk: 10, jl: 5, fin: 5, ni: 0, started: 0, submitted: 0, enrolled: 0, untouched: 2, junkPct: 0.2 },
    ],
    campaigns: [{ course: 'A', label: 'FB', total: 10, junk: 2 }, { course: 'B', label: 'G', total: 5, junk: 1 }],
    totals: { total: 150, junk: 50 },
    categories: { total: 150, junk: 50, jl: 15, fin: 15, ni: 20, other: 100 },
    weeksDetailed: 1,
  };
  const scoped = scopeAggregate(agg, ['A']);
  assert.equal(scoped.programmes.length, 1);
  assert.equal(scoped.totals.total, 100);
  assert.equal(scoped.totals.junk, 40);
  assert.equal(scoped.campaigns.length, 1);
  assert.equal(canAccess({ role: ROLES.ADMIN }, 'team'), false);
  assert.equal(canAccess({ role: ROLES.SUPERADMIN }, 'team'), true);
});
test('Access matrix: Super Admin full access, Admin analyse-only', () => {
  const sa = { role: ROLES.SUPERADMIN };
  const ad = { role: ROLES.ADMIN };
  for (const v of ALL_VIEWS) assert.equal(canAccess(sa, v), true, `super → ${v}`);
  for (const v of ADMIN_VIEWS) assert.equal(canAccess(ad, v), true, `admin → ${v}`);
  for (const v of ['run', 'team', 'clients', 'settings']) {
    assert.equal(canAccess(ad, v), false, `admin blocked → ${v}`);
  }
  assert.equal(canRunWeekly(sa), true);
  assert.equal(canRunWeekly(ad), false);
  assert.equal(canManageTeam(sa), true);
  assert.equal(canManageTeam(ad), false);
  assert.equal(canManageClients(sa), true);
  assert.equal(canManageClients(ad), false);
  assert.equal(canManageSettings(sa), true);
  assert.equal(canManageSettings(ad), false);
  assert.equal(canMutateHistory(sa), true);
  assert.equal(canMutateHistory(ad), false);
});
test('scopeWeeks can align week series to a programme subset (optional helper)', () => {
  const jul = weeksIn(periodRange('month', '2026-07'), SEED_WEEKS);
  const key = jul[0].programmes[0].key;
  const full = aggregate(jul);
  const scoped = aggregate(scopeWeeks(jul, [key]));
  assert.ok(scoped.totals.total < full.totals.total);
  // Series week total equals that programme’s week total, not the full-client week.
  assert.equal(scoped.series[0].total, jul[0].programmes.find((p) => p.key === key).total);
  assert.ok(scoped.series[0].total < full.series[0].total);
});

console.log('Clients');
test('normalizeClient requires name and websiteOrId', () => {
  assert.equal(normalizeClient({ name: '', websiteOrId: 'x' }).ok, false);
  assert.equal(normalizeClient({ name: 'Acme', websiteOrId: '' }).ok, false);
  const ok = normalizeClient({ name: ' Acme ', websiteOrId: 'acme.com', product: 'Ads', junkPct: 40 });
  assert.equal(ok.ok, true);
  assert.equal(ok.client.name, 'Acme');
  assert.equal(ok.client.junkPct, 40);
});
test('weekBelongsToClient treats untagged weeks as legacy only', () => {
  const legacy = 'client_jgu_legacy';
  const w = { id: '2026-01-01', totals: { junk: 1, total: 2 } };
  assert.equal(weekBelongsToClient(w, legacy, legacy), true);
  assert.equal(weekBelongsToClient(w, 'other', legacy), false);
  assert.equal(weekBelongsToClient({ ...w, clientId: 'other' }, 'other', legacy), true);
});
test('weeksForClient and overall junk %', () => {
  const legacy = migrateLegacyClient({ threshold: 50 });
  const weeks = [
    { id: 'a', clientId: legacy.id, totals: { junk: 10, total: 100 } },
    { id: 'b', clientId: 'x', totals: { junk: 50, total: 100 } },
  ];
  const scoped = weeksForClient(weeks, legacy.id, legacy.id);
  assert.equal(scoped.length, 1);
  assert.equal(clientOverallJunkPct(scoped), 0.1);
});

test('Two clients can save the same week without overwriting each other', () => {
  const jgu = { id: '2026-10-21', clientId: LEGACY_CLIENT_ID, source: 'approved', approvedAt: '2026-10-28', totals: { total: 744, junk: 258 } };
  const jia = { id: '2026-10-21', clientId: 'client_jia', source: 'approved', approvedAt: '2026-10-29', totals: { total: 90, junk: 10 } };
  assert.equal(weekKey(jgu), '2026-10-21'); // JGU keeps its original key
  assert.equal(weekKey({ id: '2026-10-21' }), '2026-10-21'); // untagged = JGU
  assert.notEqual(weekKey(jgu), weekKey(jia));
  const merged = mergeHistory([jgu], [jia]);
  assert.equal(merged.weeks.length, 2);
  assert.equal(merged.added, 1);
  // A newer approval of the same client + week replaces only that client's week.
  const again = mergeHistory(merged.weeks, [{ ...jia, approvedAt: '2026-10-30', totals: { total: 95, junk: 11 } }]);
  assert.equal(again.weeks.length, 2);
  assert.equal(again.weeks.find((w) => w.clientId === LEGACY_CLIENT_ID).totals.total, 744);
  assert.equal(again.weeks.find((w) => w.clientId === 'client_jia').totals.total, 95);
});

console.log(`\n${passed} tests passed`);
