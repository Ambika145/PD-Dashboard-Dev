import React, { useEffect, useState } from 'react';
import { LEGACY_CLIENT_ID } from '../lib/clients.js';
import { useApp } from '../context.js';
import Icon from '../components/Icons.jsx';
import { ConfirmButton, Empty } from '../components/ui.jsx';
import { clean } from '../lib/junkCore.js';
import { defaultSettings } from '../lib/store.js';
import { SEED_WEEKS, SEED_SOURCE } from '../lib/seed.js';
import { canManageSettings } from '../lib/access.js';

export default function Settings() {
  const { settings, updateSettings, weeks, putWeek, toast, activeClient, saveClient, user } = useApp();
  const [form, setForm] = useState(null);
  useEffect(() => {
    setForm({
      excluded: settings.excluded.join('\n'),
      managed: settings.managed.join('\n'),
      knownStages: settings.knownStages.join('\n'),
      threshold: settings.threshold,
      untouchedThreshold: settings.untouchedThreshold ?? 30,
    });
  }, [settings]);

  if (!canManageSettings(user)) {
    return (
      <div className="card">
        <Empty icon="settings" title="Super Admin only">
          Only Super Admin can change exclusions, managed programmes, and goals.
        </Empty>
      </div>
    );
  }
  if (!form) return null;

  const lines = (s) => s.split('\n').map(clean).filter(Boolean);
  const save = async () => {
    const t = Number(form.threshold);
    const threshold = Number.isFinite(t) ? Math.min(100, Math.max(0, t)) : 50;
    const u = Number(form.untouchedThreshold);
    const untouchedThreshold = Number.isFinite(u) ? Math.min(100, Math.max(0, u)) : 30;
    await updateSettings({
      ...settings,
      excluded: lines(form.excluded),
      managed: lines(form.managed),
      knownStages: lines(form.knownStages),
      threshold,
      untouchedThreshold,
    });
    if (activeClient) {
      await saveClient({ ...activeClient, junkPct: threshold, updatedAt: new Date().toISOString() });
    }
    toast(activeClient ? `Settings saved for ${activeClient.name}.` : 'Settings saved.');
  };
  // Past-report weeks are JGU's (the original client); never copy them into another client.
  const isLegacy = activeClient?.id === LEGACY_CLIENT_ID;
  const missingSeeds = isLegacy ? SEED_WEEKS.filter((s) => !weeks.some((w) => w.id === s.id)) : [];

  return (
    <>
      <section className="card">
        <div className="card-head">
          <div className="card-title-row">
            <span className="card-icon" aria-hidden="true"><Icon name="settings" size={16} /></span>
            <div><h3 className="card-title">Programmes and stages</h3><p className="card-sub">One per line. These lists are also updated from the Programme review step of the weekly run.</p></div>
          </div>
        </div>
        <div className="settings-grid">
          <label className="field">Excluded programmes — not managed by the team (Doc Step 6)
            <textarea rows={9} value={form.excluded} onChange={(e) => setForm({ ...form, excluded: e.target.value })} />
          </label>
          <label className="field">Managed programmes — anything else is flagged as new
            <textarea rows={9} value={form.managed} onChange={(e) => setForm({ ...form, managed: e.target.value })} />
          </label>
          <label className="field">Known lead stages — a stage outside this list is flagged
            <textarea rows={9} value={form.knownStages} onChange={(e) => setForm({ ...form, knownStages: e.target.value })} />
          </label>
        </div>
        <div className="grid cols-2" style={{ marginTop: 16, maxWidth: 560 }}>
          <label className="field">
            Junk % goal{activeClient ? ` (${activeClient.name})` : ''} — highlight at or above (%)
            <input className="input" type="number" min="0" max="100" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} />
          </label>
          <label className="field">
            Untouched alert — red when Untouched share is at or above (%)
            <input className="input" type="number" min="0" max="100" value={form.untouchedThreshold} onChange={(e) => setForm({ ...form, untouchedThreshold: e.target.value })} />
          </label>
        </div>
        <div className="btns" style={{ marginTop: 16 }}>
          <button className="btn" type="button" onClick={save}>Save settings</button>
          <ConfirmButton
            label="Restore default lists"
            className="btn ghost"
            confirmText="Replace the programme/stage lists and threshold with the defaults?"
            danger="Restore"
            onConfirm={() => {
              updateSettings({
                ...defaultSettings(),
                columnMemory: settings.columnMemory,
                activeClientId: settings.activeClientId,
                threshold: settings.threshold,
              });
              toast('Default lists restored.');
            }}
          />
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div className="card-title-row">
            <span className="card-icon" aria-hidden="true"><Icon name="info" size={16} /></span>
            <div><h3 className="card-title">Fixed business rules</h3><p className="card-sub">From the Junk Analysis Process document. Shown for reference; they cannot be changed here.</p></div>
          </div>
        </div>
        <ul className="rules">
          <li><b>Week</b> runs Wednesday → Tuesday. A week counts in the period its Tuesday falls in.</li>
          <li><b>Junk</b> = FINANCIAL BARRIER + JUNK LEAD + NOT INTERESTED IN THE PROGRAM (Doc Step 8).</li>
          <li><b>Junk %</b> = Junk ÷ Grand Total of all lead stages. For a period: total Junk ÷ total leads.</li>
          <li><b>Qualified</b> = COUNSELLED + OL SENT + REGISTRATION FEE PAID + FOLLOW UP - POST COUNSELLED (not Total − Junk).</li>
          <li><b>DNP</b> = DID NOT PICK (DNP). Optional Meritto columns: <b>Lead Sub Stage</b> (DNP substages) and <b>Note Count / DNP History</b> (used as Call Attempts in the DNP Calling report: 1 Call, 2 Calls, 3 Calls, 4 Calls…).</li>
          <li><b>Untouched</b> = UNTOUCHED + REATTEMPT UNTOUCHED.</li>
          <li><b>Application Started</b> = Payment Pending; <b>Application Submitted</b> = Payment Approved; other payment statuses are listed, not counted (Doc Step 16).</li>
          <li><b>Enrollment Done</b> = enrolments with Enrolment Status = Yes in the week (Doc Step 13).</li>
          <li><b>Campaign-wise</b> uses the same lead, application, and enrolment columns as programme-wise. Map <b>Primary Registration Campaign</b> on all three Meritto exports so each campaign row shows Leads, Junk, App Started, App Submitted, and Enrolled.</li>
          <li>Courses are matched like a VLOOKUP after cleaning spaces and encoding; no match → 0.</li>
        </ul>
      </section>

      <section className="card">
        <div className="card-head">
          <div className="card-title-row">
            <span className="card-icon" aria-hidden="true"><Icon name="calendar" size={16} /></span>
            <div><h3 className="card-title">Past-report weeks</h3><p className="card-sub">{SEED_WEEKS.length} weeks ({SEED_WEEKS[0].label} to {SEED_WEEKS.at(-1).label}) imported from {SEED_SOURCE}, with programme rows and the stage split. In each, Junk = Junk Lead + Financial Barrier + Not Interested, as in the report.</p></div>
          </div>
        </div>
        {!isLegacy ? (
          <p className="small muted">These weeks belong to the original JGU client. Switch to it on the Clients page to restore any of them.</p>
        ) : missingSeeds.length ? (
          <button className="btn ghost" type="button" onClick={async () => { for (const s of missingSeeds) await putWeek({ ...s, clientId: LEGACY_CLIENT_ID }); toast(`${missingSeeds.length} past-report week(s) restored.`); }}>Restore {missingSeeds.length} deleted past-report week(s)</button>
        ) : <p className="small muted">All {SEED_WEEKS.length} are present (or replaced by approved weeks).</p>}
      </section>
    </>
  );
}
