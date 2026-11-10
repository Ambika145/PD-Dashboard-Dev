import React, { useMemo, useRef, useState } from 'react';
import { useApp } from '../context.js';
import Chart, { chartTokens } from '../components/Chart.jsx';
import Icon from '../components/Icons.jsx';
import ReportTable from '../components/ReportTable.jsx';
import { Tag, ConfirmButton, Callout, Empty, Kpi, Card, fmt, fmtPct } from '../components/ui.jsx';
import { weekToReport, formatDay } from '../lib/junkCore.js';
import { exportWeekWorkbook, downloadBlob } from '../lib/files.js';
import { historyFile, FILE_TAG } from '../lib/store.js';
import { canMutateHistory } from '../lib/access.js';
import { trendOption } from '../lib/charts.js';

export default function History() {
  const { weeks, allWeeks, removeWeek, settings, clients, activeClient, importHistory, toast, user, resolvedTheme } = useApp();
  const [open, setOpen] = useState(null);
  const fileRef = useRef(null);
  const list = [...weeks].sort((a, b) => b.id.localeCompare(a.id));
  const th = settings.threshold / 100;
  const canMutate = canMutateHistory(user);
  const t = useMemo(() => chartTokens(), [resolvedTheme]);

  const approved = weeks.filter((w) => w.source === 'approved').length;
  const imported = weeks.filter((w) => w.source === 'imported').length;
  const totalLeads = weeks.reduce((s, w) => s + (w.totals?.total || 0), 0);
  const totalJunk = weeks.reduce((s, w) => s + (w.totals?.junk || 0), 0);
  const overGoal = weeks.filter((w) => w.totals?.total && w.totals.junk / w.totals.total >= th).length;
  const chron = [...weeks].sort((a, b) => a.id.localeCompare(b.id)).slice(-12);
  const series = chron.map((w) => ({
    id: w.id,
    label: w.label,
    short: w.label.split(' - ')[0],
    total: w.totals.total,
    junk: w.totals.junk,
    junkPct: w.totals.total ? w.totals.junk / w.totals.total : 0,
    source: w.source,
  }));

  const exportFile = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const name = (activeClient?.name || 'Junk').replace(/[^\w\- ]+/g, '').trim() || 'Junk';
    downloadBlob(historyFile(settings, allWeeks || weeks, clients), `${name} Junk history ${stamp}.json`, 'application/json');
    toast('History file downloaded (includes clients). Put it in the team SharePoint folder so others can import it.');
  };

  const importFile = async (file) => {
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== FILE_TAG || !Array.isArray(data.weeks)) throw new Error('This is not a Junk Analysis history file.');
      const res = await importHistory(data);
      const clientMsg = res.clientsAdded || res.clientsUpdated
        ? ` · clients +${res.clientsAdded || 0} / updated ${res.clientsUpdated || 0}`
        : '';
      toast(`History imported: ${res.added} new week(s), ${res.replaced} updated, ${res.kept} unchanged${clientMsg}.`);
    } catch (e) {
      toast(`Import failed: ${e.message}`, 'err');
    }
  };

  return (
    <>
      {list.length > 0 && (
        <>
          <div className="grid cols-4">
            <Kpi icon="calendar" iconTone="blue" label="Saved weeks" value={fmt(weeks.length)} sub={`${fmt(approved)} approved · ${fmt(imported)} imported`} />
            <Kpi icon="users" iconTone="teal" label="Leads stored" value={fmt(totalLeads)} sub={`${fmt(totalJunk)} junk across history`} />
            <Kpi icon="percent" iconTone={totalLeads && totalJunk / totalLeads >= th ? 'red' : 'amber'} label="All-time junk" value={fmtPct(totalLeads ? totalJunk / totalLeads : 0, 1)} sub={`Goal ≤ ${settings.threshold}%`} />
            <Kpi icon="alert" iconTone="violet" label="Weeks above goal" value={fmt(overGoal)} sub={`of ${fmt(weeks.length)} weeks`} />
          </div>
          {series.length > 1 && (
            <Card icon="activity" iconTone="blue" title="Junk rate across saved weeks" sub="Last 12 weeks in chronological order (approved + imported).">
              <Chart height={220} label="History junk trend" option={trendOption(t, series, [{ value: th, label: `Goal ${settings.threshold}%`, color: t.muted }])} />
            </Card>
          )}
        </>
      )}

      <section className="card">
        <div className="card-head">
          <div className="card-title-row">
            <span className="card-icon" aria-hidden="true"><Icon name="history" size={16} /></span>
            <div>
              <h3 className="card-title">Saved weeks{activeClient ? ` · ${activeClient.name}` : ''}</h3>
              <p className="card-sub">{approved} approved · {imported} from the past report for this client. Export includes all clients and weeks for SharePoint sharing.</p>
            </div>
          </div>
          <div className="card-actions">
            {canMutate && (
              <button className="btn ghost sm" type="button" onClick={() => fileRef.current?.click()}><Icon name="upload" size={14} />Import</button>
            )}
            <button className="btn ghost sm" type="button" onClick={exportFile}><Icon name="share" size={14} />Export</button>
            {canMutate && (
              <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { if (e.target.files[0]) importFile(e.target.files[0]); e.target.value = ''; }} />
            )}
          </div>
        </div>
        {!list.length ? <Empty icon="history" title="No weeks yet">Approve a week in Weekly run, or import a history file.</Empty> : (
          <div className="tw">
            <table className="tbl">
              <thead><tr><th className="l">Week</th><th className="l">Source</th><th>Leads</th><th>Junk</th><th>Junk %</th><th>Started</th><th>Submitted</th><th>Enrolled</th><th className="l">Approved</th><th /></tr></thead>
              <tbody>
                {list.map((w) => {
                  const pctV = w.totals.total ? w.totals.junk / w.totals.total : 0;
                  return (
                    <React.Fragment key={w.id}>
                      <tr>
                        <td className="l"><b>{w.label}</b></td>
                        <td className="l">{w.source === 'approved' ? <Tag tone="good">Approved</Tag> : <Tag tone="neutral" icon={false}>Past report</Tag>}</td>
                        <td>{fmt(w.totals.total)}</td><td>{fmt(w.totals.junk)}</td>
                        <td className={pctV >= th ? 'hi' : ''}>{fmtPct(pctV)}</td>
                        <td>{fmt(w.totals.started)}</td><td>{fmt(w.totals.submitted)}</td><td>{fmt(w.totals.enrolled)}</td>
                        <td className="l muted">{w.approvedAt ? formatDay(new Date(w.approvedAt)) : '—'}</td>
                        <td>
                          <span className="btns" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                            {w.programmes?.length > 0 && <>
                              <button className="btn ghost sm" type="button" onClick={() => setOpen(open === w.id ? null : w.id)}>{open === w.id ? 'Hide' : 'Details'}</button>
                              <button className="btn ghost sm" type="button" onClick={async () => { try { await exportWeekWorkbook(weekToReport(w), w.label, settings.threshold, { files: w.files, approvedAt: w.approvedAt }); } catch (e) { toast(`Download failed: ${e.message}`, 'err'); } }}><Icon name="download" size={13} />Excel</button>
                            </>}
                            {canMutate && (
                              <ConfirmButton label={<Icon name="trash" size={14} />} className="btn quiet sm" confirmText={`Delete ${w.label}?`} onConfirm={async () => { await removeWeek(w.id); toast(`${w.label} deleted.`); }} />
                            )}
                          </span>
                        </td>
                      </tr>
                      {open === w.id && (
                        <tr><td colSpan={10} className="l" style={{ background: 'var(--sunken)', padding: 16, whiteSpace: 'normal' }}>
                          <div style={{ display: 'grid', gap: 12 }}>
                            <span className="small muted">{w.source === 'imported' ? 'Imported from' : 'Files'}: {w.files.join(' · ')}</span>
                            <ReportTable report={weekToReport(w)} kind="programme" threshold={settings.threshold} untouchedThreshold={settings.untouchedThreshold ?? 30} label={w.label} />
                            {w.checks.filter((c) => c.level === 'warn').map((c, i) => <Callout key={i} tone="warn"><b>{c.title}</b> — {c.detail}</Callout>)}
                          </div>
                        </td></tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
