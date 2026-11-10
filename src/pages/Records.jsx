import React, { useMemo, useState, useEffect } from 'react';
import { useApp } from '../context.js';
import Chart, { chartTokens } from '../components/Chart.jsx';
import Icon from '../components/Icons.jsx';
import { DataTable, Empty, Tag, Kpi, Card, Legend, fmt, fmtPct } from '../components/ui.jsx';
import { JUNK_CATEGORIES, QUALIFIED_KEYS, UNTOUCHED_KEYS, DNP_KEYS, isDnpStage, keyOf, fromIso, formatDay } from '../lib/junkCore.js';
import { downloadBlob, toCSV } from '../lib/files.js';
import { shortName, itemsDonutOption, CATS } from '../lib/charts.js';
import { canRunWeekly } from '../lib/access.js';

const CAT = new Map(JUNK_CATEGORIES.flatMap((c) => c.keys.map((k) => [k, c])));

const BUCKETS = {
  qualified: { label: 'Qualified', stages: QUALIFIED_KEYS },
  untouched: { label: 'Untouched', stages: UNTOUCHED_KEYS },
  dnp: { label: 'DNP', stages: DNP_KEYS },
};

export default function Records() {
  const { derived: d, drill, goTo, toast, user, resolvedTheme } = useApp();
  const canRun = canRunWeekly(user);
  const t = useMemo(() => chartTokens(), [resolvedTheme]);
  // Filters arrive from the page that linked here; start with them so the first view is already filtered.
  const fromDrill = (x) => ({
    programme: x.programme || '',
    cat: x.cat || '',
    stage: x.stage || '',
    campaign: x.campaign || '',
    bucket: x.bucket || '',
    subStage: x.subStage || '',
    notes: x.notes || '',
  });
  const [f, setF] = useState(() => fromDrill(drill));

  useEffect(() => { setF(fromDrill(drill)); }, [drill]);

  const rows = useMemo(() => {
    if (!d) return [];
    const out = [];
    for (const w of d.weeks) {
      if (!w.rows?.leads) continue;
      const { courses, stages, campaigns, substages = [], leads } = w.rows;
      leads.forEach((tuple, i) => {
        const [c, s, k, date, subIdx, notesRaw] = tuple;
        const courseKey = keyOf(courses[c]);
        const stage = stages[s];
        const cat = CAT.get(keyOf(stage));
        const subStage = substages[subIdx] ?? '';
        const notes = notesRaw === '' || notesRaw === undefined || notesRaw === null ? null : Number(notesRaw);
        out.push({
          id: `${w.id}-${i}`,
          weekId: w.id,
          week: w.label,
          course: courses[c],
          courseKey,
          stage,
          campaign: campaigns[k],
          date,
          cat: cat ? cat.id : '',
          catLabel: cat ? cat.label : '',
          subStage,
          notes: Number.isFinite(notes) ? notes : null,
          isDnp: isDnpStage(keyOf(stage)),
        });
      });
    }
    return out;
  }, [d]);

  if (!d) return null;
  const detailed = d.weeks.filter((w) => w.rows?.leads).length;
  const periodLeads = d.weeks.reduce((s, w) => s + (w.totals?.total || 0), 0);
  const rowLeads = d.weeks.filter((w) => w.rows?.leads).reduce((s, w) => s + (w.totals?.total || 0), 0);
  const coverage = <Coverage d={d} periodLeads={periodLeads} rowLeads={rowLeads} goTo={goTo} />;
  if (!detailed) {
    return (
      <>
      {coverage}
      <div className="card">
        <Empty
          icon="records"
          title="No lead-level rows in this period"
          action={<button className="btn" type="button" onClick={() => goTo(canRun ? 'run' : 'programmes')}>{canRun ? 'Go to Weekly run' : 'Open Programmes'}</button>}
        >
          Rows are saved when a week is approved in the dashboard.
          {d.agg.weeksImported ? ` ${d.agg.weeksImported} week(s) here were imported from the Junk Report workbook, which has programme and campaign totals but no individual leads.` : ''}
          {!canRun ? ' Ask a Super Admin to approve a weekly run if you need lead-level Records.' : ''}
        </Empty>
      </div>
      </>
    );
  }

  const programmes = [...new Map(rows.map((r) => [r.courseKey, r.course])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const stageList = [...new Set(rows.map((r) => r.stage))].sort();
  const subStageList = [...new Set(rows.filter((r) => r.isDnp && r.subStage).map((r) => r.subStage))].sort();
  const hasSubStage = rows.some((r) => r.subStage);
  const hasNotes = rows.some((r) => r.notes !== null);
  const bucketStages = f.bucket && BUCKETS[f.bucket] ? new Set(BUCKETS[f.bucket].stages) : null;
  const filtered = rows.filter((r) =>
    (!f.programme || r.courseKey === f.programme) &&
    (!f.stage || r.stage === f.stage) &&
    (!bucketStages || (f.bucket === 'dnp' ? r.isDnp : bucketStages.has(keyOf(r.stage)))) &&
    (!f.campaign || r.campaign === f.campaign) &&
    (!f.subStage || r.subStage === f.subStage) &&
    (!f.notes || (
      f.notes === 'with' ? (r.notes !== null && r.notes > 0)
        : f.notes === 'without' ? (r.notes === 0 || r.notes === null)
          : f.notes === '0' ? r.notes === 0
            : f.notes === '5+' ? (r.notes !== null && r.notes >= 5)
              : (r.notes !== null && String(r.notes) === f.notes)
    )) &&
    (!f.cat || (f.cat === 'junk' ? !!r.cat : f.cat === 'notjunk' ? !r.cat : r.cat === f.cat)));
  const active = Object.entries(f).filter(([, v]) => v);
  const dnpFiltered = filtered.filter((r) => r.isDnp);
  const dnpNoteSum = dnpFiltered.reduce((s, r) => s + (r.notes || 0), 0);
  const dnpWithNotes = dnpFiltered.filter((r) => r.notes !== null && r.notes > 0).length;

  const exportCsv = () => {
    downloadBlob(toCSV(
      ['Week', 'Programme', 'Lead Stage', 'Lead Sub Stage', 'Note Count', 'Junk category', 'Primary Registration Campaign', 'User Registration Date'],
      filtered.map((r) => [r.week, r.course, r.stage, r.subStage, r.notes ?? '', r.catLabel, r.campaign, r.date]),
    ), `JGU leads ${d.range.label}.csv`, 'text/csv');
    toast(`${fmt(filtered.length)} rows exported.`);
  };

  const showDnpBar = f.bucket === 'dnp' || (f.stage && isDnpStage(keyOf(f.stage)));

  const junkCount = filtered.filter((r) => r.cat).length;
  const qualifiedCount = filtered.filter((r) => QUALIFIED_KEYS.includes(keyOf(r.stage))).length;
  const untouchedCount = filtered.filter((r) => UNTOUCHED_KEYS.includes(keyOf(r.stage))).length;
  const dnpCountN = dnpFiltered.length;
  const catCounts = Object.fromEntries(CATS.map((c) => [c.id, filtered.filter((r) => r.cat === c.id).length]));
  const mixDonut = itemsDonutOption(
    t,
    [
      ...CATS.map((c) => ({ name: c.label, id: c.id, value: catCounts[c.id], color: t[c.token] })),
      { name: 'Not junk', id: 'other', value: filtered.length - junkCount, color: t.other },
    ],
    { centerValue: fmt(filtered.length), centerLabel: 'Filtered' },
  );
  const stageTop = [...filtered.reduce((m, r) => m.set(r.stage, (m.get(r.stage) || 0) + 1), new Map()).entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <>
      {coverage}
      <div className="grid cols-4">
        <Kpi icon="records" iconTone="blue" label="Filtered leads" value={fmt(filtered.length)} sub={`of ${fmt(rows.length)} individual leads available`} />
        <Kpi icon="alert" iconTone="red" label="Junk in view" value={fmt(junkCount)} sub={fmtPct(filtered.length ? junkCount / filtered.length : 0, 1)} />
        <Kpi icon="checkCircle" iconTone="teal" label="Qualified in view" value={fmt(qualifiedCount)} sub="Counselled + OL Sent + Fee Paid + Follow-up" />
        <Kpi icon="activity" iconTone="amber" label="Untouched in view" value={fmt(untouchedCount)} sub="Untouched + Reattempt" />
      </div>

      <div className="grid cols-2">
        <Card className="viz-card" icon="filter" iconTone="violet" title="Junk mix in current filters" sub="Updates as you change filters below.">
          {filtered.length ? (
            <>
              <Chart height={220} label="Filtered junk mix donut" option={mixDonut} />
              <Legend items={[
                ...CATS.map((c) => ({ id: c.id, label: c.label, color: t[c.token], value: fmt(catCounts[c.id]) })),
                { id: 'other', label: 'Not junk', color: t.other, value: fmt(filtered.length - junkCount) },
              ]} />
            </>
          ) : <Empty title="No rows in view">Adjust filters to see the mix.</Empty>}
        </Card>
        <Card className="viz-card" icon="chart" iconTone="blue" title="Top stages in view" sub="Most common lead stages among filtered rows.">
          {stageTop.length ? (
            <div className="breakdown">
              {stageTop.map(([stage, n]) => (
                <button key={stage} type="button" className="bd-row" onClick={() => setF({ ...f, stage, bucket: '' })}>
                  <span className="bd-name">{stage}</span>
                  <span className="bd-val">{fmt(n)}<span>{fmtPct(filtered.length ? n / filtered.length : 0)}</span></span>
                  <span className="bd-bar"><i style={{ width: `${filtered.length ? (n / filtered.length) * 100 : 0}%`, background: 'var(--accent)' }} /></span>
                </button>
              ))}
            </div>
          ) : <Empty title="No stages" />}
        </Card>
      </div>

    <section className="card">
      <div className="card-head">
        <div className="card-title-row">
          <span className="card-icon" aria-hidden="true"><Icon name="records" size={16} /></span>
          <div>
            <h3 className="card-title">Individual leads</h3>
            <p className="card-sub">
              One row per lead, from the {detailed} approved week(s) above. Use the filters, then export if you need a spreadsheet.
            </p>
          </div>
        </div>
        <div className="card-actions"><button className="btn ghost" type="button" onClick={exportCsv}><Icon name="download" size={15} />Export these rows (CSV)</button></div>
      </div>

      {showDnpBar && (
        <div className="callout info" style={{ marginBottom: 14 }}>
          <Icon name="activity" size={16} />
          <div>
            <b>DNP filter:</b> {fmt(dnpFiltered.length)} Did Not Pick lead{dnpFiltered.length === 1 ? '' : 's'}
            {hasNotes
              ? <> · <b>{fmt(dnpWithNotes)}</b> with notes · <b>{fmt(dnpNoteSum)}</b> total note count</>
              : <> · map <b>Note Count / DNP History</b> on Weekly run to show note counts</>}
            {hasSubStage ? <> · substages available below</> : <> · map <b>Lead Sub Stage</b> for DNP substages</>}
          </div>
        </div>
      )}

      <div className="filters">
        <label className="field">Programme
          <select className="select" value={f.programme} onChange={(e) => setF({ ...f, programme: e.target.value })}>
            <option value="">All programmes</option>
            {programmes.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="field">Junk category
          <select className="select" value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })}>
            <option value="">Any</option>
            <option value="junk">Any Junk category</option>
            {JUNK_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            <option value="notjunk">Not Junk</option>
          </select>
        </label>
        <label className="field">Lead stage
          <select className="select" value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value, bucket: e.target.value ? '' : f.bucket })}>
            <option value="">All stages</option>
            {stageList.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="field">Pipeline bucket
          <select className="select" value={f.bucket} onChange={(e) => setF({ ...f, bucket: e.target.value, stage: e.target.value ? '' : f.stage })}>
            <option value="">Any</option>
            {Object.entries(BUCKETS).map(([id, b]) => <option key={id} value={id}>{b.label}</option>)}
          </select>
        </label>
        {(hasSubStage || showDnpBar) && (
          <label className="field">DNP sub stage
            <select className="select" value={f.subStage} onChange={(e) => setF({ ...f, subStage: e.target.value, bucket: e.target.value ? 'dnp' : f.bucket })}>
              <option value="">All substages</option>
              {subStageList.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
        {(hasNotes || showDnpBar) && (
          <label className="field">Call attempts (Note Count)
            <select className="select" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })}>
              <option value="">Any</option>
              <option value="with">Has attempts (≥1)</option>
              <option value="without">No attempts (0 / blank)</option>
              <option value="1">1 Call</option>
              <option value="2">2 Calls</option>
              <option value="3">3 Calls</option>
              <option value="4">4 Calls</option>
              <option value="5+">5+ Calls</option>
              <option value="0">0 Calls</option>
            </select>
          </label>
        )}
      </div>
      {active.length > 0 && (
        <div className="btns" style={{ marginBottom: 12 }}>
          {active.map(([k, v]) => (
            <span key={k} className="chip">
              {k === 'programme' ? shortName(programmes.find((p) => p[0] === v)?.[1] || v, 36)
                : k === 'cat' ? (v === 'junk' ? 'Any Junk' : v === 'notjunk' ? 'Not Junk' : JUNK_CATEGORIES.find((c) => c.id === v)?.label)
                  : k === 'bucket' ? (BUCKETS[v]?.label || v)
                    : k === 'notes' ? (
                      ({ with: 'Has attempts', without: 'No attempts', '0': '0 Calls', '1': '1 Call', '2': '2 Calls', '3': '3 Calls', '4': '4 Calls', '5+': '5+ Calls' })[v] || v
                    )
                      : v}
              <button type="button" aria-label={`Remove ${k} filter`} onClick={() => setF({ ...f, [k]: '' })}>×</button>
            </span>
          ))}
          <button className="btn quiet sm" type="button" onClick={() => setF({ programme: '', cat: '', stage: '', campaign: '', bucket: '', subStage: '', notes: '' })}>Clear all</button>
        </div>
      )}
      <DataTable
        rows={filtered}
        search="Search programme, stage, substage or campaign"
        searchKeys={['course', 'stage', 'subStage', 'campaign']}
        pageSize={50}
        initialSort={{ key: 'date', dir: 'desc' }}
        empty="No leads match these filters."
        columns={[
          { key: 'week', label: 'Week', align: 'left', value: (r) => r.weekId },
          { key: 'course', label: 'Programme', align: 'left', wrap: true, render: (r) => shortName(r.course, 52) },
          { key: 'stage', label: 'Lead stage', align: 'left' },
          ...(hasSubStage ? [{ key: 'subStage', label: 'Sub stage', align: 'left', render: (r) => r.subStage || <span className="muted">—</span> }] : []),
          ...(hasNotes ? [{ key: 'notes', label: 'Notes', render: (r) => (r.notes === null ? <span className="muted">—</span> : fmt(r.notes)) }] : []),
          { key: 'catLabel', label: 'Junk', align: 'left', render: (r) => (r.cat ? <Tag tone="crit" icon={false}>{r.catLabel}</Tag> : <span className="muted">—</span>) },
          { key: 'campaign', label: 'Campaign', align: 'left', wrap: true, render: (r) => <span className="mono">{r.campaign || '—'}</span> },
          { key: 'date', label: 'Registered', render: (r) => (r.date ? formatDay(fromIso(r.date)) : '—') },
        ]}
      />
    </section>
    </>
  );
}

/**
 * Explains why Records can show fewer leads than Overview: only approved weeks keep
 * one row per lead; weeks imported from the Junk Report workbook have totals only.
 */
function Coverage({ d, periodLeads, rowLeads, goTo }) {
  const weeks = [...d.weeks].sort((a, b) => a.id.localeCompare(b.id));
  const missing = weeks.filter((w) => !w.rows?.leads);
  if (!missing.length) {
    return (
      <div className="callout good">
        <Icon name="checkCircle" size={16} />
        <div>All {fmt(weeks.length)} week(s) in <b>{d.range.label}</b> have individual leads, so this page covers the same <b>{fmt(periodLeads)}</b> leads as Overview.</div>
      </div>
    );
  }
  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title-row">
          <span className="card-icon" aria-hidden="true"><Icon name="info" size={16} /></span>
          <div>
            <h3 className="card-title">Why this page shows fewer leads than Overview</h3>
            <p className="card-sub">
              Overview counts all <b>{fmt(periodLeads)}</b> leads in {d.range.label} ({fmt(weeks.length)} weeks).
              This page can only list the <b>{fmt(rowLeads)}</b> leads from weeks approved in Weekly run, because only those keep one row per lead.
              {' '}The other {fmt(periodLeads - rowLeads)} leads come from {fmt(missing.length)} week(s) imported from the Junk Report workbook, which has totals per programme and campaign but no individual leads.
            </p>
          </div>
        </div>
        <div className="card-actions"><button className="btn ghost sm" type="button" onClick={() => goTo('leads')}>See full-period totals (Total Leads)</button></div>
      </div>
      <div className="tw">
        <table className="tbl">
          <thead><tr><th className="l">Week</th><th className="l">Source</th><th>Leads</th><th>Junk</th><th className="l">Individual leads here?</th></tr></thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.id}>
                <td className="l">{w.label}</td>
                <td className="l">{w.source === 'imported' ? 'Imported from workbook' : 'Approved in Weekly run'}</td>
                <td>{fmt(w.totals?.total || 0)}</td>
                <td>{fmt(w.totals?.junk || 0)}</td>
                <td className="l">{w.rows?.leads ? <Tag tone="good" icon={false}>Yes</Tag> : <span className="muted">No, totals only</span>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td className="l"><b>Total (same as Overview)</b></td><td /><td><b>{fmt(periodLeads)}</b></td><td><b>{fmt(weeks.reduce((s, w) => s + (w.totals?.junk || 0), 0))}</b></td><td className="l"><b>{fmt(rowLeads)}</b> listed on this page</td></tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
