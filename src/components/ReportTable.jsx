import React from 'react';
import { fmt, fmtPct } from './ui.jsx';
import { UNTOUCHED_KEYS, untouchedPct } from '../lib/junkCore.js';

/** The Weekly Performance (JGU) sheet as the team knows it: pink headers,
 *  highlighted Junk columns, pink Junk % above the threshold.
 *  Untouched stage cells turn red when that row’s Untouched share is at/above the alert %. */
export default function ReportTable({ report, kind, threshold, untouchedThreshold = 30, label }) {
  const th = threshold / 100;
  const uTh = untouchedThreshold / 100;
  const rows = kind === 'programme' ? report.rows : report.campaignRows;
  // Campaign-wise uses the same Application / Enrolment columns as programme-wise.
  const cols = report.stageCols.length + 7;
  const stageHi = (r, s) => UNTOUCHED_KEYS.includes(s.key) && r.total && untouchedPct(r.counts, r.total) >= uTh;
  const Row = ({ r, cls }) => (
    <tr className={cls}>
      <td>{r.label}</td>
      {report.stageCols.map((s) => (
        <td key={s.key} className={[s.junk ? 'junk' : '', stageHi(r, s) ? 'hi untouched-hi' : ''].filter(Boolean).join(' ') || undefined}>
          {r.counts.get(s.key) ? fmt(r.counts.get(s.key)) : ''}
        </td>
      ))}
      <td><b>{fmt(r.total)}</b></td>
      <td><b>{fmt(r.junk)}</b></td>
      <td className={r.total && r.junkPct >= th ? 'hi' : ''}>{fmtPct(r.junkPct)}</td>
      <td>{fmt(r.started ?? 0)}</td>
      <td>{fmt(r.submitted ?? 0)}</td>
      <td>{fmt(r.enrolled ?? 0)}</td>
    </tr>
  );
  return (
    <div className="tw max">
      <table className="tbl xl">
        <caption className="sr">{label} — {kind === 'programme' ? 'programme-wise' : 'campaign-wise'} report</caption>
        <thead>
          <tr><th colSpan={cols} style={{ background: 'var(--surface)', fontSize: 13, textAlign: 'left' }}>{label}</th></tr>
          <tr>
            <th>Row Labels</th>
            {report.stageCols.map((s) => (
              <th
                key={s.key}
                className={[s.junk ? 'junk' : '', UNTOUCHED_KEYS.includes(s.key) ? 'untouched-col' : ''].filter(Boolean).join(' ') || undefined}
                title={UNTOUCHED_KEYS.includes(s.key) ? `Highlighted in red when Untouched ≥ ${untouchedThreshold}% of the row` : undefined}
              >
                {s.label}
              </th>
            ))}
            <th>Grand Total</th><th>Junk</th><th>Junk %</th>
            <th>Application Started</th><th>Application Submitted</th><th>Enrollment Done</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => <Row key={`${r.type || 'p'}-${r.course || ''}-${r.label}-${i}`} r={r} cls={r.type || ''} />)}
          <Row r={report.totals} cls="total" />
        </tbody>
      </table>
    </div>
  );
}
