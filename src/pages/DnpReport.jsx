import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context.js';
import Chart, { chartTokens } from '../components/Chart.jsx';
import Icon from '../components/Icons.jsx';
import { DataTable, Empty, Kpi, Card, fmt, fmtPct } from '../components/ui.jsx';
import { CALL_ATTEMPT_BUCKETS, dnpProgrammeReport, emptyCallAttempts } from '../lib/junkCore.js';
import { downloadBlob, toCSV } from '../lib/files.js';
import { shortName, itemsDonutOption } from '../lib/charts.js';
import { canRunWeekly } from '../lib/access.js';

const avg = (n) => (Number.isFinite(n) ? n.toFixed(1) : '—');

/** Adds programme rows into one total row with the same shape. */
function sumRows(rows) {
  const t = { leads: 0, dnp: 0, notesKnown: 0, noteSum: 0, noNote: 0, callAttempts: emptyCallAttempts() };
  for (const r of rows) {
    for (const f of ['leads', 'dnp', 'notesKnown', 'noteSum', 'noNote']) t[f] += r[f] || 0;
    for (const b of CALL_ATTEMPT_BUCKETS) t.callAttempts[b.key] += r.callAttempts[b.key] || 0;
  }
  t.dnpPct = t.leads ? t.dnp / t.leads : 0;
  t.avgCalls = t.notesKnown ? t.noteSum / t.notesKnown : 0;
  return t;
}

export default function DnpReport() {
  const { derived: d, drill, goTo, toast, user, resolvedTheme } = useApp();
  const tk = useMemo(() => chartTokens(), [resolvedTheme]);
  const canRun = canRunWeekly(user);
  const [sel, setSel] = useState(drill.programme || '');
  useEffect(() => { setSel(drill.programme || ''); }, [drill]);

  const rows = useMemo(() => (d ? dnpProgrammeReport(d.weeks, d.agg.programmes) : []), [d]);

  if (!d) return null;
  const { agg } = d;
  if (!agg.weeks || !agg.weeksDetailed) {
    return (
      <div className="card">
        <Empty
          icon="phoneMissed"
          title={agg.weeks ? 'No stage detail in this period' : `No data for ${d.range.label}`}
          action={<button className="btn" type="button" onClick={() => goTo(canRun ? 'run' : 'overview')}>{canRun ? 'Go to Weekly run' : 'Back to Overview'}</button>}
        >
          The DNP Calling report needs Lead Stage counts per programme. Choose another period above, or approve a weekly run.
        </Empty>
      </div>
    );
  }
  if (!rows.length) {
    return (
      <div className="card">
        <Empty icon="phoneMissed" title={`No DNP leads in ${d.range.label}`}>
          No lead has Lead Stage = DID NOT PICK (DNP) in this period.
        </Empty>
      </div>
    );
  }

  const hasLeadRows = d.weeks.some((w) => w.rows?.leads?.length);
  // Programme-wise detail defaults to the programme with the most DNP leads.
  const current = rows.find((r) => r.key === sel) || rows[0];
  const all = sumRows(rows);
  const notesMapped = all.notesKnown > 0;
  const openLeads = (progKey, extra = {}) => {
    if (!hasLeadRows) return;
    goTo('records', { bucket: 'dnp', ...(progKey ? { programme: progKey } : {}), ...extra });
  };
  const dnpDetail = agg.dnpDetail;
  const openAllLeads = (drill) => { if (hasLeadRows) goTo('records', drill); };
  const dnpDonut = dnpDetail?.substagesMapped && dnpDetail.substages.length
    ? itemsDonutOption(
      tk,
      dnpDetail.substages.slice(0, 8).map((s, i) => ({
        name: s.label,
        id: s.key || s.label,
        value: s.n,
        color: ['#7c3aed', '#8b5cf6', '#a78bfa', '#6d28d9', '#5b21b6', '#c4b5fd', '#4c1d95', '#ddd6fe'][i % 8],
      })),
      { centerValue: fmt(dnpDetail.total), centerLabel: 'DNP leads' },
    )
    : null;
  const pickProgramme = (key) => {
    setSel(key);
    setTimeout(() => document.getElementById('dnp-programme')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  // One block = KPIs + calling report for a scope (overall, or one programme).
  const ReportBlock = ({ r, title, progKey }) => (
    <>
      <div className="grid cols-4">
        <Kpi icon="phoneMissed" iconTone="violet" label="DNP leads" value={fmt(r.dnp)} sub={`${fmtPct(r.dnpPct, 1)} of ${fmt(r.leads)} leads`} />
        <Kpi icon="checkCircle" iconTone="teal" label="With Note Count" value={notesMapped ? fmt(r.notesKnown) : '—'} sub={notesMapped ? `${fmt(r.noNote)} with no Note Count` : 'Map Note Count on Weekly run'} />
        <Kpi icon="activity" iconTone="blue" label="Total call attempts" value={notesMapped ? fmt(r.noteSum) : '—'} sub="Sum of Note Count" />
        <Kpi icon="target" iconTone="amber" label="Avg calls per DNP lead" value={notesMapped && r.notesKnown ? avg(r.avgCalls) : '—'} sub="Total call attempts ÷ With Note Count" />
      </div>
      {!notesMapped ? (
        progKey ? (
          <p className="small muted">No call-attempt data for this programme in {d.range.label} (see Overall above for how to add it).</p>
        ) : (
          <Card icon="phoneMissed" iconTone="violet" title="DNP Calling report: no call-attempt data for this period" sub="Lead Stage = DID NOT PICK (DNP). Note Count is treated as Call Attempts.">
            <Empty icon="phoneMissed" title={`No Note Count for the ${fmt(r.dnp)} DNP leads in ${d.range.label}`}>
              The 1 / 2 / 3 / 4 / 5+ Calls rows need the number of calls for each lead. None of the weeks here have it:
              {agg.weeksImported ? ` ${agg.weeksImported} week(s) were imported from the Junk Report workbook, which has no call counts,` : ''}
              {hasLeadRows ? ' and the leads file approved in Weekly run had no Note Count column mapped.' : ' and no week was approved in Weekly run.'}
              {' '}To fill this: in Meritto, <b>Customise Columns</b> on the leads export → add <b>Note Count</b> (or DNP History / Call Attempts) → in <b>Weekly run</b>, map it as <b>Note Count / DNP History</b> and approve the week.
              The DNP lead counts are still correct.
            </Empty>
          </Card>
        )
      ) : (
      <Card
          icon="phoneMissed"
          iconTone="violet"
          title={`DNP Calling report: ${title}`}
          sub="Lead Stage = DID NOT PICK (DNP). Note Count is treated as Call Attempts."
          actions={hasLeadRows ? <button className="btn ghost sm" type="button" onClick={() => openLeads(progKey, {})}>See these DNP leads</button> : null}
          foot={`% is of the ${fmt(r.notesKnown)} DNP leads with a Note Count.${hasLeadRows ? ' Click a row to see those leads.' : ''}`}
        >
          <div className="call-report">
            <div className="call-report-head">
              <span>Call Attempts</span>
              <span className="num">Number of DNP leads</span>
              <span className="num">%</span>
            </div>
            {CALL_ATTEMPT_BUCKETS.map((b) => {
              const n = r.callAttempts[b.key];
              const pct = r.notesKnown ? n / r.notesKnown : 0;
              return (
                <button
                  key={b.key}
                  type="button"
                  className="call-report-row"
                  onClick={hasLeadRows ? () => openLeads(progKey, { notes: b.key }) : undefined}
                  title={hasLeadRows ? `See DNP leads with ${b.label}` : undefined}
                >
                  <span className="call-report-label">{b.label}</span>
                  <span className="call-report-n num">{fmt(n)}</span>
                  <span className="call-report-pct num">{fmtPct(pct, 1)}</span>
                  <span className="call-report-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, pct * 100)}%` }} /></span>
                </button>
              );
            })}
            <div className="call-report-total">
              <span>Total with Note Count</span>
              <span className="num">{fmt(r.notesKnown)}</span>
              <span className="num">100%</span>
            </div>
            <div className="call-report-total" style={{ marginTop: 0, borderTop: 0, fontWeight: 600, color: 'var(--muted)' }}>
              <span>No Note Count (not in %)</span>
              <span className="num">{fmt(r.noNote)}</span>
              <span className="num">—</span>
            </div>
            <div className="call-report-total" style={{ marginTop: 0 }}>
              <span>All DNP leads</span>
              <span className="num">{fmt(r.dnp)}</span>
              <span className="num" />
            </div>
          </div>
        </Card>
      )}
    </>
  );

  const exportCsv = () => {
    const head = ['Programme', 'Leads', 'DNP leads', 'DNP %', ...CALL_ATTEMPT_BUCKETS.map((b) => b.label), 'No Note Count', 'Total call attempts', 'Avg calls per DNP lead'];
    const line = (label, r) => [label, r.leads, r.dnp, (r.dnpPct * 100).toFixed(1), ...CALL_ATTEMPT_BUCKETS.map((b) => r.callAttempts[b.key]), r.noNote, r.noteSum, r.notesKnown ? r.avgCalls.toFixed(1) : ''];
    downloadBlob(toCSV(head, [...rows.map((r) => line(r.label, r)), line('Total', all)]), `DNP Calling report ${d.range.label}.csv`, 'text/csv');
    toast(`${fmt(rows.length)} programme rows exported.`);
  };

  const bucketCol = (b) => ({
    key: `ca${b.key}`,
    label: b.label,
    value: (r) => r.callAttempts[b.key],
    render: (r) => (r.callAttempts[b.key] ? fmt(r.callAttempts[b.key]) : <span className="muted">0</span>),
  });

  return (
    <>
      <div className="callout info">
        <Icon name="info" size={16} />
        <div>
          <b>How this report is built:</b> DNP leads = Lead Stage <b>DID NOT PICK (DNP)</b>. <b>Note Count</b> is treated as Call Attempts
          (Note Count 2 = 2 Calls). DNP leads with a blank Note Count are shown as <b>No Note Count</b>, not as 0 Calls, so every row adds up:
          DNP = 1 + 2 + 3 + 4 + 5+ + 0 Calls + No Note Count.
          {agg.weeksImported ? ` ${agg.weeksImported} imported week(s) in this period have DNP totals but no Note Count, so their DNP leads count as No Note Count.` : ''}
        </div>
      </div>

      <div className="kpi-section-label">1 · Overall: all programmes</div>
      <ReportBlock r={all} title="all programmes" progKey="" />

      <div className="kpi-section-label">2 · Programme-wise</div>
      <section className="card">
        <div className="card-head">
          <div className="card-title-row">
            <span className="card-icon" aria-hidden="true"><Icon name="programmes" size={16} /></span>
            <div>
              <h3 className="card-title">Programme-wise DNP Calling report</h3>
              <p className="card-sub">{notesMapped ? 'Each programme’s DNP leads split by call attempts. Click a programme to see its own report below.' : 'DNP leads per programme. Call-attempt columns appear once a week with Note Count is approved.'}</p>
            </div>
          </div>
          <div className="card-actions"><button className="btn ghost" type="button" onClick={exportCsv}><Icon name="download" size={15} />Export (CSV)</button></div>
        </div>
        <DataTable
          rows={rows}
          search="Search programme"
          searchKeys={['label']}
          initialSort={{ key: 'dnp', dir: 'desc' }}
          onRowClick={(r) => pickProgramme(r.key)}
          rowClass={(r) => (r.key === current?.key ? 'selected' : '')}
          columns={[
            { key: 'label', label: 'Programme', align: 'left', wrap: true, render: (r) => shortName(r.label, 52) },
            { key: 'leads', label: 'Leads', render: (r) => fmt(r.leads) },
            { key: 'dnp', label: 'DNP', render: (r) => <b>{fmt(r.dnp)}</b> },
            { key: 'dnpPct', label: 'DNP %', render: (r) => fmtPct(r.dnpPct, 1) },
            ...(notesMapped ? CALL_ATTEMPT_BUCKETS.map(bucketCol) : []),
            { key: 'noNote', label: 'No Note Count', render: (r) => (r.noNote ? fmt(r.noNote) : <span className="muted">0</span>) },
            ...(notesMapped ? [
              { key: 'noteSum', label: 'Total attempts', render: (r) => fmt(r.noteSum) },
              { key: 'avgCalls', label: 'Avg calls', value: (r) => (r.notesKnown ? r.avgCalls : -1), render: (r) => (r.notesKnown ? avg(r.avgCalls) : <span className="muted">—</span>) },
            ] : []),
          ]}
          footer={(
            <>
              <td className="l"><b>Total</b></td>
              <td>{fmt(all.leads)}</td>
              <td><b>{fmt(all.dnp)}</b></td>
              <td>{fmtPct(all.dnpPct, 1)}</td>
              {notesMapped && CALL_ATTEMPT_BUCKETS.map((b) => <td key={b.key}>{fmt(all.callAttempts[b.key])}</td>)}
              <td>{fmt(all.noNote)}</td>
              {notesMapped && <td>{fmt(all.noteSum)}</td>}
              {notesMapped && <td>{all.notesKnown ? avg(all.avgCalls) : '—'}</td>}
            </>
          )}
        />
      </section>

      <div id="dnp-programme" className="filters">
        <label className="field">Programme report
          <select className="select" value={current?.key || ''} onChange={(e) => setSel(e.target.value)}>
            {[...rows].sort((a, b) => a.label.localeCompare(b.label)).map((r) => <option key={r.key} value={r.key}>{r.label} ({fmt(r.dnp)} DNP)</option>)}
          </select>
        </label>
      </div>
      {current && <ReportBlock r={current} title={shortName(current.label, 60)} progKey={current.key} />}

      {dnpDetail && dnpDetail.total > 0 && (dnpDetail.substagesMapped || dnpDetail.notesMapped) && (
        <Card
          icon="filter"
          iconTone="violet"
          title="DNP detail: substages & notes"
          sub="All programmes, from weeks approved in Weekly run (Lead Sub Stage and Note Count columns)."
          actions={hasLeadRows ? (
            <button className="btn ghost sm" type="button" onClick={() => openAllLeads({ bucket: 'dnp' })}>
              Open DNP leads
            </button>
          ) : null}
        >
          <div className="grid cols-21">
            <div>
              <div className="grid cols-4" style={{ marginBottom: dnpDetail.substages?.length ? 16 : 0 }}>
                <Kpi icon="users" iconTone="violet" label="DNP leads" value={fmt(dnpDetail.total)} sub="Lead Stage = Did Not Pick" />
                <Kpi
                  icon="file"
                  iconTone="blue"
                  label="With notes"
                  value={dnpDetail.notesMapped ? fmt(dnpDetail.withNotes) : '—'}
                  sub={dnpDetail.notesMapped
                    ? `${fmtPct(dnpDetail.notesKnown ? dnpDetail.withNotes / dnpDetail.notesKnown : 0, 1)} of DNP with a note count`
                    : 'Map Note Count / DNP History on upload'}
                />
                <Kpi
                  icon="activity"
                  iconTone="teal"
                  label="Total notes"
                  value={dnpDetail.notesMapped ? fmt(dnpDetail.noteSum) : '—'}
                  sub={dnpDetail.notesMapped
                    ? `${fmt(dnpDetail.withoutNotes)} DNP with 0 notes`
                    : 'Counsellor history / note count'}
                />
                <Kpi
                  icon="filter"
                  iconTone="amber"
                  label="Substages"
                  value={dnpDetail.substagesMapped ? fmt(dnpDetail.substages.length) : '—'}
                  sub={dnpDetail.substagesMapped ? 'Distinct Lead Sub Stage values' : 'Map Lead Sub Stage on upload'}
                />
              </div>
              {dnpDetail.substagesMapped && dnpDetail.substages.length > 0 && (
                <div className="breakdown">
                  {dnpDetail.substages.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      className="bd-row"
                      onClick={() => openAllLeads({ bucket: 'dnp', subStage: s.label === '(blank)' ? '' : s.label })}
                    >
                      <span className="bd-name">{s.label}</span>
                      <span className="bd-val">
                        {fmt(s.n)}
                        <span>
                          {fmtPct(dnpDetail.total ? s.n / dnpDetail.total : 0)}
                          {dnpDetail.notesMapped ? ` · ${fmt(s.withNotes)} with notes · ${fmt(s.noteSum)} notes` : ''}
                        </span>
                      </span>
                      <span className="bd-bar">
                        <i style={{ width: `${dnpDetail.total ? (s.n / dnpDetail.total) * 100 : 0}%`, background: 'var(--violet)' }} />
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {dnpDonut && (
              <div className="viz-side">
                <Chart height={260} label="DNP substage donut" option={dnpDonut} />
              </div>
            )}
          </div>
        </Card>
      )}


    </>
  );
}
