import React, { useMemo, useState } from 'react';
import { useApp } from '../context.js';
import Icon from '../components/Icons.jsx';
import { Card, Callout, Empty, ConfirmButton, fmt } from '../components/ui.jsx';
import {
  ROLE_LABEL, ROLES, normalizeUser, setUserProgrammes, assignmentsForUser, canManageTeam,
} from '../lib/access.js';
import { keyOf, compareLabels } from '../lib/junkCore.js';
import { shortName } from '../lib/charts.js';

/** Show a few chips only — never a long continuous programme string. */
function ProgrammeChips({ items, limit = 3 }) {
  if (!items?.length) return <span className="muted">None yet</span>;
  const shown = items.slice(0, limit);
  const more = items.length - shown.length;
  return (
    <div className="prog-chips">
      {shown.map((a) => (
        <span key={a.programmeKey} className="prog-chip" title={a.programmeLabel}>
          {shortName(a.programmeLabel, 28)}
        </span>
      ))}
      {more > 0 && <span className="prog-chip more" title={items.map((a) => a.programmeLabel).join('\n')}>+{more} more</span>}
    </div>
  );
}

export default function Team() {
  const {
    user, users, saveUser, removeUser, assignments, saveAssignmentsList,
    settings, derived: d, toast,
  } = useApp();

  if (!canManageTeam(user)) {
    return (
      <div className="card">
        <Empty icon="users" title="Super Admin only">
          Only Super Admin can manage the team and assign programmes.
        </Empty>
      </div>
    );
  }

  const [editUser, setEditUser] = useState(null);
  const [form, setForm] = useState({ name: '', role: ROLES.ADMIN, pin: '1234', active: true });
  const [assignFor, setAssignFor] = useState(null);
  const [picked, setPicked] = useState([]);
  const [assignQ, setAssignQ] = useState('');
  const [assignFilter, setAssignFilter] = useState('all'); // all | free | mine | others

  const programmeCatalog = useMemo(() => {
    const map = new Map();
    for (const label of settings.managed || []) map.set(keyOf(label), label);
    for (const p of d?.agg?.programmes || []) map.set(p.key, p.label);
    return [...map.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => compareLabels(a.label, b.label));
  }, [settings.managed, d]);

  const admins = useMemo(
    () => users.filter((u) => u.role === ROLES.ADMIN).sort((a, b) => a.name.localeCompare(b.name)),
    [users],
  );
  const supers = useMemo(
    () => users.filter((u) => u.role === ROLES.SUPERADMIN).sort((a, b) => a.name.localeCompare(b.name)),
    [users],
  );

  const ownerOf = (programmeKey) => {
    const a = assignments.find((x) => x.programmeKey === programmeKey);
    if (!a) return null;
    return users.find((u) => u.id === a.userId) || null;
  };

  const unassignedCount = programmeCatalog.filter((p) => !ownerOf(p.key)).length;

  const openNew = () => {
    setForm({ name: '', role: ROLES.ADMIN, pin: '1234', active: true });
    setEditUser('new');
  };
  const openEdit = (u) => {
    setForm({ name: u.name, role: u.role, pin: u.pin, active: u.active !== false });
    setEditUser(u);
  };
  const save = async () => {
    const base = editUser === 'new' ? {} : { id: editUser.id, createdAt: editUser.createdAt };
    const res = normalizeUser(form, base);
    if (!res.ok) { toast(res.error, 'err'); return; }
    if (editUser !== 'new' && editUser.role === ROLES.SUPERADMIN && res.user.role !== ROLES.SUPERADMIN) {
      const others = users.filter((u) => u.id !== editUser.id && u.role === ROLES.SUPERADMIN && u.active !== false);
      if (!others.length) { toast('Keep at least one Super Admin.', 'err'); return; }
    }
    await saveUser(res.user);
    toast(editUser === 'new' ? `${res.user.name} added.` : `${res.user.name} updated.`);
    setEditUser(null);
  };

  const openAssign = (u) => {
    setAssignFor(u);
    setPicked(assignmentsForUser(assignments, u.id).map((a) => a.programmeKey));
    setAssignQ('');
    setAssignFilter('all');
  };

  const toggleProg = (key) => {
    setPicked((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  };

  const saveAssign = async () => {
    const programmes = programmeCatalog.filter((p) => picked.includes(p.key));
    const next = setUserProgrammes(assignments, {
      userId: assignFor.id,
      programmes,
      assignedBy: user.id,
    });
    await saveAssignmentsList(next);
    toast(`${assignFor.name}: ${programmes.length} programme${programmes.length === 1 ? '' : 's'} assigned.`);
    setAssignFor(null);
  };

  const filteredCatalog = useMemo(() => {
    const q = assignQ.trim().toLowerCase();
    return programmeCatalog.filter((p) => {
      if (q && !p.label.toLowerCase().includes(q)) return false;
      const owner = ownerOf(p.key);
      const mine = picked.includes(p.key);
      if (assignFilter === 'free') return !owner || mine;
      if (assignFilter === 'mine') return mine;
      if (assignFilter === 'others') return owner && owner.name !== assignFor?.name && !mine;
      return true;
    });
  }, [programmeCatalog, assignQ, assignFilter, picked, assignFor, assignments, users]);

  return (
    <>
      <Callout tone="info">
        <b>How Team works:</b> add Admins → click <b>Assign programmes</b> → tick only that person’s programmes.
        Each programme belongs to <b>one</b> Admin. Their Overview then shows only those programmes — not a long shared list.
      </Callout>

      <div className="team-summary">
        <div className="team-stat">
          <span className="team-stat-label">Admins</span>
          <b>{fmt(admins.length)}</b>
        </div>
        <div className="team-stat">
          <span className="team-stat-label">Programmes in catalog</span>
          <b>{fmt(programmeCatalog.length)}</b>
        </div>
        <div className="team-stat">
          <span className="team-stat-label">Assigned</span>
          <b>{fmt(assignments.length)}</b>
        </div>
        <div className={`team-stat ${unassignedCount ? 'warn' : 'good'}`}>
          <span className="team-stat-label">Still unassigned</span>
          <b>{fmt(unassignedCount)}</b>
        </div>
      </div>

      <Card
        icon="users"
        iconTone="blue"
        title="1. Team members"
        sub="Super Admin sees everything. Admins only see programmes you assign to them."
        actions={<button type="button" className="btn sm" onClick={openNew}><Icon name="plus" size={14} />Add person</button>}
      >
        <div className="team-people">
          {supers.map((u) => (
            <div key={u.id} className="team-person-card super">
              <span className="login-avatar super">{u.name.slice(0, 1)}</span>
              <div className="team-person-main">
                <div className="team-person-top">
                  <b>{u.name}</b>
                  <span className="role-badge super">{ROLE_LABEL[u.role]}</span>
                </div>
                <p className="team-person-note">Sees all programmes · manages assignments</p>
              </div>
              <div className="team-person-actions">
                <button type="button" className="btn ghost sm" onClick={() => openEdit(u)}>Edit</button>
              </div>
            </div>
          ))}

          {admins.map((u) => {
            const mine = assignmentsForUser(assignments, u.id);
            return (
              <div key={u.id} className={`team-person-card ${u.active === false ? 'inactive' : ''}`}>
                <span className="login-avatar">{u.name.slice(0, 1)}</span>
                <div className="team-person-main">
                  <div className="team-person-top">
                    <b>{u.name}</b>
                    <span className="role-badge">{ROLE_LABEL[u.role]}</span>
                    {u.active === false && <span className="role-badge muted">Inactive</span>}
                  </div>
                  <div className="team-person-assign-row">
                    {mine.length ? (
                      <>
                        <span className="team-count">{mine.length} programme{mine.length === 1 ? '' : 's'} assigned</span>
                        <ProgrammeChips items={mine} limit={3} />
                      </>
                    ) : (
                      <span className="team-count muted">No programmes assigned yet</span>
                    )}
                  </div>
                </div>
                <div className="team-person-actions">
                  <button type="button" className="btn sm" onClick={() => openAssign(u)}>
                    {mine.length ? 'Edit programmes' : 'Assign programmes'}
                  </button>
                  <button type="button" className="btn ghost sm" onClick={() => openEdit(u)}>Edit</button>
                  {u.id !== user.id && (
                    <ConfirmButton
                      label="Remove"
                      className="btn ghost sm"
                      confirmText={`Remove ${u.name} from the team? Their programme assignments will be cleared.`}
                      danger="Remove"
                      onConfirm={async () => {
                        await removeUser(u.id);
                        toast(`${u.name} removed.`);
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}

          {!admins.length && (
            <Empty title="No Admins yet" action={<button type="button" className="btn" onClick={openNew}>Add Admin</button>}>
              Add people like Ravi, Jitendar or Manjusha, then assign programmes to each one.
            </Empty>
          )}
        </div>
      </Card>

      <Card
        icon="programmes"
        iconTone="violet"
        title="2. Who owns which programme?"
        sub="Ownership map for accountability. Every Admin can still analyse all programmes on Overview / Programmes."
      >
        {!programmeCatalog.length ? (
          <Empty title="No programmes in the catalog yet">
            Approve a weekly run, or add managed programmes in Settings.
          </Empty>
        ) : !admins.length ? (
          <Empty title="Add an Admin first">Then assign programmes to that person.</Empty>
        ) : (
          <>
            <div className="owner-unassigned-banner">
              <div>
                <b>{fmt(unassignedCount)} unassigned</b>
                <span className="muted"> of {fmt(programmeCatalog.length)} programmes — still visible to everyone for analysis; assign an owner for accountability</span>
              </div>
              {!!admins.length && (
                <button type="button" className="btn ghost sm" onClick={() => openAssign(admins[0])}>
                  Start assigning
                </button>
              )}
            </div>
            <div className="owner-board">
              {admins.map((u) => {
                const mine = assignmentsForUser(assignments, u.id);
                return (
                  <div key={u.id} className="owner-col">
                    <h4>
                      {u.name} <em>{mine.length}</em>
                      <button type="button" className="btn ghost sm" onClick={() => openAssign(u)}>
                        {mine.length ? 'Edit' : 'Assign'}
                      </button>
                    </h4>
                    {mine.length ? (
                      <ul>
                        {mine.slice(0, 8).map((a) => (
                          <li key={a.programmeKey} title={a.programmeLabel}>{shortName(a.programmeLabel, 48)}</li>
                        ))}
                        {mine.length > 8 && (
                          <li className="muted">+{mine.length - 8} more — open Edit to see all</li>
                        )}
                      </ul>
                    ) : (
                      <ul>
                        <li className="muted">No programmes yet</li>
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      {editUser && (
        <div className="modal-backdrop" role="presentation" onClick={() => setEditUser(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>{editUser === 'new' ? 'Add team member' : `Edit ${editUser.name}`}</h2>
            <div className="grid cols-2" style={{ marginTop: 12 }}>
              <label className="field">Name
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>
              <label className="field">Role
                <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value={ROLES.ADMIN}>Admin</option>
                  <option value={ROLES.SUPERADMIN}>Super Admin</option>
                </select>
              </label>
              <label className="field">PIN
                <input className="input" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} />
              </label>
              <label className="field">Status
                <select className="select" value={form.active ? 'active' : 'inactive'} onChange={(e) => setForm({ ...form, active: e.target.value === 'active' })}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
            </div>
            <div className="btns" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
              <button type="button" className="btn ghost" onClick={() => setEditUser(null)}>Cancel</button>
              <button type="button" className="btn" onClick={save}>Save</button>
            </div>
          </div>
        </div>
      )}

      {assignFor && (
        <div className="modal-backdrop" role="presentation" onClick={() => setAssignFor(null)}>
          <div className="modal wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Assign programmes to {assignFor.name}</h2>
            <p className="muted small" style={{ marginTop: 6 }}>
              Tick only this person’s programmes. If a programme already belongs to someone else, assigning it here moves it to {assignFor.name}.
            </p>

            <div className="assign-toolbar">
              <label className="search">
                <Icon name="search" size={14} />
                <input
                  aria-label="Search programmes"
                  placeholder="Search programme name"
                  value={assignQ}
                  onChange={(e) => setAssignQ(e.target.value)}
                />
              </label>
              <div className="seg" role="group" aria-label="Filter programmes">
                {[
                  ['all', 'All'],
                  ['mine', `Selected (${picked.length})`],
                  ['free', 'Available'],
                  ['others', 'Others'],
                ].map(([id, label]) => (
                  <button key={id} type="button" className={assignFilter === id ? 'on' : ''} onClick={() => setAssignFilter(id)}>{label}</button>
                ))}
              </div>
            </div>

            {!programmeCatalog.length ? (
              <Empty title="No programmes yet">Approve a weekly run or add managed programmes in Settings.</Empty>
            ) : filteredCatalog.length === 0 ? (
              <Empty title="No matches">Try another search or filter.</Empty>
            ) : (
              <div className="assign-grid">
                {filteredCatalog.map((p) => {
                  const owner = ownerOf(p.key);
                  const mine = picked.includes(p.key);
                  const taken = owner && owner.name !== assignFor.name && !mine;
                  return (
                    <label key={p.key} className={`assign-item ${mine ? 'on' : ''} ${taken ? 'taken' : ''}`}>
                      <input type="checkbox" checked={mine} onChange={() => toggleProg(p.key)} />
                      <span>
                        <b title={p.label}>{shortName(p.label, 52)}</b>
                        {taken && <em>Owned by {owner.name}</em>}
                        {mine && owner && owner.name !== assignFor.name && <em>Will move from {owner.name}</em>}
                        {mine && (!owner || owner.name === assignFor.name) && <em>Selected for {assignFor.name}</em>}
                        {!mine && !owner && <em>Unassigned</em>}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="btns" style={{ marginTop: 16, justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="small muted"><b>{picked.length}</b> selected for {assignFor.name}</span>
              <div className="btns">
                <button type="button" className="btn ghost" onClick={() => setAssignFor(null)}>Cancel</button>
                <button type="button" className="btn" onClick={saveAssign}>Save for {assignFor.name}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
