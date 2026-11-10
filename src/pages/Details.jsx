import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context.js';
import Chart, { chartTokens } from '../components/Chart.jsx';
import Icon from '../components/Icons.jsx';
import { Kpi, Card, DataTable, Empty, Callout, Legend, Seg, fmt, fmtPct } from '../components/ui.jsx';
import { CATS, shortName, donutOption, gaugeOption, mixOption, pipelineDonutOption, funnelOption, appsOption } from '../lib/charts.js';
import { QUALIFIED_KEYS, UNTOUCHED_KEYS, qualifiedCount, untouchedCount, dnpCount } from '../lib/junkCore.js';
import { canRunWeekly } from '../lib/access.js';

/*
 * One detail page per Overview card. Every page has the same steps:
 *   What the number means
 *   1 · Overall: all programmes  — headline numbers, charts, by week
 *   2 · Programme-wise           — table of every programme (Total row = the Overview card);
 *                                  clicking a programme shows the same view for that programme
 *                                  right here, without leaving the page.
 */

const STAGE_LABEL = {
  COUNSELLED: 'Counselled',
  'OL SENT': 'OL Sent',
  'REGISTRATION FEE PAID': 'Fee Paid',
  'FOLLOW UP - POST COUNSELLED': 'Follow-up',
  UNTOUCHED: 'Untouched',
  'REATTEMPT UNTOUCHED': 'Reattempt Untouched',
};
const BLOCK_ID = 'programme-block';

function useDetail() {
  const app = useApp();
  const t = useMemo(() => chartTokens(), [app.resolvedTheme]);
  const d = app.derived;
  const hasLeadRows = !!d && d.weeks.some((w) => w.rows?.leads?.length);
  return { ...app, d, t, hasLeadRows, canRun: canRunWeekly(app.user) };
}

/** Selected programme on a detail page; a link from elsewhere can preselect one. */
function useProgramme(drill) {
  const [sel, setSel] = useState(drill.programme || '');
  useEffect(() => { setSel(drill.programme || ''); }, [drill]);
  const pick = (key) => {
    setSel(key);
    setTimeout(() => document.getElementById(BLOCK_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };
  return [sel, setSel, pick];
}

function NoData({ d, goTo, canRun, title, children }) {
  return (
    <div className="card">
      <Empty
        icon="calendar"
        title={title || (d ? `No data for ${d.range.label}` : 'No weeks yet')}
        action={<button className="btn" type="button" onClick={() => goTo(canRun ? 'run' : 'overview')}>{canRun ? 'Go to Weekly run' : 'Back to Overview'}</button>}
      >
        {children || 'Choose another period above, or approve a weekly run.'}
      </Empty>
    </div>
  );
}

const sumCounts = (list) => {
  const out = {};
  for (const p of list) for (const [k, v] of Object.entries(p.counts || {})) out[k] = (out[k] || 0) + v;
  return out;
};

/** The "all programmes" scope: Overview totals plus the junk categories and stage counts. */
function overallScope(agg) {
  const c = agg.categories;
  return {
    key: '',
    label: 'All programmes',
    ...agg.totals,
    jl: c.jl,
    fin: c.fin,
    ni: c.ni,
    catTotal: c.total,
    catJunk: c.junk,
    counts: sumCounts(agg.programmes),
  };
}

const programmeScope = (p) => ({ ...p, catTotal: p.total, catJunk: (p.jl || 0) + (p.fin || 0) + (p.ni || 0) });

/** Week rows for the whole period, or for one programme (same fields as agg.series). */
function weeksFor(d, key) {
  if (!key) return d.agg.series;
  return d.weeks.filter((w) => w.programmes?.length).map((w) => {
    const p = w.programmes.find((x) => x.key === key);
    const total = p?.total || 0;
    const junk = p?.junk || 0;
    const untouched = p ? untouchedCount(p.counts) : 0;
    const noCats = w.totals.jl === null || w.totals.jl === undefined;
    const noApps = w.totals.started === null || w.totals.started === undefined;
    return {
      id: w.id,
      label: w.label,
      short: w.label.split(' - ')[0],
      source: w.source,
      total,
      junk,
      junkPct: total ? junk / total : 0,
      jl: noCats ? null : p?.jl || 0,
      fin: noCats ? null : p?.fin || 0,
      ni: noCats ? null : p?.ni || 0,
      qualified: p ? qualifiedCount(p.counts) : 0,
      dnp: p ? dnpCount(p.counts) : 0,
      untouched,
      untouchedPct: total ? untouched / total : 0,
      started: noApps ? null : p?.started || 0,
      submitted: noApps ? null : p?.submitted || 0,
      enrolled: noApps ? null : p?.enrolled || 0,
    };
  });
}

const sumOf = (rows, f) => (rows.some((r) => r[f] !== null && r[f] !== undefined) ? rows.reduce((s, r) => s + (r[f] || 0), 0) : null);
const num = (key, label, extra = {}) => ({ key, label, render: (r) => (r[key] === null || r[key] === undefined ? <span className="muted">—</span> : fmt(r[key])), ...extra });
const pct = (key, label, extra = {}) => ({ key, label, render: (r) => fmtPct(r[key] || 0, 1), ...extra });
const ratio = (key, label, n, base = 'total', extra = {}) => ({
  key,
  label,
  value: (r) => (r[base] ? (r[n] || 0) / r[base] : 0),
  render: (r) => fmtPct(r[base] ? (r[n] || 0) / r[base] : 0, 1),
  ...extra,
});
const stageCol = (key) => ({ key: `s:${key}`, label: STAGE_LABEL[key] || key, value: (r) => r.counts?.[key] || 0, render: (r) => fmt(r.counts?.[key] || 0) });
const programmeCol = { key: 'label', label: 'Programme', align: 'left', wrap: true };
const weekCol = { key: 'id', label: 'Week', align: 'left', render: (r) => r.label };
const bold = (v, k) => <td key={k}><b>{v === null || v === undefined ? '—' : v}</b></td>;

/** Notes where the workbook's typed Grand Total differs from its programme rows. */
function gapNote(agg, fields) {
  const gaps = fields
    .map(([f, label]) => ({ label, total: agg.totals[f] || 0, rows: agg.programmes.reduce((s, p) => s + (p[f] || 0), 0) }))
    .filter((g) => g.total !== g.rows);
  if (!gaps.length) return null;
  return `${gaps.map((g) => `${g.label}: Total ${fmt(g.total)}, programme rows add up to ${fmt(g.rows)}`).join(' · ')}. The difference comes from imported weeks where the Junk Report workbook's Grand Total was typed in and does not match its programme rows (the week's warning in History says which).`;
}

function LeadsButton({ hasLeadRows, goTo, drill, label }) {
  if (!hasLeadRows) return <span className="small muted">Individual leads need a week approved in Weekly run.</span>;
  return (
    <button className="btn ghost sm" type="button" onClick={() => goTo('records', drill)}>
      <Icon name="records" size={14} />{label}
    </button>
  );
}

const SectionLabel = ({ children }) => <div className="kpi-section-label">{children}</div>;

function ByProgramme({ d, title, sub, columns, footer, sortKey, selected, onPick, foot, actions, tableKey }) {
  return (
    <Card icon="programmes" iconTone="blue" title={title} sub={`${sub} Click a programme to see its own numbers below.`} actions={actions} foot={foot}>
      <DataTable
        key={tableKey}
        rows={d.agg.programmes}
        search="Search programme"
        searchKeys={['label']}
        initialSort={{ key: sortKey, dir: 'desc' }}
        onRowClick={(p) => onPick(p.key)}
        rowClass={(p) => (p.key === selected ? 'selected' : '')}
        columns={[programmeCol, ...columns]}
        footer={<><td className="l"><b>Total (same as Overview)</b></td>{footer}</>}
      />
    </Card>
  );
}

/** Programme picker + heading for the programme-specific block. */
function ProgrammePicker({ d, current, onChange, metric, goTo }) {
  const list = [...d.agg.programmes].sort((a, b) => a.label.localeCompare(b.label));
  return (
    <div id={BLOCK_ID} className="filters">
      <label className="field">{metric} for one programme
        <select className="select" value={current?.key || ''} onChange={(e) => onChange(e.target.value)}>
          {list.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </label>
      {current && (
        <button className="btn quiet sm" type="button" style={{ alignSelf: 'end' }} onClick={() => goTo('programmes', { programme: current.key })}>
          All metrics for this programme
        </button>
      )}
    </div>
  );
}

function ByWeek({ title, rows, columns, footer }) {
  return (
    <Card icon="calendar" iconTone="teal" title={title} sub="One row per Wed → Tue reporting week in this period.">
      <DataTable
        rows={rows}
        initialSort={{ key: 'id', dir: 'asc' }}
        maxHeight={false}
        columns={[weekCol, ...columns]}
        footer={<><td className="l"><b>Total</b></td>{footer}</>}
      />
    </Card>
  );
}

/* ====================================================================== */
/* Total Leads                                                            */
/* ====================================================================== */
export function LeadsDetail() {
  const { d, t, goTo, canRun, hasLeadRows, drill } = useDetail();
  const [sel, setSel, pick] = useProgramme(drill);
  if (!d || !d.agg.weeks) return <NoData d={d} goTo={goTo} canRun={canRun} />;
  const { agg } = d;
  const tot = agg.totals;
  const hasStages = agg.weeksDetailed > 0;
  const ranked = [...agg.programmes].sort((a, b) => b.total - a.total);
  const current = agg.programmes.find((p) => p.key === sel) || ranked[0];

  const block = (s, title) => {
    const weeks = weeksFor(d, s.key);
    const PAGE = { qualified: 'qualified', junk: 'junk', dnp: 'dnp', untouched: 'untouched' };
    const open = (id) => { if (PAGE[id]) goTo(PAGE[id], s.key ? { programme: s.key } : {}); };
    const share = tot.total ? s.total / tot.total : 0;
    const other = Math.max(0, s.total - s.qualified - s.junk - s.dnp - s.untouched);
    return (
      <>
        <div className="grid cols-4">
          <Kpi icon="users" iconTone="teal" tone="hero" label="Total Leads" value={fmt(s.total)} sub={s.key ? `${fmtPct(share, 1)} of all leads` : `From ${fmt(agg.weeks)} week(s)`} />
          <Kpi icon="checkCircle" iconTone="blue" label="Qualified" value={hasStages ? fmt(s.qualified) : '—'} sub={`${fmtPct(s.total ? s.qualified / s.total : 0, 1)} of these leads`} onClick={() => open('qualified')} title="Open Qualified" />
          <Kpi icon="alert" iconTone="red" label="Junk" value={fmt(s.junk)} sub={`${fmtPct(s.total ? s.junk / s.total : 0, 1)} of these leads`} onClick={() => open('junk')} title="Open Junk" />
          <Kpi icon="phoneMissed" iconTone="violet" label="DNP" value={hasStages ? fmt(s.dnp) : '—'} sub={`${fmtPct(s.total ? s.dnp / s.total : 0, 1)} of these leads`} onClick={() => open('dnp')} title="Open DNP Calling" />
        </div>
        {hasStages && (
          <Card
            className="viz-card"
            icon="users"
            iconTone="blue"
            title={`Where the leads are: ${title}`}
            sub={`Qualified · Junk · DNP · Untouched. ${fmt(other)} lead(s) are in other stages (for example Request Call Back). Click a bucket to open its page.`}
          >
            <div className="grid cols-21">
              <Chart height={240} label="Pipeline composition donut" option={pipelineDonutOption(t, s, null)} onClick={(p) => open(p?.data?.id)} />
              <Legend
                onSelect={open}
                items={[
                  { id: 'qualified', label: 'Qualified', color: t.accent, value: fmt(s.qualified) },
                  { id: 'junk', label: 'Junk', color: t.crit, value: fmt(s.junk) },
                  { id: 'dnp', label: 'DNP', color: t.violet, value: fmt(s.dnp) },
                  { id: 'untouched', label: 'Untouched', color: t.warn, value: fmt(s.untouched) },
                ]}
              />
            </div>
          </Card>
        )}
        <ByWeek
          title={`Leads by week: ${title}`}
          rows={weeks}
          columns={[
            { key: 'source', label: 'Source', align: 'left', render: (w) => (w.source === 'imported' ? 'Imported from workbook' : 'Approved in Weekly run') },
            num('total', 'Leads'),
            num('qualified', 'Qualified'),
            num('junk', 'Junk'),
            num('dnp', 'DNP'),
            num('untouched', 'Untouched'),
          ]}
          footer={<><td />{['total', 'qualified', 'junk', 'dnp', 'untouched'].map((f) => bold(fmt(sumOf(weeks, f) || 0), f))}</>}
        />
      </>
    );
  };

  return (
    <>
      <Callout tone="info">
        <b>Total Leads</b> = every lead in the leads export for the weeks in <b>{d.range.label}</b>, after removing excluded programmes and blank courses.
        Each lead is in one stage: Qualified, Junk, DNP, Untouched, or another stage.
      </Callout>

      <SectionLabel>1 · Overall: all programmes</SectionLabel>
      {block(overallScope(agg), "all programmes")}

      <SectionLabel>2 · Programme-wise</SectionLabel>
      <ByProgramme
        d={d}
        title="Leads by programme"
        sub="Leads per programme and where they are in the pipeline."
        sortKey="total"
        selected={current?.key}
        onPick={pick}
        actions={<LeadsButton hasLeadRows={hasLeadRows} goTo={goTo} drill={{}} label="See individual leads" />}
        foot={gapNote(agg, [['total', 'Leads']])}
        columns={[
          num('total', 'Leads'),
          { key: 'share', label: 'Share of leads', value: (p) => (tot.total ? p.total / tot.total : 0), render: (p) => fmtPct(tot.total ? p.total / tot.total : 0, 1) },
          num('qualified', 'Qualified'),
          num('junk', 'Junk'),
          num('dnp', 'DNP'),
          num('untouched', 'Untouched'),
        ]}
        footer={<>{bold(fmt(tot.total), 't')}{bold('100%', 's')}{bold(fmt(tot.qualified), 'q')}{bold(fmt(tot.junk), 'j')}{bold(fmt(tot.dnp), 'd')}{bold(fmt(tot.untouched), 'u')}</>}
      />
      <ProgrammePicker d={d} current={current} onChange={setSel} metric="Leads" goTo={goTo} />
      {current && block(programmeScope(current), shortName(current.label, 60))}
    </>
  );
}

/* ====================================================================== */
/* Junk                                                                   */
/* ====================================================================== */
export function JunkDetail() {
  const { d, t, goTo, canRun, settings, hasLeadRows, drill } = useDetail();
  const [sel, setSel, pick] = useProgramme(drill);
  const [cat, setCat] = useState(null);
  const [mixMode, setMixMode] = useState('pct');
  if (!d || !d.agg.weeks) return <NoData d={d} goTo={goTo} canRun={canRun} />;
  const { agg } = d;
  const tot = agg.totals;
  const th = settings.threshold / 100;
  const catDef = CATS.find((x) => x.id === cat);
  const catPct = (p) => (p.total ? (p[cat] || 0) / p.total : 0);
  const ranked = [...agg.programmes].sort((a, b) => b.junk - a.junk);
  const current = agg.programmes.find((p) => p.key === sel) || ranked[0];

  const block = (s, title) => {
    const weeks = weeksFor(d, s.key);
    const over = s.junkPct >= th;
    const hasCat = s.catTotal > 0 && weeks.some((w) => w.jl !== null && w.jl !== undefined);
    const cats = { total: s.catTotal, junk: s.catJunk, jl: s.jl || 0, fin: s.fin || 0, ni: s.ni || 0, other: Math.max(0, s.catTotal - s.catJunk) };
    const leadsDrill = s.key ? { programme: s.key } : {};
    return (
      <>
        <div className="grid cols-4">
          <Kpi icon="alert" iconTone={over ? 'red' : 'amber'} tone={`hero ${over ? 'alert' : ''}`} label="Junk Leads" value={fmt(s.junk)} sub={`${fmtPct(s.junkPct, 1)} of ${fmt(s.total)} leads · goal ≤ ${settings.threshold}%`} />
          {CATS.map((x) => (
            <Kpi
              key={x.id}
              icon="filter"
              iconTone="violet"
              label={x.label}
              value={hasCat ? fmt(s[x.id] || 0) : '—'}
              sub={hasCat ? `${fmtPct(s.catJunk ? (s[x.id] || 0) / s.catJunk : 0, 1)} of junk` : 'No category split in these weeks'}
            />
          ))}
        </div>
        <div className="grid cols-2">
          <Card className="viz-card" icon="percent" iconTone={over ? 'red' : 'teal'} title={`Junk vs goal: ${title}`} sub={`Goal ≤ ${settings.threshold}%. Needle shows the junk rate.`}>
            <Chart height={240} label="Junk rate gauge" option={gaugeOption(t, s.junkPct, th)} />
            <div className="viz-stat-row">
              <div><span className="muted">Junk %</span><b className={over ? 'hi-text' : ''}>{fmtPct(s.junkPct, 1)}</b></div>
              <div><span className="muted">Goal</span><b>≤ {settings.threshold}%</b></div>
              <div><span className="muted">Gap</span><b className={over ? 'hi-text' : 'good-text'}>{over ? '+' : ''}{((s.junkPct - th) * 100).toFixed(1)} pts</b></div>
            </div>
          </Card>
          <Card
            className="viz-card"
            icon="filter"
            iconTone="violet"
            title={`Junk mix: ${title}`}
            sub="Share of each junk reason vs all other stages."
            actions={<LeadsButton hasLeadRows={hasLeadRows} goTo={goTo} drill={{ ...leadsDrill, cat: 'junk' }} label="See junk leads" />}
          >
            {hasCat ? (
              <>
                <Chart height={240} label="Junk category donut" option={donutOption(t, cats, null)} />
                <Legend
                  items={[
                    ...CATS.map((x) => ({ id: x.id, label: x.label, color: t[x.token], value: fmt(cats[x.id]) })),
                    { id: 'other', label: 'Other stages', color: t.other, value: fmt(cats.other) },
                  ]}
                />
              </>
            ) : <Empty title="No category breakdown">These weeks do not include a stage split.</Empty>}
          </Card>
        </div>
        {hasCat && weeks.length > 1 && (
          <Card
            icon="filter"
            iconTone="violet"
            title={`Junk mix by week: ${title}`}
            sub="Stacked split of Junk Lead, Financial Barrier, and Not Interested."
            actions={<Seg label="Mix mode" value={mixMode} onChange={setMixMode} options={[{ value: 'pct', label: 'As %' }, { value: 'count', label: 'As count' }]} />}
          >
            <Chart height={260} label="Weekly junk category mix" option={mixOption(t, weeks, mixMode)} />
            <Legend items={CATS.map((x) => ({ id: x.id, label: x.label, color: t[x.token] }))} />
          </Card>
        )}
        <ByWeek
          title={`Junk by week: ${title}`}
          rows={weeks}
          columns={[
            num('total', 'Leads'),
            num('junk', 'Junk'),
            pct('junkPct', 'Junk %', { cellClass: (w) => (w.total && w.junkPct >= th ? 'hi' : '') }),
            ...CATS.map((x) => num(x.id, x.label)),
          ]}
          footer={(
            <>
              {bold(fmt(sumOf(weeks, 'total') || 0), 't')}
              {bold(fmt(sumOf(weeks, 'junk') || 0), 'j')}
              {bold(fmtPct(sumOf(weeks, 'total') ? sumOf(weeks, 'junk') / sumOf(weeks, 'total') : 0, 1), 'p')}
              {CATS.map((x) => bold(sumOf(weeks, x.id) === null ? null : fmt(sumOf(weeks, x.id)), x.id))}
            </>
          )}
        />
      </>
    );
  };

  return (
    <>
      <Callout tone={tot.junkPct >= th ? 'warn' : 'good'}>
        <b>Junk</b> = Financial Barrier + Junk Lead + Not Interested in the Program. <b>Junk %</b> = Junk ÷ Total Leads.
        {' '}In {d.range.label} junk is <b>{fmtPct(tot.junkPct, 1)}</b>, {tot.junkPct >= th ? 'above' : 'within'} the {settings.threshold}% goal.
      </Callout>
      {agg.weeksNoCats > 0 && <p className="small muted">{agg.weeksNoCats} week(s) have no category split, so the three category numbers cover fewer weeks than Junk Leads.</p>}

      <SectionLabel>1 · Overall: all programmes</SectionLabel>
      {block(overallScope(agg), "all programmes")}

      <SectionLabel>2 · Programme-wise</SectionLabel>
      <ByProgramme
        d={d}
        tableKey={cat || 'all'}
        title={catDef ? `Junk by programme: sorted by ${catDef.label}` : 'Junk by programme'}
        sub={`Red Junk % is at or above the ${settings.threshold}% goal. Sort by a junk reason with the buttons.`}
        sortKey={cat ? `c:${cat}` : 'junkPct'}
        selected={current?.key}
        onPick={pick}
        actions={(
          <>
            <Seg
              label="Sort by"
              value={cat || 'all'}
              onChange={(v) => setCat(v === 'all' ? null : v)}
              options={[{ value: 'all', label: 'Junk %' }, ...CATS.map((x) => ({ value: x.id, label: x.label }))]}
            />
            <button className="btn ghost sm" type="button" onClick={() => goTo('campaigns')}><Icon name="campaigns" size={14} />Junk by campaign</button>
          </>
        )}
        foot={gapNote(agg, [['total', 'Leads'], ['junk', 'Junk']])}
        columns={[
          num('total', 'Leads'),
          num('junk', 'Junk'),
          pct('junkPct', 'Junk %', { cellClass: (p) => (p.junkPct >= th ? 'hi' : '') }),
          ...CATS.map((x) => ({
            key: `c:${x.id}`,
            label: x.label,
            value: (p) => (cat === x.id ? catPct(p) : p[x.id] || 0),
            cellClass: () => (cat === x.id ? 'focus-col' : ''),
            render: (p) => (cat === x.id ? <>{fmt(p[x.id] || 0)}<span className="muted small"> · {fmtPct(catPct(p), 1)}</span></> : fmt(p[x.id] || 0)),
          })),
        ]}
        footer={(
          <>
            {bold(fmt(tot.total), 't')}
            {bold(fmt(tot.junk), 'j')}
            {bold(fmtPct(tot.junkPct, 1), 'p')}
            {CATS.map((x) => bold(fmt(agg.programmes.reduce((s, p) => s + (p[x.id] || 0), 0)), x.id))}
          </>
        )}
      />
      <ProgrammePicker d={d} current={current} onChange={setSel} metric="Junk" goTo={goTo} />
      {current && block(programmeScope(current), shortName(current.label, 60))}
    </>
  );
}

/* ====================================================================== */
/* Qualified                                                              */
/* ====================================================================== */
export function QualifiedDetail() {
  const { d, goTo, canRun, hasLeadRows, drill } = useDetail();
  const [sel, setSel, pick] = useProgramme(drill);
  if (!d || !d.agg.weeks) return <NoData d={d} goTo={goTo} canRun={canRun} />;
  const { agg } = d;
  if (!agg.weeksDetailed) return <NoData d={d} goTo={goTo} canRun={canRun} title="No stage detail in this period">Qualified needs Lead Stage counts per programme.</NoData>;
  const tot = agg.totals;
  const stageTotal = (k) => agg.programmes.reduce((s, p) => s + (p.counts?.[k] || 0), 0);
  const ranked = [...agg.programmes].sort((a, b) => b.qualified - a.qualified);
  const current = agg.programmes.find((p) => p.key === sel) || ranked[0];

  const block = (s, title) => {
    const weeks = weeksFor(d, s.key);
    const st = (k) => s.counts?.[k] || 0;
    return (
      <>
        <div className="grid cols-4">
          <Kpi icon="checkCircle" iconTone="blue" tone="hero" label="Qualified Leads" value={fmt(s.qualified)} sub={`${fmtPct(s.total ? s.qualified / s.total : 0, 1)} of ${fmt(s.total)} leads`} />
          {QUALIFIED_KEYS.slice(0, 3).map((k) => (
            <Kpi key={k} icon="check" iconTone="teal" label={STAGE_LABEL[k]} value={fmt(st(k))} sub={`${fmtPct(s.qualified ? st(k) / s.qualified : 0, 1)} of qualified`} />
          ))}
        </div>
        <p className="small muted">
          Follow-up (Post Counselled): <b>{fmt(st(QUALIFIED_KEYS[3]))}</b> · {fmtPct(s.qualified ? st(QUALIFIED_KEYS[3]) / s.qualified : 0, 1)} of qualified.
          {' '}<LeadsButton hasLeadRows={hasLeadRows} goTo={goTo} drill={{ ...(s.key ? { programme: s.key } : {}), bucket: 'qualified' }} label="See qualified leads" />
        </p>
        <ByWeek
          title={`Qualified by week: ${title}`}
          rows={weeks}
          columns={[num('total', 'Leads'), num('qualified', 'Qualified'), ratio('qp', 'Qualified %', 'qualified')]}
          footer={(
            <>
              {bold(fmt(sumOf(weeks, 'total') || 0), 't')}
              {bold(fmt(sumOf(weeks, 'qualified') || 0), 'q')}
              {bold(fmtPct(sumOf(weeks, 'total') ? sumOf(weeks, 'qualified') / sumOf(weeks, 'total') : 0, 1), 'p')}
            </>
          )}
        />
      </>
    );
  };

  return (
    <>
      <Callout tone="info">
        <b>Qualified</b> = Counselled + OL Sent + Registration Fee Paid + Follow Up – Post Counselled. <b>Qualified %</b> = Qualified ÷ Total Leads.
        It is not “everything that is not junk”: DNP, Untouched and other stages are not counted.
      </Callout>

      <SectionLabel>1 · Overall: all programmes</SectionLabel>
      {block(overallScope(agg), "all programmes")}

      <SectionLabel>2 · Programme-wise</SectionLabel>
      <ByProgramme
        d={d}
        title="Qualified by programme"
        sub="Qualified leads and the four stages that make them up."
        sortKey="qualified"
        selected={current?.key}
        onPick={pick}
        foot={gapNote(agg, [['total', 'Leads']])}
        columns={[num('total', 'Leads'), num('qualified', 'Qualified'), pct('qualifiedPct', 'Qualified %'), ...QUALIFIED_KEYS.map(stageCol)]}
        footer={(
          <>
            {bold(fmt(tot.total), 't')}
            {bold(fmt(tot.qualified), 'q')}
            {bold(fmtPct(tot.qualifiedPct, 1), 'p')}
            {QUALIFIED_KEYS.map((k) => bold(fmt(stageTotal(k)), k))}
          </>
        )}
      />
      <ProgrammePicker d={d} current={current} onChange={setSel} metric="Qualified" goTo={goTo} />
      {current && block(programmeScope(current), shortName(current.label, 60))}
    </>
  );
}

/* ====================================================================== */
/* Untouched                                                              */
/* ====================================================================== */
export function UntouchedDetail() {
  const { d, goTo, canRun, settings, hasLeadRows, drill } = useDetail();
  const [sel, setSel, pick] = useProgramme(drill);
  if (!d || !d.agg.weeks) return <NoData d={d} goTo={goTo} canRun={canRun} />;
  const { agg } = d;
  if (!agg.weeksDetailed) return <NoData d={d} goTo={goTo} canRun={canRun} title="No stage detail in this period">Untouched needs Lead Stage counts per programme.</NoData>;
  const tot = agg.totals;
  const limit = settings.untouchedThreshold ?? 30;
  const th = limit / 100;
  const stageTotal = (k) => agg.programmes.reduce((s, p) => s + (p.counts?.[k] || 0), 0);
  const above = agg.programmes.filter((p) => (p.untouchedPct || 0) >= th).length;
  const ranked = [...agg.programmes].sort((a, b) => b.untouched - a.untouched);
  const current = agg.programmes.find((p) => p.key === sel) || ranked[0];

  const block = (s, title) => {
    const weeks = weeksFor(d, s.key);
    const high = (s.untouchedPct || 0) >= th;
    const st = (k) => s.counts?.[k] || 0;
    return (
      <>
        <div className="grid cols-4">
          <Kpi icon="alert" iconTone={high ? 'red' : 'amber'} tone={`hero ${high ? 'alert' : ''}`} label="Untouched" value={fmt(s.untouched)} sub={`${fmtPct(s.untouchedPct || 0, 1)} of ${fmt(s.total)} leads · alert ${limit}%+`} />
          {UNTOUCHED_KEYS.map((k) => (
            <Kpi key={k} icon="activity" iconTone="amber" label={STAGE_LABEL[k]} value={fmt(st(k))} sub={`${fmtPct(s.untouched ? st(k) / s.untouched : 0, 1)} of untouched`} />
          ))}
          {s.key
            ? <Kpi icon="target" iconTone={high ? 'red' : 'teal'} label="Against the alert" value={high ? 'Above' : 'Below'} sub={`${fmtPct(s.untouchedPct || 0, 1)} vs ${limit}% limit`} />
            : <Kpi icon="programmes" iconTone={above ? 'red' : 'teal'} label="Programmes above alert" value={fmt(above)} sub={`of ${fmt(agg.programmes.length)} programmes`} />}
        </div>
        <p className="small muted">
          <LeadsButton hasLeadRows={hasLeadRows} goTo={goTo} drill={{ ...(s.key ? { programme: s.key } : {}), bucket: 'untouched' }} label="See untouched leads" />
        </p>
        <ByWeek
          title={`Untouched by week: ${title}`}
          rows={weeks}
          columns={[
            num('total', 'Leads'),
            num('untouched', 'Untouched'),
            pct('untouchedPct', 'Untouched %', { cellClass: (w) => (w.total && (w.untouchedPct || 0) >= th ? 'hi' : '') }),
          ]}
          footer={(
            <>
              {bold(fmt(sumOf(weeks, 'total') || 0), 't')}
              {bold(fmt(sumOf(weeks, 'untouched') || 0), 'u')}
              {bold(fmtPct(sumOf(weeks, 'total') ? sumOf(weeks, 'untouched') / sumOf(weeks, 'total') : 0, 1), 'p')}
            </>
          )}
        />
      </>
    );
  };

  return (
    <>
      <Callout tone={tot.untouchedPct >= th ? 'crit' : 'info'}>
        <b>Untouched</b> = Untouched + Reattempt Untouched: leads nobody has worked yet. <b>Untouched %</b> = Untouched ÷ Total Leads.
        {' '}The alert is at <b>{limit}%</b>; in {d.range.label} it is <b>{fmtPct(tot.untouchedPct, 1)}</b>{tot.untouchedPct >= th ? ', above the alert. Follow these up.' : ', below the alert.'}
      </Callout>

      <SectionLabel>1 · Overall: all programmes</SectionLabel>
      {block(overallScope(agg), "all programmes")}

      <SectionLabel>2 · Programme-wise</SectionLabel>
      <ByProgramme
        d={d}
        title="Untouched by programme"
        sub={`Red Untouched % is at or above the ${limit}% alert.`}
        sortKey="untouchedPct"
        selected={current?.key}
        onPick={pick}
        foot={gapNote(agg, [['total', 'Leads']])}
        columns={[
          num('total', 'Leads'),
          num('untouched', 'Untouched'),
          pct('untouchedPct', 'Untouched %', { cellClass: (p) => ((p.untouchedPct || 0) >= th ? 'hi' : '') }),
          ...UNTOUCHED_KEYS.map(stageCol),
        ]}
        footer={(
          <>
            {bold(fmt(tot.total), 't')}
            {bold(fmt(tot.untouched), 'u')}
            {bold(fmtPct(tot.untouchedPct, 1), 'p')}
            {UNTOUCHED_KEYS.map((k) => bold(fmt(stageTotal(k)), k))}
          </>
        )}
      />
      <ProgrammePicker d={d} current={current} onChange={setSel} metric="Untouched" goTo={goTo} />
      {current && block(programmeScope(current), shortName(current.label, 60))}
    </>
  );
}

/* ====================================================================== */
/* Applications & enrolment                                               */
/* ====================================================================== */
export function AppsDetail() {
  const { d, t, goTo, canRun, drill } = useDetail();
  const [sel, setSel, pick] = useProgramme(drill);
  if (!d || !d.agg.weeks) return <NoData d={d} goTo={goTo} canRun={canRun} />;
  const { agg } = d;
  if (agg.weeksNoApps >= agg.weeks) return <NoData d={d} goTo={goTo} canRun={canRun} title="No application data in this period">Map the Applications and Enrolments exports on Weekly run.</NoData>;
  const tot = agg.totals;
  const apps = appsOption(t, agg.programmes);
  const ranked = [...agg.programmes].sort((a, b) => (b.enrolled - a.enrolled) || (b.submitted - a.submitted) || (b.started - a.started));
  const current = agg.programmes.find((p) => p.key === sel) || ranked[0];

  const block = (s, title) => {
    const weeks = weeksFor(d, s.key);
    const rate = (n) => fmtPct(s.total ? (n || 0) / s.total : 0, 1);
    const steps = [
      { name: 'App started', value: s.started || 0, rate: s.total ? (s.started || 0) / s.total : 0, color: t.warn },
      { name: 'App submitted', value: s.submitted || 0, rate: s.total ? (s.submitted || 0) / s.total : 0, color: t.accent },
      { name: 'Enrolment', value: s.enrolled || 0, rate: s.total ? (s.enrolled || 0) / s.total : 0, color: t.violet },
    ];
    const any = (s.started || 0) + (s.submitted || 0) + (s.enrolled || 0) > 0;
    return (
      <>
        <div className="grid cols-4">
          <Kpi icon="file" iconTone="amber" label="App started" value={fmt(s.started || 0)} sub={`${rate(s.started)} of leads · Payment Pending`} />
          <Kpi icon="file" iconTone="blue" label="App submitted" value={fmt(s.submitted || 0)} sub={`${rate(s.submitted)} of leads · Payment Approved`} />
          <Kpi icon="checkCircle" iconTone="violet" tone="hero" label="Enrolment" value={fmt(s.enrolled || 0)} sub={`${rate(s.enrolled)} of leads · Enrolment Status = Yes`} />
          <Kpi icon="users" iconTone="teal" label="Total Leads" value={fmt(s.total)} sub="Base for the % above" />
        </div>
        <div className={s.key ? '' : 'grid cols-2'}>
          <Card icon="file" iconTone="amber" title={`Conversion funnel: ${title}`} sub="Started → submitted → enrolled in this period.">
            {any ? <Chart height={280} label="Application conversion funnel" option={funnelOption(t, steps)} /> : <Empty title="No applications">No applications or enrolments in this period.</Empty>}
          </Card>
          {!s.key && (
            <Card icon="chart" iconTone="blue" title="Applications by programme" sub="Programmes with at least one application or enrolment.">
              {apps.count ? (
                <>
                  <Chart height={Math.max(220, apps.count * 30)} label="Applications by programme" option={apps.option} />
                  <Legend items={apps.legend.map((l, i) => ({ id: String(i), ...l }))} />
                </>
              ) : <Empty title="No applications">No programme has applications in this period.</Empty>}
            </Card>
          )}
        </div>
        <ByWeek
          title={`Applications and enrolment by week: ${title}`}
          rows={weeks}
          columns={[num('total', 'Leads'), num('started', 'App started'), num('submitted', 'App submitted'), num('enrolled', 'Enrolled')]}
          footer={<>{['total', 'started', 'submitted', 'enrolled'].map((f) => bold(sumOf(weeks, f) === null ? null : fmt(sumOf(weeks, f)), f))}</>}
        />
      </>
    );
  };

  return (
    <>
      <Callout tone="info">
        <b>App started</b> = applications with Payment Pending. <b>App submitted</b> = Payment Approved. <b>Enrolment</b> = Enrolment Status = Yes.
        Each is matched to a programme by course name and counted for the week it was exported. % = count ÷ Total Leads.
      </Callout>
      {agg.weeksNoApps > 0 && <p className="small muted">{agg.weeksNoApps} week(s) in this period had no application file, so they add nothing here (shown as — by week).</p>}

      <SectionLabel>1 · Overall: all programmes</SectionLabel>
      {block(overallScope(agg), "all programmes")}

      <SectionLabel>2 · Programme-wise</SectionLabel>
      <ByProgramme
        d={d}
        title="Applications and enrolment by programme"
        sub="Started, submitted and enrolled for each programme."
        sortKey="enrolled"
        selected={current?.key}
        onPick={pick}
        foot={gapNote(agg, [['started', 'App started'], ['submitted', 'App submitted'], ['enrolled', 'Enrolled']])}
        columns={[num('total', 'Leads'), num('started', 'App started'), num('submitted', 'App submitted'), num('enrolled', 'Enrolled'), ratio('er', 'Enrolled %', 'enrolled')]}
        footer={<>{bold(fmt(tot.total), 't')}{bold(fmt(tot.started), 's')}{bold(fmt(tot.submitted), 'b')}{bold(fmt(tot.enrolled), 'e')}{bold(fmtPct(tot.total ? tot.enrolled / tot.total : 0, 1), 'r')}</>}
      />
      <ProgrammePicker d={d} current={current} onChange={setSel} metric="Applications" goTo={goTo} />
      {current && block(programmeScope(current), shortName(current.label, 60))}
    </>
  );
}
