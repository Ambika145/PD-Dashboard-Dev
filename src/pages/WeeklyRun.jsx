import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context.js';
import Icon from '../components/Icons.jsx';
import ReportTable from '../components/ReportTable.jsx';
import { Kpi, Tag, Callout, Seg, DataTable, Card, Empty, fmt, fmtPct } from '../components/ui.jsx';
import { buildReport, serializeWeek, detectColumn, weekLabel, formatDay, isoDate, fromIso, weekFromStart, defaultWeek, addDays, keyOf, toTSV } from '../lib/junkCore.js';
import { parseFile } from '../lib/files.js';
import { canRunWeekly } from '../lib/access.js';

// The three Meritto exports, in the order of the process document.
const DATASETS = {
  leads: {
    part: 'Part 1', title: 'Leads', doc: 'Doc Steps 2–4',
    fields: [
      { f: 'course', label: 'Course', req: true },
      { f: 'stage', label: 'Lead Stage', req: true },
      { f: 'subStage', label: 'Lead Sub Stage (DNP)' },
      { f: 'noteCount', label: 'Note Count / DNP History' },
      { f: 'campaign', label: 'Primary Registration Campaign' },
      { f: 'leadDate', label: 'User Registration Date' },
    ],
    steps: (w) => [
      <>Meritto → <b>Lead Manager → Manage Leads</b>.</>,
      <><b>User Registration Date</b> → <b>{w.from}</b> to <b>{w.to}</b> → <b>Apply</b>.</>,
      <><b>Customise Columns</b> → add <b>Course</b>, <b>Primary Registration Campaign</b>, plus <b>Lead Sub Stage</b> and <b>Note Count</b> (or DNP History) for DNP detail → <b>Apply</b>.</>,
      <><b>Download Leads</b> → <b>View Export</b> → select <b>Course</b> → <b>Apply</b> → <b>CSV</b> → <b>Download</b>.</>,
      <><b>View Export Status</b> → wait ~10 s, refresh → first row → <b>⋮</b> beside 0 → download.</>,
    ],
  },
  enrol: {
    part: 'Part 2', title: 'Enrolments', doc: 'Doc Steps 10–12',
    fields: [
      { f: 'course', label: 'Course', req: true },
      { f: 'campaign', label: 'Primary Registration Campaign' },
      { f: 'enrolStatus', label: 'Enrolment Status' },
      { f: 'enrolDate', label: 'Enrolment Date' },
    ],
    steps: (w) => [
      <>Meritto → <b>Application Manager → Manage Application</b> → <b>Advanced Filter</b>.</>,
      <><b>Enrolment Status</b> → <b>Equal</b> → <b>Yes</b>.</>,
      <><b>+</b> → <b>Enrolment Date</b> → <b>Between</b> → <b>{w.from}</b> to <b>{w.to}</b> → <b>Apply</b>.</>,
      <>Add <b>Course</b> and <b>Primary Registration Campaign</b> columns → <b>Download Application</b> → <b>Click Here</b>.</>,
      <>Wait ~10 s, refresh → first row → <b>⋮</b> beside 0 → download.</>,
    ],
  },
  apps: {
    part: 'Part 3', title: 'Applications', doc: 'Doc Steps 14–15',
    fields: [
      { f: 'course', label: 'Course', req: true },
      { f: 'payment', label: 'Payment Status', req: true },
      { f: 'campaign', label: 'Primary Registration Campaign' },
      { f: 'enrolStatus', label: 'Enrolment Status' },
      { f: 'formDate', label: 'Form Starting Date' },
    ],
    steps: (w) => [
      <>Meritto → <b>Application Manager → Manage Application</b> → <b>Advanced Filter</b>.</>,
      <><b>Enrolment Status</b> → <b>Equal</b> → <b>No</b>.</>,
      <><b>+</b> → <b>Form Starting Date</b> → <b>Between</b> → <b>{w.from}</b> to <b>{w.to}</b> → <b>Apply</b>.</>,
      <>Add <b>Course</b> and <b>Primary Registration Campaign</b> columns → <b>Application Download</b> → download.</>,
    ],
  },
};

export default function WeeklyRun() {
  const { run, setRun, settings, updateSettings, putWeek, weeks, toast, goTo, activeClient, user } = useApp();
  const [loading, setLoading] = useState({});
  const [view, setView] = useState('programme');
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const { files, week } = run;
  const step = Math.min(run.step, 4);

  const report = useMemo(
    () => (files.leads || files.enrol || files.apps
      ? buildReport({ leads: files.leads, enrol: files.enrol, apps: files.apps, settings, week })
      : null),
    [files, week, settings],
  );
  const errors = report ? report.checks.filter((c) => c.level === 'error') : [];
  const warns = report ? report.checks.filter((c) => c.level === 'warn') : [];
  const notes = report ? report.checks.filter((c) => c.level === 'info' || c.level === 'ok') : [];
  const newCourses = report ? report.courses.filter((c) => c.status === 'new') : [];
  const reviewCount = warns.length + errors.length;

  useEffect(() => {
    if (run.reviewCount !== reviewCount) setRun((r) => ({ ...r, reviewCount }));
  }, [reviewCount, run.reviewCount, setRun]);
  useEffect(() => { setReviewed(false); }, [files, week, settings]);

  const weekId = isoDate(week.start);
  const existing = weeks.find((w) => w.id === weekId);
  const isApproved = run.approved === weekId;
  const fileReady = (ds) => !!files[ds] && DATASETS[ds].fields.every((x) => !x.req || files[ds].cols[x.f]);
  const allFiles = ['leads', 'enrol', 'apps'].every(fileReady);
  const uploaded = ['leads', 'enrol', 'apps'].filter((ds) => files[ds]).length;
  const otherErrors = errors.filter((c) => !/not uploaded|column not chosen/.test(c.title));

  const status = {
    1: 'done',
    2: allFiles ? 'done' : uploaded ? 'blocked' : 'todo',
    3: !allFiles ? 'todo' : otherErrors.length ? 'blocked' : warns.length ? 'blocked' : 'done',
    4: isApproved ? 'done' : 'todo',
  };
  const STEPS = [
    [1, 'Week', weekLabel(week)],
    [2, 'Upload exports', `${uploaded} of 3 files`],
    [3, 'Review', !allFiles ? 'After upload' : otherErrors.length ? `${otherErrors.length} to fix` : warns.length ? `${warns.length} to check` : 'All clear'],
    [4, 'Approve', isApproved ? 'Approved' : 'Review & approve'],
  ];

  const go = (n) => { setRun((r) => ({ ...r, step: n })); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const loadFile = async (ds, file) => {
    setLoading((l) => ({ ...l, [ds]: file.name }));
    try {
      const { headers, rows } = await parseFile(file);
      if (!headers.length) throw new Error('No header row found in the file.');
      const memory = (settings.columnMemory || {})[ds] || {};
      const cols = {};
      DATASETS[ds].fields.forEach(({ f }) => { cols[f] = memory[f] && headers.includes(memory[f]) ? memory[f] : detectColumn(headers, f); });
      setRun((r) => ({ ...r, approved: null, files: { ...r.files, [ds]: { name: file.name, headers, rows, cols } } }));
    } catch (e) {
      toast(`${DATASETS[ds].title}: ${e.message || e}`, 'err');
    } finally {
      setLoading((l) => ({ ...l, [ds]: null }));
    }
  };

  const setCol = (ds, f, header) => {
    setRun((r) => ({ ...r, approved: null, files: { ...r.files, [ds]: { ...r.files[ds], cols: { ...r.files[ds].cols, [f]: header } } } }));
    const mem = { ...(settings.columnMemory || {}) };
    mem[ds] = { ...(mem[ds] || {}), [f]: header };
    updateSettings({ ...settings, columnMemory: mem });
  };

  const setCourse = (label, to) => {
    const key = keyOf(label);
    const excluded = settings.excluded.filter((c) => keyOf(c) !== key);
    const managed = settings.managed.filter((c) => keyOf(c) !== key);
    (to === 'excluded' ? excluded : managed).push(label);
    updateSettings({ ...settings, excluded, managed });
  };

  const setWeek = (start) => setRun((r) => ({ ...r, week: weekFromStart(start), approved: null }));

  const approve = async () => {
    setBusy(true);
    try {
      const w = serializeWeek(report, { week, files: Object.values(files).map((f) => f.name) });
      await putWeek(w);
      setRun((r) => ({ ...r, approved: w.id }));
      toast(`${w.label} approved and saved to History.`);
    } catch (e) {
      toast(`Could not save the week: ${e.message}`, 'err');
    } finally {
      setBusy(false);
    }
  };

  const startNext = () => setRun({ week: weekFromStart(addDays(week.start, 7)), files: { leads: null, enrol: null, apps: null }, step: 1, approved: null, reviewCount: 0 });

  // ----- next-action bar -----
  let nextMsg = '';
  let nextOk = true;
  if (step === 1) nextMsg = `Reporting week: ${weekLabel(week)}`;
  else if (step === 2) {
    nextOk = allFiles;
    nextMsg = allFiles ? 'All three files are ready.' : `Upload ${3 - uploaded === 1 ? 'the last file' : `${3 - uploaded} more files`} to continue.`;
    if (uploaded === 3 && !allFiles) nextMsg = 'Choose the missing column to continue.';
  } else if (step === 3) {
    nextOk = allFiles && !otherErrors.length;
    nextMsg = otherErrors.length ? 'Fix the issues above to continue.' : warns.length ? 'Read the items above, then continue.' : 'Everything looks right.';
  }

  const w = { from: formatDay(week.start), to: formatDay(week.end) };

  if (!canRunWeekly(user)) {
    return (
      <div className="card">
        <Empty icon="run" title="Super Admin only" action={<button className="btn" type="button" onClick={() => goTo('overview')}>Back to Overview</button>}>
          Only Super Admin can upload Meritto exports and approve weeks. Ask Super Admin if a week needs to be run.
        </Empty>
      </div>
    );
  }

  return (
    <>
      <nav className="steps" aria-label="Weekly run steps">
        {STEPS.map(([n, t, s]) => (
          <button key={n} type="button" className={`step-item ${status[n]} ${step === n ? 'now' : ''}`} aria-current={step === n ? 'step' : undefined} onClick={() => go(n)}>
            <span className="step-n">{status[n] === 'done' && step !== n ? <Icon name="check" size={12} stroke={3} /> : n}</span>
            <span className="step-txt"><span className="step-t">{t}</span><span className="step-s">{s}</span></span>
          </button>
        ))}
      </nav>

      <div className="run-body">
        {step === 1 && (
          <Card>
            <h2 className="section-title">Which week are you reporting?</h2>
            <p className="section-sub">The Junk week runs Wednesday to Tuesday. Every Meritto filter uses these dates.</p>
            <div className="week-pick" style={{ marginTop: 20 }}>
              <label className="field">Week starts on
                <input className="input" type="date" value={isoDate(week.start)} onChange={(e) => e.target.value && setWeek(fromIso(e.target.value))} />
              </label>
              <div>
                <div className="week-big">{weekLabel(week)}</div>
                <div className="small muted">{formatDay(week.start)} → {formatDay(week.end)}</div>
              </div>
            </div>
            <div className="btns" style={{ marginTop: 16 }}>
              <button className="btn ghost sm" type="button" onClick={() => setWeek(addDays(week.start, -7))}><Icon name="arrowLeft" size={13} />Previous</button>
              <button className="btn ghost sm" type="button" onClick={() => setWeek(defaultWeek().start)}>Last completed week</button>
              <button className="btn ghost sm" type="button" onClick={() => setWeek(addDays(week.start, 7))}>Next<Icon name="arrowRight" size={13} /></button>
            </div>
            {(week.start.getDay() !== 3 || week.end >= new Date(new Date().toDateString()) || existing) && (
              <div style={{ display: 'grid', gap: 8, marginTop: 18 }}>
                {week.start.getDay() !== 3 && <Callout tone="warn">This date is not a Wednesday.</Callout>}
                {week.end >= new Date(new Date().toDateString()) && <Callout tone="warn">This week has not ended yet, so the exports would be incomplete.</Callout>}
                {existing && <Callout tone="info">This week is already in History. Approving again will replace it.</Callout>}
              </div>
            )}
          </Card>
        )}

        {step === 2 && (
          <>
            <div>
              <h2 className="section-title">Upload the three Meritto exports</h2>
              <p className="section-sub">For {weekLabel(week)}. Download each file from Meritto with all courses, then drop it here.</p>
            </div>
            <div className="upload-grid">
              {Object.entries(DATASETS).map(([ds, d], i) => (
                <UploadTile key={ds} ds={ds} d={d} n={i + 1} file={files[ds]} loading={loading[ds]} w={w}
                  onFile={(f) => loadFile(ds, f)} onCol={(f, h) => setCol(ds, f, h)}
                  onRemove={() => setRun((r) => ({ ...r, approved: null, files: { ...r.files, [ds]: null } }))} />
              ))}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            {!allFiles ? <Callout tone="info">Upload all three files first.</Callout> : (
              <>
                <div className={`summary-banner ${otherErrors.length ? 'crit' : warns.length ? 'warn' : 'good'}`}>
                  <Icon name={otherErrors.length ? 'xCircle' : warns.length ? 'alert' : 'checkCircle'} size={22} />
                  <div>
                    <b>{otherErrors.length ? `${otherErrors.length} issue(s) must be fixed` : warns.length ? `${warns.length} item(s) to check` : 'Everything looks right'}</b>
                    <span className="small muted">{fmt(report.stats.included)} leads counted · {fmt(report.stats.excluded)} excluded (unmanaged programmes) · Junk rate {fmtPct(report.totals.junkPct, 1)}</span>
                  </div>
                </div>

                {newCourses.length > 0 && (
                  <Card title="New programmes" sub="Not on the managed list. They are counted until you decide (Doc Step 6).">
                    <div style={{ display: 'grid', gap: 8 }}>
                      {newCourses.map((c) => (
                        <div key={c.key} className="decision">
                          <div><div className="nm">{c.label}</div><div className="small muted">{fmt(c.leads)} leads this week</div></div>
                          <span className="btns">
                            <button className="btn ghost sm" type="button" onClick={() => setCourse(c.label, 'managed')}>Keep · managed</button>
                            <button className="btn ghost sm" type="button" onClick={() => setCourse(c.label, 'excluded')}>Exclude</button>
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {(otherErrors.length > 0 || warns.filter((c) => c.action?.type !== 'reviewCourses').length > 0) && (
                  <div className="check-list">
                    {[...otherErrors, ...warns.filter((c) => c.action?.type !== 'reviewCourses')].map((c, i) => <CheckRow key={i} c={c} />)}
                  </div>
                )}

                <details className="more">
                  <summary>{notes.length} more checks and notes</summary>
                  <div className="check-list">
                    {notes.map((c, i) => <CheckRow key={i} c={c} onKnow={(keys) => updateSettings({ ...settings, knownStages: [...settings.knownStages, ...keys] })} />)}
                  </div>
                </details>
                <details className="more">
                  <summary>All programmes in the files ({report.courses.length})</summary>
                  <div>
                    <DataTable
                      rows={report.courses}
                      initialSort={{ key: 'leads', dir: 'desc' }}
                      columns={[
                        { key: 'label', label: 'Programme', align: 'left', wrap: true },
                        { key: 'leads', label: 'Leads', render: (c) => fmt(c.leads) },
                        { key: 'enrol', label: 'Enrolled', render: (c) => fmt(c.enrol) },
                        { key: 'apps', label: 'Applications', render: (c) => fmt(c.apps) },
                        { key: 'status', label: 'Status', align: 'left', render: (c) => <Tag tone={c.status === 'new' ? 'warn' : c.status === 'managed' ? 'good' : 'neutral'} icon={false}>{c.status === 'new' ? 'New' : c.status === 'managed' ? 'Managed' : 'Excluded'}</Tag> },
                        { key: 'act', label: '', sort: false, render: (c) => (c.status === 'excluded'
                          ? <button className="btn quiet sm" type="button" onClick={() => setCourse(c.label, 'managed')}>Include</button>
                          : <button className="btn quiet sm" type="button" onClick={() => setCourse(c.label, 'excluded')}>Exclude</button>) },
                      ]}
                    />
                  </div>
                </details>
              </>
            )}
          </>
        )}

        {step === 4 && (
          !report || !allFiles ? <Callout tone="info">Upload and review the files first.</Callout>
            : isApproved ? (
              <Card>
                <div className="success">
                  <span className="ring"><Icon name="check" size={26} stroke={2.6} /></span>
                  <h2>{weekLabel(week)} approved</h2>
                  <p className="muted">This week is saved. Overview, Programmes, Records, and History now include these figures.</p>
                  <div className="btns" style={{ justifyContent: 'center', marginTop: 8 }}>
                    <button className="btn ghost" type="button" onClick={() => goTo('overview')}>View Overview</button>
                    <button className="btn ghost" type="button" onClick={() => goTo('history')}>Open History</button>
                    <button className="btn" type="button" onClick={startNext}>Start next week</button>
                  </div>
                </div>
              </Card>
            ) : (
              <>
                <div className="grid cols-4">
                  <Kpi tone="hero" label="Junk rate" value={fmtPct(report.totals.junkPct, 1)} sub={`${fmt(report.totals.junk)} of ${fmt(report.totals.total)} leads`} />
                  <Kpi label="Leads analysed" value={fmt(report.totals.total)} sub={`${fmt(report.stats.excluded)} rows excluded`} />
                  <Kpi label="Applications" value={fmt(report.totals.submitted)} sub={`submitted · ${fmt(report.totals.started)} started`} />
                  <Kpi label="Enrollments" value={fmt(report.totals.enrolled)} sub="Enrolment Status = Yes" />
                </div>
                <Card
                  title={`Weekly Performance (${activeClient?.name || 'Client'})`}
                  sub="Same layout as the Excel sheet"
                  actions={<>
                    <Seg label="Report" value={view} onChange={setView} options={[{ value: 'programme', label: 'Programme' }, { value: 'campaign', label: 'Campaign', disabled: !report.hasCampaign }]} />
                    <button className="btn ghost sm" type="button" onClick={async () => {
                      try { await navigator.clipboard.writeText(toTSV(report, view, weekLabel(week))); toast('Table copied — paste it into the Weekly Performance sheet.'); } catch (e) { toast('Copy is blocked in this browser. You can still approve and view the report here.', 'err'); }
                    }}><Icon name="copy" size={14} />Copy</button>
                  </>}
                >
                  <ReportTable report={report} kind={view} threshold={settings.threshold} untouchedThreshold={settings.untouchedThreshold ?? 30} label={weekLabel(week)} />
                </Card>
                <div className="approve-box">
                  <div className="facts">
                    <div><span>Week</span><b>{weekLabel(week)}</b></div>
                    <div><span>Checks</span><b>{otherErrors.length ? `${otherErrors.length} to fix` : warns.length ? `${warns.length} reviewed` : 'All passed'}</b></div>
                    <div><span>Files</span><b className="small" style={{ fontWeight: 500 }}>{Object.values(files).map((f) => f.name).join(', ')}</b></div>
                  </div>
                  {existing && <Callout tone="info">This replaces the saved entry for {existing.label}.</Callout>}
                  {otherErrors.length > 0 && <Callout tone="crit">Fix the issues in Review before approving.</Callout>}
                  <label className="toggle">
                    <input type="checkbox" checked={reviewed} disabled={otherErrors.length > 0} onChange={(e) => setReviewed(e.target.checked)} />
                    I have checked the figures for {weekLabel(week)}.
                  </label>
                  <div><button className="btn lg" type="button" disabled={!reviewed || otherErrors.length > 0 || busy} onClick={approve}><Icon name="check" size={16} />{busy ? 'Saving…' : 'Approve'}</button></div>
                </div>
              </>
            )
        )}
      </div>

      {step < 4 && (
        <div className="next-bar">
          <div className="next-inner">
            <span className="msg">{nextMsg}</span>
            <span className="btns">
              {step > 1 && <button className="btn ghost" type="button" onClick={() => go(step - 1)}>Back</button>}
              <button className="btn" type="button" disabled={!nextOk} onClick={() => go(step + 1)}>Continue<Icon name="arrowRight" size={15} /></button>
            </span>
          </div>
        </div>
      )}
    </>
  );
}

function UploadTile({ ds, d, n, file, loading, w, onFile, onCol, onRemove }) {
  const [over, setOver] = useState(false);
  const [help, setHelp] = useState(false);
  const [cols, setCols] = useState(false);
  const missing = file ? d.fields.filter((x) => x.req && !file.cols[x.f]) : [];
  const ok = file && !missing.length;
  return (
    <div className={`tile ${ok ? 'ok' : missing.length ? 'bad' : ''}`}>
      <div className="tile-head">
        <div><div className="tile-title">{n}. {d.title}</div><div className="tile-sub">{d.part} · {d.doc}</div></div>
        {ok ? <Tag tone="good">Ready</Tag> : missing.length ? <Tag tone="warn">Check columns</Tag> : null}
      </div>

      {loading ? (
        <div className="drop" aria-busy="true"><div className="skeleton" style={{ width: 120, height: 10 }} /><span>Reading file…</span></div>
      ) : file ? (
        <div className="file-row"><Icon name="checkCircle" size={16} /><span className="fn" title={file.name}>{file.name}</span><span className="fm">{fmt(file.rows.length)} rows</span></div>
      ) : (
        <label className={`drop ${over ? 'over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); }}>
          <input type="file" accept=".csv,.xlsx,.txt" hidden data-ds={ds} onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} />
          <Icon name="upload" size={22} />
          <b>Drop file or click</b>
          <span>CSV or .xlsx</span>
        </label>
      )}

      {(missing.length > 0 || cols) && file && (
        <div className="mapping">
          {d.fields.filter((x) => cols || x.req).map((x) => (
            <label key={x.f} className="field">{x.label}{x.req && <span className="req"> *</span>}
              <select className="select" value={file.cols[x.f] || ''} onChange={(e) => onCol(x.f, e.target.value)}>
                <option value="">— not in file —</option>
                {file.headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}

      {help && <ol className="howto">{d.steps(w).map((s, i) => <li key={i}>{s}</li>)}</ol>}

      <div className="tile-links">
        <button type="button" className="link" onClick={() => setHelp(!help)}>{help ? 'Hide steps' : 'How to export'}</button>
        {file && !missing.length && <button type="button" className="link" onClick={() => setCols(!cols)}>{cols ? 'Hide columns' : 'Columns'}</button>}
        {file && (
          <label className="link" style={{ cursor: 'pointer' }}>Replace<input type="file" accept=".csv,.xlsx,.txt" hidden onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} /></label>
        )}
        {file && <button type="button" className="link" onClick={onRemove}>Remove</button>}
      </div>
    </div>
  );
}

const CHECK_ICON = { error: 'xCircle', warn: 'alert', info: 'info', ok: 'checkCircle' };
function CheckRow({ c, onKnow }) {
  return (
    <div className={`check ${c.level}`}>
      <Icon name={CHECK_ICON[c.level]} size={15} />
      <div>
        <div className="t">{c.title}</div>
        {c.detail && <div className="d">{c.detail}</div>}
        {c.action?.type === 'knowStages' && onKnow && <button className="btn ghost sm" type="button" style={{ marginTop: 8 }} onClick={() => onKnow(c.action.keys)}>Mark as known stages</button>}
      </div>
    </div>
  );
}
