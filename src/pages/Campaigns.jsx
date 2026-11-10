import React, { useMemo } from 'react';
import { useApp } from '../context.js';
import Chart, { chartTokens } from '../components/Chart.jsx';
import Icon from '../components/Icons.jsx';
import { Card, DataTable, Empty, Kpi, Legend, fmt, fmtPct } from '../components/ui.jsx';
import { shortName, hbarOption, itemsDonutOption } from '../lib/charts.js';
import { canRunWeekly } from '../lib/access.js';

export default function Campaigns() {
  const { derived: d, drill, setDrill, goTo, settings, resolvedTheme, user } = useApp();
  const t = useMemo(() => chartTokens(), [resolvedTheme]);
  const canRun = canRunWeekly(user);
  if (!d) return null;
  const all = d.agg.campaigns;
  if (!all.length) {
    return (
      <div className="card">
        <Empty
          icon="campaigns"
          title="No campaign detail in this period"
          action={<button className="btn" type="button" onClick={() => goTo(canRun ? 'run' : 'history')}>{canRun ? 'Go to Weekly run' : 'Open History'}</button>}
        >
          Campaign figures come from approved weeks whose leads export had the Primary Registration Campaign column. Map the same column on Applications and Enrolments to fill those columns too.
        </Empty>
      </div>
    );
  }
  const progs = d.agg.programmes;
  const selProg = progs.find((p) => p.key === drill.programme);
  const rows = (selProg ? all.filter((c) => c.course === selProg.label) : all).map((c, i) => ({ ...c, id: `${c.course}|${c.label}|${i}` }));
  const max = Math.max(...rows.map((r) => r.junkPct), 0.01);
  const th = settings.threshold / 100;
  const hasLeadRows = (d.weeks || []).some((w) => w.rows?.leads?.length);

  const topJunk = [...rows].sort((a, b) => b.junk - a.junk).slice(0, 8);
  const topRate = [...rows].filter((r) => r.total >= 20).sort((a, b) => b.junkPct - a.junkPct).slice(0, 8);
  const topBar = hbarOption(
    t,
    topJunk.map((c) => ({ ...c, label: c.label })),
    {
      value: (x) => x.junk,
      format: (v) => fmt(v),
      color: t.crit,
      tooltip: (x) => `${x.label}<br/><b>${fmt(x.junk)}</b> junk of ${fmt(x.total)} · ${fmtPct(x.junkPct, 1)}`,
    },
  );
  const shareDonut = itemsDonutOption(
    t,
    topJunk.slice(0, 6).map((c, i) => ({
      name: shortName(c.label, 28),
      id: c.id,
      value: c.junk,
      color: ['#dc2626', '#ea580c', '#d97706', '#7c3aed', '#2563eb', '#0d9488'][i],
    })),
    { centerValue: fmt(rows.reduce((s, r) => s + r.junk, 0)), centerLabel: 'Junk leads' },
  );

  const totalLeads = rows.reduce((s, r) => s + r.total, 0);
  // The campaign split only exists for some weeks (Weekly run with the campaign column, or the workbook's campaign sheet).
  const scopeLabels = selProg ? new Set([selProg.label]) : null;
  const weekCover = d.weeks.map((w) => {
    const leads = (w.programmes || []).filter((p) => !scopeLabels || scopeLabels.has(p.label)).reduce((s, p) => s + (p.total || 0), 0);
    const camp = (w.campaigns || []).filter((c) => !scopeLabels || scopeLabels.has(c.course)).reduce((s, c) => s + (c.total || 0), 0);
    return { label: w.label, leads, camp };
  });
  const periodLeads = weekCover.reduce((s, w) => s + w.leads, 0);
  const noSplit = weekCover.filter((w) => w.leads && !w.camp);
  const partSplit = weekCover.filter((w) => w.camp && w.camp !== w.leads);
  const totalJunk = rows.reduce((s, r) => s + r.junk, 0);
  const overGoal = rows.filter((r) => r.junkPct >= th).length;

  return (
    <>
      {totalLeads !== periodLeads && (
        <div className="callout info">
          <Icon name="info" size={16} />
          <div>
            <b>Campaign figures cover {fmt(totalLeads)} of {fmt(periodLeads)} leads</b> in {d.range.label}{selProg ? ` for ${shortName(selProg.label, 40)}` : ''}, so totals here are lower than Overview.
            {noSplit.length > 0 && <> No campaign split for: {noSplit.map((w) => w.label).join(', ')}.</>}
            {partSplit.length > 0 && <> Campaign rows do not match the programme total for: {partSplit.map((w) => `${w.label} (${fmt(w.camp)} vs ${fmt(w.leads)})`).join(', ')}.</>}
            {' '}This is how the Junk Report workbook was filled in; weeks approved in Weekly run with the campaign column always match.
          </div>
        </div>
      )}
      <div className="grid cols-4">
        <Kpi icon="campaigns" iconTone="blue" label="Campaigns" value={fmt(rows.length)} sub={selProg ? shortName(selProg.label, 40) : 'All programmes'} />
        <Kpi icon="users" iconTone="teal" label="Leads" value={fmt(totalLeads)} sub={`${fmt(totalJunk)} junk`} />
        <Kpi icon="alert" iconTone={totalLeads && totalJunk / totalLeads >= th ? 'red' : 'amber'} label="Junk rate" value={fmtPct(totalLeads ? totalJunk / totalLeads : 0, 1)} sub={`Goal ≤ ${settings.threshold}%`} />
        <Kpi icon="activity" iconTone="violet" label="Above goal" value={fmt(overGoal)} sub={`of ${fmt(rows.length)} campaigns`} />
      </div>

      <div className="grid cols-2">
        <Card className="viz-card" icon="alert" iconTone="red" title="Top campaigns by junk volume" sub="Highest junk lead counts in the selected scope.">
          {topJunk.length ? (
            <Chart
              height={Math.max(220, topJunk.length * 32)}
              label="Top campaigns by junk count"
              option={topBar}
              onClick={hasLeadRows ? (p) => {
                const c = topBar._sorted[p.dataIndex];
                goTo('records', { programme: progs.find((x) => x.label === c.course)?.key, campaign: c.label });
              } : undefined}
            />
          ) : <Empty title="No campaigns" />}
        </Card>
        <Card className="viz-card" icon="filter" iconTone="violet" title="Junk share — top 6" sub="Where junk volume concentrates among campaigns.">
          {topJunk.length ? (
            <>
              <Chart height={260} label="Campaign junk share donut" option={shareDonut} />
              <Legend items={topJunk.slice(0, 6).map((c, i) => ({
                id: c.id,
                label: shortName(c.label, 24),
                color: ['#dc2626', '#ea580c', '#d97706', '#7c3aed', '#2563eb', '#0d9488'][i],
                value: fmt(c.junk),
              }))} />
            </>
          ) : <Empty title="No campaigns" />}
        </Card>
      </div>

      {topRate.length > 0 && (
        <Card icon="percent" iconTone="amber" title="Highest junk rates (min 20 leads)" sub="Rates only — small campaigns with tiny denominators are excluded.">
          <div className="breakdown">
            {topRate.map((c) => (
              <button
                key={c.id}
                type="button"
                className="bd-row"
                onClick={hasLeadRows ? () => goTo('records', { programme: progs.find((x) => x.label === c.course)?.key, campaign: c.label }) : undefined}
              >
                <span className="bd-name">{shortName(c.label, 48)}{!selProg && <span className="muted"> · {shortName(c.course, 28)}</span>}</span>
                <span className="bd-val">
                  {fmtPct(c.junkPct, 1)}
                  <span>{fmt(c.junk)} / {fmt(c.total)}</span>
                </span>
                <span className="bd-bar">
                  <i style={{ width: `${(c.junkPct / Math.max(...topRate.map((x) => x.junkPct), 0.01)) * 100}%`, background: c.junkPct >= th ? 'var(--crit)' : 'var(--warn)' }} />
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card
        icon="campaigns"
        iconTone="blue"
        title="All campaigns"
        sub={hasLeadRows
          ? 'Leads, junk, applications, and enrolments. Click a row to open its leads in Records.'
          : 'Leads, junk, applications, and enrolments by Primary Registration Campaign.'}
        actions={(
          <select className="select" aria-label="Programme" value={drill.programme || ''} onChange={(e) => setDrill({ programme: e.target.value || undefined })}>
            <option value="">All programmes</option>
            {progs.map((p) => <option key={p.key} value={p.key}>{shortName(p.label, 60)}</option>)}
          </select>
        )}
      >
        <DataTable
          rows={rows}
          search="Search campaigns"
          searchKeys={['label', 'course']}
          initialSort={{ key: 'junk', dir: 'desc' }}
          pageSize={25}
          onRowClick={hasLeadRows ? (c) => goTo('records', { programme: progs.find((x) => x.label === c.course)?.key, campaign: c.label }) : undefined}
          columns={[
            { key: 'label', label: 'Campaign', align: 'left', wrap: true, render: (c) => <span className="mono">{c.label}</span> },
            ...(selProg ? [] : [{ key: 'course', label: 'Programme', align: 'left', wrap: true, render: (c) => shortName(c.course, 44) }]),
            { key: 'total', label: 'Leads', render: (c) => fmt(c.total) },
            { key: 'junk', label: 'Junk', render: (c) => fmt(c.junk) },
            { key: 'junkPct', label: 'Junk rate', cellClass: (c) => (c.junkPct >= th ? 'hi' : ''), render: (c) => <span className="inline-bar"><i style={{ width: `${(c.junkPct / max) * 100}%` }} /><span>{fmtPct(c.junkPct)}</span></span> },
            { key: 'started', label: 'App started', render: (c) => fmt(c.started) },
            { key: 'submitted', label: 'App submitted', render: (c) => fmt(c.submitted) },
            { key: 'enrolled', label: 'Enrolled', render: (c) => fmt(c.enrolled) },
          ]}
        />
      </Card>
    </>
  );
}
