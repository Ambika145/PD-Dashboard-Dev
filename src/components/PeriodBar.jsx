import React, { useMemo } from 'react';
import { PERIOD_TYPES, anchorOptions, defaultAnchor, inclusiveDayCount, periodRange } from '../lib/periods.js';
import { useApp } from '../context.js';
import Icon from './Icons.jsx';

const TYPE_LABEL = {
  week: 'One week',
  month: 'One month',
  quarter: 'One quarter',
  five: 'Last 5 months',
  year: 'One year',
  custom: 'Custom dates',
};

/** Compact period picker: one control sets every number on the page. */
export default function PeriodBar() {
  const { period, setPeriod, weeks } = useApp();
  const opts = period.type === 'custom' ? [] : anchorOptions(period.type, weeks);

  const changeType = (type) => setPeriod({ ...period, type, anchor: defaultAnchor(type, weeks) });

  const setCustom = (patch) => {
    const cur = typeof period.anchor === 'object' && period.anchor ? period.anchor : defaultAnchor('custom', weeks);
    let start = patch.start ?? cur.start;
    let end = patch.end ?? cur.end;
    if (start && end && end < start) {
      // Keep range valid if user picks an end before start (or vice versa).
      if (patch.start && !patch.end) end = start;
      else if (patch.end && !patch.start) start = end;
      else { const t = start; start = end; end = t; }
    }
    setPeriod({ ...period, type: 'custom', anchor: { start, end } });
  };

  const resetCustom = () => {
    setPeriod({ ...period, type: 'custom', anchor: defaultAnchor('custom', weeks) });
  };

  const customDays = useMemo(() => {
    if (period.type !== 'custom' || !period.anchor?.start || !period.anchor?.end) return null;
    return inclusiveDayCount(period.anchor.start, period.anchor.end);
  }, [period]);

  const customLabel = useMemo(() => {
    if (period.type !== 'custom' || !period.anchor?.start || !period.anchor?.end) return null;
    return periodRange('custom', period.anchor).label;
  }, [period]);

  return (
    <div className="period-bar" aria-label="Choose which dates to show">
      <div className="period-bar-label">
        <Icon name="calendar" size={15} stroke={1.9} />
        <span>Showing data for</span>
      </div>
      <div className="period-bar-controls">
        <select
          className="select period-type"
          aria-label="How to group dates"
          value={period.type}
          onChange={(e) => changeType(e.target.value)}
        >
          {PERIOD_TYPES.map((p) => <option key={p.id} value={p.id}>{TYPE_LABEL[p.id]}</option>)}
        </select>

        {period.type === 'custom' ? (
          <div className="period-custom">
            <label className="period-date-field">
              <span className="period-date-label">From</span>
              <input
                className="input"
                type="date"
                aria-label="Start date"
                value={period.anchor?.start || ''}
                onChange={(e) => e.target.value && setCustom({ start: e.target.value })}
              />
            </label>
            <span className="period-to">to</span>
            <label className="period-date-field">
              <span className="period-date-label">To</span>
              <input
                className="input"
                type="date"
                aria-label="End date"
                value={period.anchor?.end || ''}
                onChange={(e) => e.target.value && setCustom({ end: e.target.value })}
              />
            </label>
            {customDays != null && (
              <span className="period-days" title={customLabel || undefined}>
                {customDays} day{customDays === 1 ? '' : 's'}
              </span>
            )}
            <button type="button" className="btn ghost sm" onClick={resetCustom} title="Reset to the default custom window (about the last 4 weeks)">
              Reset
            </button>
          </div>
        ) : (
          <select
            className="select period-anchor"
            aria-label="Which period"
            value={period.anchor || ''}
            onChange={(e) => setPeriod({ ...period, anchor: e.target.value })}
          >
            {opts.length === 0 && <option value="">No weeks saved yet</option>}
            {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}

        <label className="switch period-compare" title="Show ▲/▼ change versus the previous period of the same length">
          <input type="checkbox" checked={period.compare} onChange={(e) => setPeriod({ ...period, compare: e.target.checked })} />
          Compare previous
        </label>
      </div>
    </div>
  );
}

/** One small chip says whether the period is complete; details on hover. */
export function PeriodStatus({ range, comp, prevRange, prevComp, compare }) {
  if (!comp.expected) {
    return (
      <span className="status-chip" title={`${range.label}: no reporting weeks overlap this date range.`}>
        No weeks in range
      </span>
    );
  }
  const upToDate = comp.missing.length === 0 && comp.present > 0;
  const detail = [
    range.type === 'custom'
      ? `${range.label} — includes reporting weeks (Wed → Tue) that overlap these dates. Lead-level rows are cut to the exact From/To dates when available.`
      : `${range.label} — weeks (Wed → Tue) ending in this period.`,
    `${comp.present} of ${comp.expected} weeks available.`,
    comp.missing.length ? `Not run yet: ${comp.missing.join(', ')}.` : '',
    comp.notYet ? `${comp.notYet} week(s) have not ended yet.` : '',
    compare ? `Compared with ${prevRange.label}${prevComp.complete ? '' : ' (partial)'}.` : '',
  ].filter(Boolean).join('\n');
  if (comp.complete || upToDate) {
    const label = comp.complete
      ? `All ${comp.present} weeks available`
      : `${comp.present} week${comp.present === 1 ? '' : 's'} available`;
    return <span className="status-chip good" title={detail}><span className="dot" />{label}</span>;
  }
  return <span className="status-chip warn" title={detail}><span className="dot" />{comp.present} of {comp.expected} weeks available</span>;
}
