import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context.js';
import Chart, { chartTokens, baseOption } from '../components/Chart.jsx';
import Icon from '../components/Icons.jsx';
import { Kpi, Delta, Card, DataTable, Empty, Callout, Legend, fmt, fmtPct } from '../components/ui.jsx';
import { trendOption, CATS, labelWidth, stageBarColor, donutOption, gaugeOption, funnelOption } from '../lib/charts.js';
import { JUNK_CATEGORIES, UNTOUCHED_KEYS } from '../lib/junkCore.js';
import { canRunWeekly } from '../lib/access.js';
import { canCompare } from './Overview.jsx';

const catOfStage = (key) => JUNK_CATEGORIES.find((c) => c.keys.includes(key))?.id || null;
const isUntouchedStage = (key) => UNTOUCHED_KEYS.includes(key);

export default function Programmes() {
  const { derived: d, drill, setDrill, goTo, settings, resolvedTheme, period, user, assignedKeys } = useApp();
  const t = useMemo(() => chartTokens(), [resolvedTheme]);
  const canRun = canRunWeekly(user);
  const [progQuery, setProgQuery] = useState('');
  const [mineOnly, setMineOnly] = useState(false);
  const mineSet = useMemo(() => (assignedKeys?.length ? new Set(assignedKeys) : null), [assignedKeys]);

  const progs = d?.agg?.programmes || [];
  const ranked = useMemo(() => [...progs].sort((a, b) => b.junk - a.junk), [progs]);
  const filteredProgs = useMemo(() => {
    const q = progQuery.trim().toLowerCase();
    return ranked.filter((p) => {
      if (mineOnly && mineSet && !mineSet.has(p.key)) return false;
      if (!q) return true;
      return p.label.toLowerCase().includes(q) || p.key.toLowerCase().includes(q);
    });
  }, [ranked, progQuery, mineOnly, mineSet]);

  // "All programmes" (the default) adds up every programme in view; with "My programmes" on, only yours.
  const allBase = mineOnly && mineSet ? progs.filter((p) => mineSet.has(p.key)) : progs;
  const allProg = useMemo(() => buildAll(allBase, allBase === progs ? d?.agg : null, mineOnly && mineSet), [allBase, progs, d, mineOnly, mineSet]);
  const sel = (drill.programme && progs.find((p) => p.key === drill.programme)) || (allBase.length ? allProg : null);
  const isAll = sel?.key === ALL_KEY;

  // Typing a search jumps to the first match; picking "All programmes" afterwards stays put.
  useEffect(() => {
    if (!progQuery.trim() || !filteredProgs.length) return;
    if (!filteredProgs.some((p) => p.key === sel?.key)) setDrill({ programme: filteredProgs[0].key });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progQuery, mineOnly]);

  if (!d) return null;
  if (!progs.length || !sel) {
    return (
      <div className="card">
        <Empty
          icon="programmes"
          title="No programme detail in this period"
          action={<button className="btn" type="button" onClick={() => goTo(canRun ? 'run' : 'history')}>{canRun ? 'Go to Weekly run' : 'Open History'}</button>}
        >
          Programme numbers appear after you approve a weekly run, or from imported Junk Report weeks.
        </Empty>
      </div>
    );
  }

  const hasLeadRows = (d.weeks || []).some((w) => w.rows?.leads?.length);
  const prev = isAll ? (allBase === progs ? d.prevAgg.totals : null) : d.prevAgg.programmes.find((p) => p.key === sel.key);
  const cmp = canCompare(period, d) && !!prev;
  const th = settings.threshold / 100;
  const untouchedTh = (settings.untouchedThreshold ?? 30) / 100;
  const overGoal = sel.junkPct >= th;
  const untouchedHigh = (sel.untouchedPct || 0) >= untouchedTh;

  const stages = d.agg.stageCols.map((s) => {
    const n = sel.counts[s.key] || 0;
    const share = sel.total ? n / sel.total : 0;
    const cat = catOfStage(s.key);
    const untouchedAlert = isUntouchedStage(s.key) && (sel.untouchedPct || 0) >= untouchedTh;
    return {
      ...s,
      n,
      share,
      cat,
      untouchedAlert,
      color: stageBarColor(s.key, { cat, untouchedAlert, tokens: t }),
    };
  }).filter((s) => s.n > 0).sort((a, b) => b.n - a.n);
  const stageOption = {
    ...baseOption(t),
    grid: { left: 4, right: 96, top: 4, bottom: 4, containLabel: true },
    tooltip: {
      ...baseOption(t).tooltip,
      trigger: 'item',
      formatter: (p) => {
        const s = stages[p.dataIndex];
        return [
          `<b>${s.label}</b>`,
          `<b>${fmt(s.n)}</b> leads · <b>${fmtPct(s.share, 1)}</b> of ${isAll ? 'these programmes' : 'this programme'}`,
          s.cat ? 'Counted as junk' : 'Not counted as junk',
          s.untouchedAlert ? '<span style="color:#fca5a5">Above Untouched alert</span>' : '',
        ].filter(Boolean).join('<br/>');
      },
    },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      inverse: true,
      data: stages.map((s) => s.label),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: t.ink2, fontSize: 11.5, width: labelWidth(), overflow: 'truncate' },
    },
    series: [{
      type: 'bar',
      barMaxWidth: 14,
      data: stages.map((s) => ({
        value: s.n,
        itemStyle: {
          color: s.color,
          borderRadius: [0, 4, 4, 0],
          // Junk stages get a stronger outline so they stay readable when colours vary.
          borderColor: s.cat ? 'rgba(0,0,0,0.18)' : 'transparent',
          borderWidth: s.cat ? 1 : 0,
        },
      })),
      label: {
        show: true,
        position: 'right',
        color: t.ink2,
        fontSize: 11,
        fontWeight: 600,
        formatter: (p) => {
          const s = stages[p.dataIndex];
          return `${fmt(s.n)}  ${fmtPct(s.share, 1)}`;
        },
      },
    }],
  };

  const series = isAll && allBase === progs ? d.agg.series : d.weeks.filter((w) => w.programmes?.length).map((w) => {
    const p = isAll ? sumWeek(w.programmes.filter((x) => mineSet.has(x.key))) : w.programmes.find((x) => x.key === sel.key);
    return p ? { id: w.id, label: w.label, short: w.label.split(' - ')[0], total: p.total, junk: p.junk, junkPct: p.total ? p.junk / p.total : 0, source: w.source } : null;
  }).filter(Boolean);
  const allLabels = new Set(allBase.map((p) => p.label));
  const camps = d.agg.campaigns.filter((c) => (isAll ? allLabels.has(c.course) : c.course === sel.label));
  const progDrill = isAll ? {} : { programme: sel.key };

  return (
    <>
      <Card className="prog-picker" title="Choose a programme, or all programmes" sub={`${fmt(filteredProgs.length)} of ${fmt(progs.length)} programmes${mineOnly ? ' · owned by you' : ''}. Search to jump quickly; full catalogue is available to every user.`}>
        <div className="prog-picker-tools">
          <label className="search prog-search">
            <Icon name="search" size={14} />
            <input
              aria-label="Search programmes"
              placeholder="Search programmes by name…"
              value={progQuery}
              onChange={(e) => setProgQuery(e.target.value)}
            />
            {progQuery && (
              <button type="button" className="search-clear" aria-label="Clear search" onClick={() => setProgQuery('')}>×</button>
            )}
          </label>
          {mineSet && (
            <button
              type="button"
              className={`btn sm ${mineOnly ? '' : 'ghost'}`}
              aria-pressed={mineOnly}
              onClick={() => setMineOnly((v) => !v)}
            >
              {mineOnly ? 'Showing mine' : 'My programmes'}
            </button>
          )}
          <select
            className="select prog-select"
            aria-label="Programme"
            value={isAll ? ALL_KEY : sel.key}
            onChange={(e) => setDrill(e.target.value === ALL_KEY ? {} : { programme: e.target.value })}
          >
            <option value={ALL_KEY}>{allProg.label} ({fmt(allBase.length)})</option>
            {!isAll && !filteredProgs.some((p) => p.key === sel.key) && <option value={sel.key}>{sel.label}</option>}
            {filteredProgs.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}{mineSet?.has(p.key) ? ' · mine' : ''}
              </option>
            ))}
          </select>
        </div>
        {!filteredProgs.length && (
          <p className="small muted" style={{ marginTop: 10 }}>No programmes match this search. Clear the filter to see all.</p>
        )}
      </Card>

      <Callout tone={overGoal ? 'warn' : 'good'}>
        <b>{sel.label}</b>: junk rate is <b>{fmtPct(sel.junkPct, 1)}</b>
        {overGoal ? <> — above the {settings.threshold}% goal.</> : <> — within the {settings.threshold}% goal.</>}
        {!isAll && <>{' '}All programmes together: {fmtPct(d.agg.totals.junkPct)}.</>}
      </Callout>

      {untouchedHigh && (
        <Callout tone="crit">
          <b>Untouched alert:</b> <b>{fmtPct(sel.untouchedPct, 1)}</b> of leads {isAll ? 'across these programmes' : 'on this programme'}
          ({fmt(sel.untouched)}) are Untouched — above the {settings.untouchedThreshold ?? 30}% limit.
        </Callout>
      )}

      <div className="grid cols-4">
        <Kpi icon="percent" iconTone={overGoal ? 'red' : 'blue'} tone={`hero ${overGoal ? 'alert' : ''}`} label="Junk rate" value={fmtPct(sel.junkPct, 1)} sub={`${fmt(sel.junk)} junk of ${fmt(sel.total)} leads`} delta={<Delta show={cmp} cur={sel.junkPct} prev={prev?.junkPct} kind="pct" />} spark={series.map((s) => s.junkPct)} sparkColor={overGoal ? 'var(--crit)' : 'var(--accent)'} />
        <Kpi icon="users" iconTone="teal" label="Total leads" value={fmt(sel.total)} sub={`${fmt(sel.junk)} counted as junk`} delta={<Delta show={cmp} cur={sel.total} prev={prev?.total} badWhenUp={false} />} />
        <Kpi icon="file" iconTone="amber" label="Applications submitted" value={fmt(sel.submitted)} sub={`${fmt(sel.started)} started an application`} />
        <Kpi icon="checkCircle" iconTone="violet" label="Students enrolled" value={fmt(sel.enrolled)} />
      </div>

      <div className="grid viz-3">
        <Card className="viz-card" icon="filter" iconTone="violet" title="Junk mix" sub="Category split for this programme.">
          {(sel.jl != null || sel.fin != null || sel.ni != null) ? (
            <>
              <Chart
                height={220}
                label="Programme junk mix donut"
                option={donutOption(t, {
                  total: sel.total,
                  junk: sel.junk,
                  jl: sel.jl || 0,
                  fin: sel.fin || 0,
                  ni: sel.ni || 0,
                  other: Math.max(0, sel.total - sel.junk),
                })}
              />
              <Legend items={CATS.map((c) => ({ id: c.id, label: c.label, color: t[c.token], value: fmt(sel[c.id] || 0) }))} />
            </>
          ) : <Empty title="No category split">This programme has no junk category counts.</Empty>}
        </Card>
        <Card className="viz-card" icon="percent" iconTone={overGoal ? 'red' : 'teal'} title="Vs goal" sub={`Goal ≤ ${settings.threshold}%.`}>
          <Chart height={220} label="Programme junk gauge" option={gaugeOption(t, sel.junkPct, th)} />
        </Card>
        <Card className="viz-card" icon="file" iconTone="amber" title="Conversion" sub="App started → submitted → enrolled.">
          {(sel.started || sel.submitted || sel.enrolled) ? (
            <Chart
              height={220}
              label="Programme conversion funnel"
              option={funnelOption(t, [
                { name: 'Started', value: sel.started || 0, color: t.warn },
                { name: 'Submitted', value: sel.submitted || 0, color: t.accent },
                { name: 'Enrolled', value: sel.enrolled || 0, color: t.violet },
              ])}
            />
          ) : <Empty title="No application data">Map Applications / Enrolments on Weekly run.</Empty>}
        </Card>
      </div>

      <div className="grid cols-2">
        <Card
          icon="chart"
          iconTone="violet"
          title="Where did these leads end up?"
          sub={hasLeadRows
            ? `Each stage has its own colour. Bars show count and % of ${isAll ? 'these programmes' : 'this programme'}. Click a bar to open those leads.`
            : `Each stage has its own colour. Bars show count and % of ${isAll ? 'these programmes' : 'this programme'}. Lead-level Records need an approved weekly run.`}
        >
          {stages.length ? (
            <>
              <Chart
                height={Math.max(220, stages.length * 28)}
                label="Lead stages"
                option={stageOption}
                onClick={hasLeadRows ? (p) => goTo('records', { ...progDrill, stage: stages[p.dataIndex].label }) : undefined}
              />
              <div className="stage-legend" aria-hidden="true">
                {CATS.map((c) => (
                  <span key={c.id} className="stage-legend-item">
                    <i style={{ background: t[c.token] }} />
                    {c.label}
                  </span>
                ))}
                <span className="stage-legend-item">
                  <i style={{ background: stageBarColor('COUNSELLED', { tokens: t }) }} />
                  Other stages (unique colours)
                </span>
              </div>
            </>
          ) : (
            <Empty title="No stage detail">This programme has no stage counts in the selected period.</Empty>
          )}
        </Card>
        <Card icon="activity" iconTone="blue" title="Junk rate over the weeks" sub={isAll ? 'How the junk % moved week by week.' : 'How this programme’s junk % moved week by week.'}>
          {series.length ? <Chart height={240} label="Weekly junk rate for this programme" option={trendOption(t, series, [])} /> : <Empty title="No weekly detail" />}
        </Card>
      </div>

      <Card
        icon="campaigns"
        iconTone="blue"
        title={isAll ? 'Campaigns for all programmes' : 'Campaigns for this programme'}
        foot={camps.length && camps.reduce((n, c) => n + c.total, 0) !== sel.total
          ? `Campaign rows cover ${fmt(camps.reduce((n, c) => n + c.total, 0))} of ${fmt(sel.total)} leads: some weeks in this period have no campaign split (see the Campaigns page for which).`
          : null}
        sub={hasLeadRows
          ? 'Leads, applications, and enrolments by campaign. Click a row to open its leads in Records.'
          : 'Leads, applications, and enrolments by campaign.'}
      >
        <DataTable
          rows={camps}
          initialSort={{ key: 'junk', dir: 'desc' }}
          maxHeight={false}
          onRowClick={hasLeadRows ? (c) => goTo('records', { programme: progs.find((x) => x.label === c.course)?.key, campaign: c.label }) : undefined}
          empty="No campaign names were found (the leads file may not have had the Primary Registration Campaign column)."
          columns={[
            { key: 'label', label: 'Campaign', align: 'left', wrap: true, render: (c) => <span className="mono">{c.label}</span> },
            { key: 'total', label: 'Leads', render: (c) => fmt(c.total) },
            { key: 'junk', label: 'Junk', render: (c) => fmt(c.junk) },
            { key: 'junkPct', label: 'Junk %', cellClass: (c) => (c.junkPct >= th ? 'hi' : ''), render: (c) => fmtPct(c.junkPct) },
            { key: 'started', label: 'App started', render: (c) => fmt(c.started) },
            { key: 'submitted', label: 'App submitted', render: (c) => fmt(c.submitted) },
            { key: 'enrolled', label: 'Enrolled', render: (c) => fmt(c.enrolled) },
          ]}
        />
      </Card>
    </>
  );
}

const ALL_KEY = '__all__';
const SUM_FIELDS = ['total', 'junk', 'jl', 'fin', 'ni', 'started', 'submitted', 'enrolled', 'untouched', 'dnp', 'qualified'];

function sumWeek(list) {
  if (!list.length) return null;
  const total = list.reduce((s, p) => s + (p.total || 0), 0);
  const junk = list.reduce((s, p) => s + (p.junk || 0), 0);
  return { total, junk, junkPct: total ? junk / total : 0 };
}

/** One "programme" that adds up the given programmes. With agg, headline numbers come from the period totals (= Overview). */
function buildAll(list, agg, mine) {
  const a = { key: ALL_KEY, label: mine ? 'All my programmes' : 'All programmes', counts: {} };
  for (const f of SUM_FIELDS) a[f] = list.reduce((s, p) => s + (p[f] || 0), 0);
  for (const p of list) for (const [k, v] of Object.entries(p.counts || {})) a.counts[k] = (a.counts[k] || 0) + v;
  if (agg) {
    for (const f of ['total', 'junk', 'started', 'submitted', 'enrolled']) a[f] = agg.totals[f] || 0;
  }
  a.junkPct = a.total ? a.junk / a.total : 0;
  a.untouchedPct = a.total ? a.untouched / a.total : 0;
  return a;
}
