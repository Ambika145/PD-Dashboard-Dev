import React, { useMemo } from 'react';
import { useApp } from '../context.js';
import Chart, { chartTokens } from '../components/Chart.jsx';
import Icon from '../components/Icons.jsx';
import { Kpi, Delta, Card, Empty, Callout, fmt, fmtPct } from '../components/ui.jsx';
import { trendOption, gaugeOption } from '../lib/charts.js';
import { aggregate } from '../lib/periods.js';
import { canRunWeekly } from '../lib/access.js';
import { exportPeriodWorkbook } from '../lib/files.js';
import { isoDate } from '../lib/junkCore.js';

/** Changes are shown only when both periods are complete. */
export const canCompare = (period, d) => period.compare && d.comp.complete && d.prevComp.complete && d.prevAgg.weeks > 0;

export default function Overview() {
  const { derived: d, period, settings, weeks, resolvedTheme, goTo, toast, user } = useApp();
  const t = useMemo(() => chartTokens(), [resolvedTheme]);
  const canRun = canRunWeekly(user);

  if (!d || !d.agg.weeks) {
    return (
      <div className="card">
        <Empty
          icon="calendar"
          title={d ? `No data for ${d.range.label}` : 'No weeks yet'}
          action={<button className="btn" type="button" onClick={() => goTo(canRun ? 'run' : 'history')}>{canRun ? 'Go to Weekly run' : 'Open History'}</button>}
        >
          {canRun
            ? 'Choose another period above, or open Weekly run to analyse this week’s files.'
            : 'Choose another period above, or ask a Super Admin to approve a weekly run.'}
        </Empty>
      </div>
    );
  }

  const { agg, prevAgg, comp } = d;
  const cmp = canCompare(period, d);
  const th = settings.threshold / 100;
  const untouchedTh = (settings.untouchedThreshold ?? 30) / 100;
  const tot = agg.totals;
  const prev = prevAgg.totals;
  const overGoal = tot.junkPct >= th;
  const untouchedHigh = agg.weeksDetailed > 0 && tot.untouchedPct >= untouchedTh;
  const hasStages = agg.weeksDetailed > 0;
  const hasApps = agg.weeksNoApps < agg.weeks;
  const dnpDetail = agg.dnpDetail;
  // Each card opens its own detail page; that page's Total row equals the card.
  const DETAIL_OF = { total: 'leads', junk: 'junk', qualified: 'qualified', untouched: 'untouched', started: 'apps', submitted: 'apps', enrolled: 'apps' };
  const openTotals = (key) => goTo(DETAIL_OF[key]);
  const totalsTitle = 'Open the detail for this card';
  // Value and % cover every week; Note Count exists only for weeks approved in Weekly run, so say so.
  const dnpSub = hasStages
    ? (dnpDetail?.notesMapped
      ? `${fmtPct(tot.dnpPct, 1)} of leads · call attempts known for ${fmt(dnpDetail.notesKnown)} of ${fmt(tot.dnp)}`
      : `${fmtPct(tot.dnpPct, 1)} of leads · Did Not Pick (DNP)`)
    : 'Needs stage detail from an approved week';

  const contextTrend = agg.series.length < 2;
  const series = contextTrend
    ? aggregate(
      [...weeks].filter((w) => w.end <= isoDate(d.range.end)).sort((a, b) => a.id.localeCompare(b.id)).slice(-10),
    ).series
    : agg.series;
  const marks = contextTrend ? [] : [{ value: tot.junkPct, label: `Average ${fmtPct(tot.junkPct)}` }];
  if (!contextTrend && period.compare && prevAgg.weeks) marks.push({ value: prev.junkPct, label: `Previous ${fmtPct(prev.junkPct)}`, color: t.faint });

  const download = async () => {
    try { await exportPeriodWorkbook(d.range, agg, d.comp, settings.threshold); toast('Period report downloaded.'); } catch (e) { toast(`Download failed: ${e.message}`, 'err'); }
  };

  const insightTone = overGoal ? 'warn' : 'good';
  const insightText = overGoal
    ? <>In <b>{d.range.label}</b>, <b>{fmtPct(tot.junkPct, 1)}</b> of leads were junk — above your {settings.threshold}% goal.</>
    : <>In <b>{d.range.label}</b>, <b>{fmtPct(tot.junkPct, 1)}</b> of leads were junk — within your {settings.threshold}% goal.</>;

  return (
    <>
      <Callout tone={insightTone}>{insightText}</Callout>

      {untouchedHigh && (
        <Callout tone="crit">
          <b>Untouched alert:</b> <b>{fmtPct(tot.untouchedPct, 1)}</b> of leads
          ({fmt(tot.untouched)}) are still Untouched — above the {settings.untouchedThreshold ?? 30}% limit. Follow these up.
        </Callout>
      )}

      {comp.missing.length > 0 && (
        <Callout tone="info">
          Data is partial: <b>{comp.present} of {comp.expected}</b> weeks are available
          (missing: {comp.missing.join(', ')}). Numbers below use only the weeks that have been run.
        </Callout>
      )}

      <div className="kpi-section-label">Lead pipeline · click any card for its detail</div>
      <div className="grid cols-4">
        <Kpi
          icon="users" iconTone="teal"
          label="Total Leads"
          value={fmt(tot.total)}
          sub={`From ${agg.weeks} reporting week${agg.weeks === 1 ? '' : 's'}`}
          delta={<Delta show={cmp} cur={tot.total} prev={prev.total} badWhenUp={false} />}
          spark={series.map((s) => s.total)}
          sparkColor="var(--teal)"
          onClick={() => openTotals('total')}
          title={totalsTitle}
        />
        <Kpi
          icon="alert" iconTone={overGoal ? 'red' : 'amber'}
          tone={`hero ${overGoal ? 'alert' : ''}`}
          label="Junk Leads"
          value={fmt(tot.junk)}
          sub={`${fmtPct(tot.junkPct, 1)} of all leads · goal ≤ ${settings.threshold}%`}
          delta={<Delta show={cmp} cur={tot.junk} prev={prev.junk} />}
          spark={series.map((s) => s.junk)}
          sparkColor={overGoal ? 'var(--crit)' : 'var(--warn)'}
          onClick={() => openTotals('junk')}
          title={totalsTitle}
        />
        <Kpi
          icon="checkCircle" iconTone="blue"
          label="Qualified Leads"
          value={hasStages ? fmt(tot.qualified) : '—'}
          sub={hasStages
            ? `${fmtPct(tot.qualifiedPct, 1)} · Counselled + OL Sent + Fee Paid + Follow-up`
            : 'Needs stage detail from an approved week'}
          delta={<Delta show={cmp && prevAgg.weeksDetailed} cur={tot.qualified} prev={prev.qualified} badWhenUp={false} />}
          spark={hasStages ? series.map((s) => s.qualified || 0) : undefined}
          sparkColor="var(--accent)"
          onClick={hasStages ? () => openTotals('qualified') : undefined}
          title={totalsTitle}
        />
        <Kpi
          icon="activity" iconTone="violet"
          label="DNP"
          value={hasStages ? fmt(tot.dnp) : '—'}
          sub={dnpSub}
          delta={<Delta show={cmp && prevAgg.weeksDetailed} cur={tot.dnp} prev={prev.dnp} />}
          spark={hasStages ? series.map((s) => s.dnp || 0) : undefined}
          sparkColor="var(--violet)"
          onClick={() => goTo('dnp')}
          title={totalsTitle}
        />
      </div>

      <div className="kpi-section-label">Follow-up & conversion</div>
      <div className="grid cols-4">
        <Kpi
          icon="alert" iconTone={untouchedHigh ? 'red' : 'amber'}
          tone={untouchedHigh ? 'alert' : ''}
          label="Untouched"
          value={hasStages ? fmt(tot.untouched) : '—'}
          sub={hasStages
            ? `${fmtPct(tot.untouchedPct, 1)} · Untouched + Reattempt · alert ${settings.untouchedThreshold ?? 30}%+`
            : 'Needs stage detail from an approved week'}
          delta={<Delta show={cmp && prevAgg.weeksDetailed} cur={tot.untouched} prev={prev.untouched} />}
          spark={hasStages ? series.map((s) => s.untouched || 0) : undefined}
          sparkColor={untouchedHigh ? 'var(--crit)' : 'var(--warn)'}
          onClick={hasStages ? () => openTotals('untouched') : undefined}
          title={totalsTitle}
        />
        <Kpi
          icon="file" iconTone="amber"
          label="App started"
          value={hasApps ? fmt(tot.started) : '—'}
          sub={hasApps ? 'Payment Pending applications' : 'Needs application export in weekly run'}
          delta={<Delta show={cmp && hasApps} cur={tot.started} prev={prev.started} badWhenUp={false} />}
          spark={hasApps ? series.map((s) => s.started || 0) : undefined}
          sparkColor="var(--warn)"
          onClick={hasApps ? () => openTotals('started') : undefined}
          title={totalsTitle}
        />
        <Kpi
          icon="file" iconTone="blue"
          label="App submitted"
          value={hasApps ? fmt(tot.submitted) : '—'}
          sub={hasApps ? 'Payment Approved applications' : 'Needs application export in weekly run'}
          delta={<Delta show={cmp && hasApps} cur={tot.submitted} prev={prev.submitted} badWhenUp={false} />}
          spark={hasApps ? series.map((s) => s.submitted || 0) : undefined}
          sparkColor="var(--accent)"
          onClick={hasApps ? () => openTotals('submitted') : undefined}
          title={totalsTitle}
        />
        <Kpi
          icon="checkCircle" iconTone="violet"
          label="Enrolment"
          value={hasApps ? fmt(tot.enrolled) : '—'}
          sub={hasApps ? 'Enrolment Status = Yes' : 'Needs enrolment export in weekly run'}
          delta={<Delta show={cmp && hasApps} cur={tot.enrolled} prev={prev.enrolled} badWhenUp={false} />}
          spark={hasApps ? series.map((s) => s.enrolled || 0) : undefined}
          sparkColor="var(--violet)"
          onClick={hasApps ? () => openTotals('enrolled') : undefined}
          title={totalsTitle}
        />
      </div>

      <div className="grid cols-21">
        <Card
          icon="activity" iconTone="blue"
          title="Junk rate trend"
          actions={<button className="btn ghost sm" type="button" onClick={download}><Icon name="download" size={14} />Download Excel</button>}
          sub={contextTrend
            ? 'Only one week in this period — showing the last 10 weeks for context.'
            : 'Each point is one week. Dashed lines mark period average and previous period.'}
        >
          <Chart height={280} label="Weekly junk rate over time" option={trendOption(t, series, marks)} />
        </Card>
        <Card
          className="viz-card"
          icon="percent"
          iconTone={overGoal ? 'red' : 'teal'}
          title="Junk vs goal"
          sub={`Threshold set at ${settings.threshold}%. Needle shows the period junk rate.`}
        >
          <Chart height={240} label="Junk rate gauge" option={gaugeOption(t, tot.junkPct, th)} />
          <div className="viz-stat-row">
            <div><span className="muted">Period</span><b className={overGoal ? 'hi-text' : ''}>{fmtPct(tot.junkPct, 1)}</b></div>
            <div><span className="muted">Goal</span><b>≤ {settings.threshold}%</b></div>
            <div><span className="muted">Gap</span><b className={overGoal ? 'hi-text' : 'good-text'}>{overGoal ? '+' : ''}{((tot.junkPct - th) * 100).toFixed(1)} pts</b></div>
          </div>
        </Card>

      </div>

      {agg.weeksImported > 0 && (
        <p className="small muted">Includes {agg.weeksImported} week(s) imported from the past Junk Report workbook.</p>
      )}
    </>
  );
}