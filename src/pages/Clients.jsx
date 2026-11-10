import React, { useMemo, useState } from 'react';
import { useApp } from '../context.js';
import Icon from '../components/Icons.jsx';
import { DataTable, Tag, ConfirmButton, Empty, Callout, fmtPct } from '../components/ui.jsx';
import { blankClient, normalizeClient, weeksForClient, clientOverallJunkPct } from '../lib/clients.js';
import { canManageClients } from '../lib/access.js';

const EMPTY_FORM = blankClient();

export default function Clients() {
  const {
    clients, activeClientId, setActiveClient, saveClient, removeClient,
    allWeeks, legacyClientId, toast, goTo, user,
  } = useApp();
  // Every client's weeks (the app's `weeks` holds only the active client's).
  const weeks = allWeeks;
  const [qStatus, setQStatus] = useState('all');
  const [modal, setModal] = useState(null); // null | { mode: 'add'|'edit'|'view', client? }
  const [form, setForm] = useState(EMPTY_FORM);
  const [err, setErr] = useState('');

  const rows = useMemo(() => clients.map((c) => {
    const cWeeks = weeksForClient(weeks, c.id, legacyClientId);
    const live = clientOverallJunkPct(cWeeks);
    return {
      ...c,
      weekCount: cWeeks.length,
      liveJunkPct: live,
      overGoal: live !== null && live >= (c.junkPct / 100),
    };
  }), [clients, weeks, legacyClientId]);

  const filtered = useMemo(() => {
    if (qStatus === 'all') return rows;
    return rows.filter((r) => r.status === qStatus);
  }, [rows, qStatus]);

  if (!canManageClients(user)) {
    return (
      <div className="card">
        <Empty icon="clients" title="Super Admin only">
          Only Super Admin can add, edit, or switch clients.
        </Empty>
      </div>
    );
  }

  const openAdd = () => { setForm(EMPTY_FORM); setErr(''); setModal({ mode: 'add' }); };
  const openEdit = (c) => {
    setForm({
      name: c.name, websiteOrId: c.websiteOrId, product: c.product,
      responsiblePerson: c.responsiblePerson, junkPct: c.junkPct, status: c.status,
    });
    setErr('');
    setModal({ mode: 'edit', client: c });
  };
  const openView = (c) => { setModal({ mode: 'view', client: c }); setErr(''); };

  const submit = async () => {
    const res = normalizeClient(form, modal.mode === 'edit' ? { id: modal.client.id, createdAt: modal.client.createdAt } : {});
    if (!res.ok) { setErr(res.error); return; }
    const dup = clients.find((c) => c.id !== res.client.id && c.name.toLowerCase() === res.client.name.toLowerCase());
    if (dup) { setErr('A client with this name already exists.'); return; }
    await saveClient(res.client);
    toast(modal.mode === 'add' ? `Client “${res.client.name}” added.` : `Client “${res.client.name}” updated.`);
    setModal(null);
  };

  const onDelete = async (c) => {
    if (clients.length <= 1) {
      toast('Keep at least one client so weekly analysis has a home.', 'err');
      return;
    }
    const saved = weeksForClient(weeks, c.id, legacyClientId).length;
    if (saved) {
      toast(`${c.name} has ${saved} saved week(s). Use this client, delete its weeks in History, then delete the client, so no data is left hidden.`, 'err');
      return;
    }
    await removeClient(c.id);
    toast(`Client “${c.name}” removed.`);
    setModal(null);
  };

  return (
    <>
      <Callout tone="info">
        Each client has its own weeks and junk % goal. Select a client (Use) to analyse and run weekly reports for them. Existing JGU history stays under the JGU client.
      </Callout>

      <section className="card">
        <div className="card-head">
          <div className="card-title-row">
            <span className="card-icon blue" aria-hidden="true"><Icon name="clients" size={16} /></span>
            <div>
              <h3 className="card-title">Clients</h3>
              <p className="card-sub">{clients.length} client{clients.length === 1 ? '' : 's'} · active: {clients.find((c) => c.id === activeClientId)?.name || '—'}</p>
            </div>
          </div>
          <div className="card-actions">
            <label className="field-inline">
              <span className="field-inline-label">Status</span>
              <select className="select" value={qStatus} onChange={(e) => setQStatus(e.target.value)} aria-label="Filter by status">
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <button type="button" className="btn" onClick={openAdd}><Icon name="plus" size={15} />Add Client</button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <Empty icon="clients" title="No clients yet" action={<button type="button" className="btn" onClick={openAdd}>Add Client</button>}>
            Add your first client to start managing junk analysis per account.
          </Empty>
        ) : (
          <DataTable
            rows={filtered}
            search="Search name, website, product or person"
            searchKeys={['name', 'websiteOrId', 'product', 'responsiblePerson']}
            initialSort={{ key: 'name', dir: 'asc' }}
            pageSize={15}
            empty="No clients match your search or filter."
            columns={[
              {
                key: 'name', label: 'Client name', align: 'left',
                render: (c) => (
                  <span className="client-name-cell">
                    <span className="client-avatar" aria-hidden="true">{(c.name || '?').slice(0, 1).toUpperCase()}</span>
                    <span>
                      <button type="button" className="link" onClick={() => openView(c)}>{c.name}</button>
                      {c.id === activeClientId && <Tag tone="info">In use</Tag>}
                    </span>
                  </span>
                ),
              },
              {
                key: 'websiteOrId', label: 'Website / Client ID', align: 'left', wrap: true,
                render: (c) => (/^https?:\/\//i.test(c.websiteOrId)
                  ? <a className="link" href={c.websiteOrId} target="_blank" rel="noreferrer">{c.websiteOrId}</a>
                  : <span className="mono">{c.websiteOrId}</span>),
              },
              { key: 'product', label: 'Product / Service', align: 'left', wrap: true, render: (c) => c.product || '—' },
              { key: 'responsiblePerson', label: 'Responsible person', align: 'left', render: (c) => c.responsiblePerson || '—' },
              {
                key: 'junkPct', label: 'Junk % goal',
                render: (c) => <span className="num">{c.junkPct}%</span>,
              },
              {
                key: 'liveJunkPct', label: 'Actual junk %',
                value: (c) => c.liveJunkPct ?? -1,
                render: (c) => (c.liveJunkPct === null
                  ? <span className="muted">No weeks</span>
                  : <Tag tone={c.overGoal ? 'warn' : 'good'} icon={false}>{fmtPct(c.liveJunkPct, 1)}</Tag>),
              },
              {
                key: 'status', label: 'Status',
                render: (c) => <Tag tone={c.status === 'active' ? 'good' : 'neutral'}>{c.status === 'active' ? 'Active' : 'Inactive'}</Tag>,
              },
              {
                key: 'weekCount', label: 'Weeks',
                render: (c) => <span className="num">{c.weekCount}</span>,
              },
              {
                key: 'actions', label: 'Actions', sort: false,
                render: (c) => (
                  <span className="btns client-actions" onClick={(e) => e.stopPropagation()}>
                    {c.id !== activeClientId && (
                      <button type="button" className="btn ghost sm" onClick={() => setActiveClient(c.id)} title="Analyse this client">Use</button>
                    )}
                    <button type="button" className="btn ghost sm" onClick={() => openView(c)} aria-label={`View ${c.name}`}>View</button>
                    <button type="button" className="btn ghost sm" onClick={() => openEdit(c)} aria-label={`Edit ${c.name}`}>Edit</button>
                    <ConfirmButton
                      label="Delete"
                      className="btn ghost sm"
                      confirmText={`Delete ${c.name}? This cannot be undone.`}
                      danger="Delete"
                      onConfirm={() => onDelete(c)}
                    />
                  </span>
                ),
              },
            ]}
          />
        )}
      </section>

      {modal && (
        <div className="modal-backdrop" role="presentation" onClick={() => setModal(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="client-modal-title" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 id="client-modal-title" className="modal-title">
                {modal.mode === 'add' ? 'Add client' : modal.mode === 'edit' ? 'Edit client' : 'Client details'}
              </h2>
              <button type="button" className="btn quiet sm" aria-label="Close" onClick={() => setModal(null)}><Icon name="x" size={18} /></button>
            </div>

            {modal.mode === 'view' ? (
              <div className="modal-body">
                <dl className="detail-list">
                  <div><dt>Client name</dt><dd>{modal.client.name}</dd></div>
                  <div><dt>Website / Client ID</dt><dd>{modal.client.websiteOrId}</dd></div>
                  <div><dt>Product / Service</dt><dd>{modal.client.product || '—'}</dd></div>
                  <div><dt>Responsible person</dt><dd>{modal.client.responsiblePerson || '—'}</dd></div>
                  <div><dt>Junk % goal</dt><dd>{modal.client.junkPct}%</dd></div>
                  <div><dt>Status</dt><dd><Tag tone={modal.client.status === 'active' ? 'good' : 'neutral'}>{modal.client.status === 'active' ? 'Active' : 'Inactive'}</Tag></dd></div>
                  <div><dt>Saved weeks</dt><dd>{weeksForClient(weeks, modal.client.id, legacyClientId).length}</dd></div>
                </dl>
                <div className="btns" style={{ marginTop: 16 }}>
                  {modal.client.id !== activeClientId && (
                    <button type="button" className="btn" onClick={() => { setActiveClient(modal.client.id); toast(`Now analysing ${modal.client.name}.`); setModal(null); goTo('overview'); }}>
                      Use this client
                    </button>
                  )}
                  <button type="button" className="btn ghost" onClick={() => openEdit(modal.client)}>Edit</button>
                  <button type="button" className="btn ghost" onClick={() => setModal(null)}>Close</button>
                </div>
              </div>
            ) : (
              <div className="modal-body">
                {err && <Callout tone="crit">{err}</Callout>}
                <div className="form-grid">
                  <label className="field">Client name <span className="req">*</span>
                    <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. JGU" autoFocus />
                  </label>
                  <label className="field">Website / Client ID <span className="req">*</span>
                    <input className="input" value={form.websiteOrId} onChange={(e) => setForm({ ...form, websiteOrId: e.target.value })} placeholder="https://… or unique ID" />
                  </label>
                  <label className="field">Product / Service
                    <input className="input" value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} placeholder="e.g. Online Ads" />
                  </label>
                  <label className="field">Responsible person
                    <input className="input" value={form.responsiblePerson} onChange={(e) => setForm({ ...form, responsiblePerson: e.target.value })} placeholder="Name of account owner" />
                  </label>
                  <label className="field">Junk % goal
                    <input className="input" type="number" min="0" max="100" value={form.junkPct} onChange={(e) => setForm({ ...form, junkPct: e.target.value })} />
                  </label>
                  <label className="field">Status
                    <select className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </label>
                </div>
                <div className="btns" style={{ marginTop: 18 }}>
                  <button type="button" className="btn" onClick={submit}>{modal.mode === 'add' ? 'Save client' : 'Save changes'}</button>
                  <button type="button" className="btn ghost" onClick={() => setModal(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
