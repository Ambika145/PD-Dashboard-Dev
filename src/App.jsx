import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppContext } from './context.js';
import Icon from './components/Icons.jsx';
import PeriodBar, { PeriodStatus } from './components/PeriodBar.jsx';
import {
  loadAll, saveSettings, saveClients, saveWeek, deleteWeek as dbDeleteWeek,
  mergeHistory, mergeClients, defaultSettings, saveUsers, saveAssignments,
} from './lib/store.js';
import { periodRange, previousRange, weeksIn, completeness, aggregate, defaultAnchor, prepareWeeksForPeriod, anchorOptions } from './lib/periods.js';
import { defaultWeek } from './lib/junkCore.js';
import { weeksForClient, weekBelongsToClient, weekKey } from './lib/clients.js';
import {
  publicUser, programmeKeysForUser, canAccess, allowedViews,
  isSuperAdmin, ROLE_LABEL,
} from './lib/access.js';
import Overview from './pages/Overview.jsx';
import WeeklyRun from './pages/WeeklyRun.jsx';
import Programmes from './pages/Programmes.jsx';
import Campaigns from './pages/Campaigns.jsx';
import Records from './pages/Records.jsx';
import DnpReport from './pages/DnpReport.jsx';
import { LeadsDetail, JunkDetail, QualifiedDetail, UntouchedDetail, AppsDetail } from './pages/Details.jsx';
import History from './pages/History.jsx';
import Settings from './pages/Settings.jsx';
import Clients from './pages/Clients.jsx';
import Team from './pages/Team.jsx';
import Login from './pages/Login.jsx';
import logoWhite from './assets/purview-logo-white.svg';
import logoIcon from './assets/purview-icon.png';

const MAIN_NAV = [
  { id: 'overview', label: 'Overview', icon: 'overview', blurb: 'Junk rate, trends, and top programmes for the selected client and period.' },
  { id: 'programmes', label: 'Programmes', icon: 'programmes', blurb: 'Drill into one programme: stages, weekly trend, and campaigns.' },
  { id: 'campaigns', label: 'Campaigns', icon: 'campaigns', blurb: 'Compare junk by Primary Registration Campaign.' },
  { id: 'records', label: 'Records', icon: 'records', blurb: 'Search and export individual lead rows.' },
  { id: 'run', label: 'Weekly run', icon: 'run', blurb: 'Upload this week’s files, review junk, and approve the week for the active client.' },
];
// Opened from the Overview cards; not in the menu, so Overview stays highlighted.
const DETAIL_NAV = [
  { id: 'leads', label: 'Total Leads', icon: 'users', blurb: 'Every lead in the period: by pipeline bucket, programme and week.' },
  { id: 'junk', label: 'Junk Leads', icon: 'alert', blurb: 'Junk only: rate vs goal, the three junk reasons, by programme and by week.' },
  { id: 'qualified', label: 'Qualified Leads', icon: 'checkCircle', blurb: 'Counselled, OL Sent, Fee Paid and Follow-up: by programme and by week.' },
  { id: 'dnp', label: 'DNP Calling', icon: 'phoneMissed', blurb: 'Did Not Pick leads by call attempts (Note Count), overall and programme-wise.' },
  { id: 'untouched', label: 'Untouched', icon: 'activity', blurb: 'Leads nobody has worked yet: against the alert, by programme and by week.' },
  { id: 'apps', label: 'Applications & enrolment', icon: 'file', blurb: 'App started, App submitted and Enrolment: funnel, by programme and by week.' },
];
const DETAIL = new Set(DETAIL_NAV.map((n) => n.id));
const BOTTOM_NAV = [
  { id: 'history', label: 'History', icon: 'history', blurb: 'Saved weeks for the active client. Super Admin can import or delete; everyone can export.' },
  { id: 'clients', label: 'Clients', icon: 'clients', blurb: 'Super Admin: add and manage clients. Switch who you are analysing.' },
  { id: 'team', label: 'Team', icon: 'users', blurb: 'Super Admin: add Admins and assign programmes to each person.' },
  { id: 'settings', label: 'Settings', icon: 'settings', blurb: 'Super Admin: excluded programmes, managed list, and junk % goals.' },
];
const ALL = [...MAIN_NAV, ...DETAIL_NAV, ...BOTTOM_NAV];
const ANALYSE = new Set(['overview', 'programmes', 'campaigns', 'records', ...DETAIL]);

const readLocal = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
const writeLocal = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } };
const readSession = () => {
  try {
    const raw = sessionStorage.getItem('pdJunk.session') || localStorage.getItem('pdJunk.session');
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
};
const writeSession = (user) => {
  const payload = user ? JSON.stringify({ userId: user.id, at: Date.now() }) : '';
  try {
    if (user) {
      sessionStorage.setItem('pdJunk.session', payload);
      localStorage.setItem('pdJunk.session', payload);
    } else {
      sessionStorage.removeItem('pdJunk.session');
      localStorage.removeItem('pdJunk.session');
    }
  } catch (e) { /* blocked */ }
};

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [persistent, setPersistent] = useState(true);
  const [settings, setSettingsState] = useState(defaultSettings());
  const [weeks, setWeeks] = useState([]);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [sessionUser, setSessionUser] = useState(null);
  const [view, setView] = useState(() => {
    const h = window.location.hash.replace('#', '');
    return ALL.some((n) => n.id === h) ? h : 'overview';
  });
  const [theme, setTheme] = useState(() => readLocal('pdJunk.theme', 'system'));
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [period, setPeriod] = useState({ type: 'month', anchor: null, compare: true });
  const [drill, setDrill] = useState({});
  const [toasts, setToasts] = useState([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [run, setRun] = useState(() => ({ week: defaultWeek(), files: { leads: null, enrol: null, apps: null }, step: 1, approved: null }));

  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
  if (document.documentElement.getAttribute('data-theme') !== resolvedTheme) document.documentElement.setAttribute('data-theme', resolvedTheme);

  const activeClientId = settings.activeClientId;
  const activeClient = clients.find((c) => c.id === activeClientId) || clients[0] || null;
  const legacyClientId = clients.find((c) => c.id === 'client_jgu_legacy')?.id || null;
  const clientWeeks = useMemo(
    () => weeksForClient(weeks, activeClient?.id, legacyClientId),
    [weeks, activeClient?.id, legacyClientId],
  );

  const user = useMemo(() => {
    if (!sessionUser) return null;
    const full = users.find((u) => u.id === sessionUser.id && u.active !== false);
    return full ? publicUser(full) : null;
  }, [sessionUser, users]);

  const assignedKeys = useMemo(() => programmeKeysForUser(assignments, user), [assignments, user]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const fn = (e) => setSystemDark(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  useEffect(() => { writeLocal('pdJunk.theme', theme); }, [theme]);

  useEffect(() => {
    loadAll().then(({ settings: s, weeks: w, clients: c, users: u, assignments: a, persistent: p }) => {
      setSettingsState(s);
      setWeeks(w);
      setClients(c);
      setUsers(u || []);
      setAssignments(a || []);
      setPersistent(p);
      const scoped = weeksForClient(w, s.activeClientId, c.find((x) => x.id === 'client_jgu_legacy')?.id);
      setPeriod((pr) => ({ ...pr, anchor: defaultAnchor(pr.type, scoped.length ? scoped : w) }));
      const sess = readSession();
      if (sess?.userId) {
        const found = (u || []).find((x) => x.id === sess.userId && x.active !== false);
        if (found) setSessionUser(publicUser(found));
      }
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (window.location.hash !== `#${view}`) window.history.replaceState({ view, drill: {} }, '', `#${view}`);
    window.scrollTo(0, 0);
  }, [view]);

  // Keep admins off pages they cannot open.
  useEffect(() => {
    if (!user) return;
    if (!canAccess(user, view)) {
      const fallback = allowedViews(user)[0] || 'overview';
      setView(fallback);
    }
  }, [user, view]);

  const toast = useCallback((msg, kind = 'ok') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const updateSettings = useCallback(async (s) => {
    setSettingsState(s);
    try { await saveSettings(s); } catch (e) { toast('Settings could not be saved in this browser.', 'err'); }
  }, [toast]);

  const persistClients = useCallback(async (next) => {
    setClients(next);
    try { await saveClients(next); } catch (e) { toast('Clients could not be saved in this browser.', 'err'); }
  }, [toast]);

  const persistUsers = useCallback(async (next) => {
    setUsers(next);
    try { await saveUsers(next); } catch (e) { toast('Team could not be saved in this browser.', 'err'); }
  }, [toast]);

  const saveAssignmentsList = useCallback(async (next) => {
    setAssignments(next);
    try { await saveAssignments(next); } catch (e) { toast('Assignments could not be saved.', 'err'); }
  }, [toast]);

  const saveUser = useCallback(async (u) => {
    await persistUsers([...users.filter((x) => x.id !== u.id), u]);
  }, [users, persistUsers]);

  const removeUser = useCallback(async (id) => {
    await persistUsers(users.filter((u) => u.id !== id));
    await saveAssignmentsList(assignments.filter((a) => a.userId !== id));
  }, [users, persistUsers, assignments, saveAssignmentsList]);

  const setActiveClient = useCallback(async (id) => {
    const c = clients.find((x) => x.id === id);
    if (!c) return;
    const next = { ...settings, activeClientId: id, threshold: c.junkPct };
    await updateSettings(next);
    const scoped = weeksForClient(weeks, id, legacyClientId);
    setPeriod((pr) => ({ ...pr, anchor: defaultAnchor(pr.type, scoped.length ? scoped : weeks) }));
  }, [clients, settings, updateSettings, weeks, legacyClientId]);

  const saveClient = useCallback(async (client) => {
    const next = [...clients.filter((c) => c.id !== client.id), client];
    await persistClients(next);
    if (settings.activeClientId === client.id) {
      await updateSettings({ ...settings, threshold: client.junkPct });
    }
    if (!settings.activeClientId) {
      await updateSettings({ ...settings, activeClientId: client.id, threshold: client.junkPct });
    }
  }, [clients, persistClients, settings, updateSettings]);

  const removeClient = useCallback(async (id) => {
    const next = clients.filter((c) => c.id !== id);
    await persistClients(next);
    if (settings.activeClientId === id && next[0]) {
      await updateSettings({ ...settings, activeClientId: next[0].id, threshold: next[0].junkPct });
    }
  }, [clients, persistClients, settings, updateSettings]);

  const putWeek = useCallback(async (w) => {
    const stamped = { ...w, clientId: w.clientId || activeClientId || undefined };
    await saveWeek(stamped);
    setWeeks((ws) => [...ws.filter((x) => weekKey(x) !== weekKey(stamped)), stamped]);
  }, [activeClientId]);

  // Deletes the active client's week with this start date (another client's same week is untouched).
  const removeWeek = useCallback(async (id) => {
    const target = weeks.find((w) => w.id === id && weekBelongsToClient(w, activeClientId, legacyClientId));
    if (!target) return;
    await dbDeleteWeek(target);
    setWeeks((ws) => ws.filter((w) => weekKey(w) !== weekKey(target)));
  }, [weeks, activeClientId, legacyClientId]);

  const importHistory = useCallback(async (data) => {
    const res = mergeHistory(weeks, data.weeks || []);
    for (const w of res.weeks) await saveWeek(w);
    setWeeks(res.weeks);
    if (Array.isArray(data.clients) && data.clients.length) {
      const merged = mergeClients(clients, data.clients);
      await persistClients(merged.clients);
      res.clientsAdded = merged.added;
      res.clientsUpdated = merged.updated;
    }
    if (data.settings) {
      // Keep this browser's active client and goals; only add programme / stage names it does not have yet.
      const add = (mine = [], theirs = []) => [...mine, ...theirs.filter((x) => !mine.includes(x))];
      await updateSettings({
        ...settings,
        excluded: add(settings.excluded, data.settings.excluded),
        managed: add(settings.managed, data.settings.managed),
        knownStages: add(settings.knownStages, data.settings.knownStages),
      });
    }
    return res;
  }, [weeks, clients, settings, persistClients, updateSettings]);

  const goTo = useCallback((v, d = {}) => {
    if (user && !canAccess(user, v)) {
      toast('You do not have access to that page.', 'err');
      return;
    }
    // A history entry per click, so the browser Back button returns to the previous page and its filters.
    try { window.history.pushState({ view: v, drill: d }, '', `#${v}`); } catch (e) { /* history blocked */ }
    setDrill(d);
    setView(v);
    setMoreOpen(false);
  }, [user, toast]);

  useEffect(() => {
    const onPop = (e) => {
      const v = e.state?.view || window.location.hash.replace('#', '');
      if (!ALL.some((n) => n.id === v)) return;
      setDrill(e.state?.drill || {});
      setView(v);
      setMoreOpen(false);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const login = useCallback((u) => {
    setSessionUser(u);
    writeSession(u);
    toast(`Signed in as ${u.name} (${ROLE_LABEL[u.role]})`);
    setView(allowedViews(u)[0] || 'overview');
  }, [toast]);

  const logout = useCallback(() => {
    setSessionUser(null);
    writeSession(null);
    toast('Signed out.');
  }, [toast]);

  // Period derivations for the active client. All signed-in users see every programme
  // (assignments are ownership only — they do not hide data).
  const derived = useMemo(() => {
    if (!period.anchor) return null;
    const range = periodRange(period.type, period.anchor);
    const inRange = prepareWeeksForPeriod(weeksIn(range, clientWeeks), range);
    const prevRange = previousRange(range);
    const prevWeeks = prepareWeeksForPeriod(weeksIn(prevRange, clientWeeks), prevRange);
    const agg = aggregate(inRange);
    const prevAgg = aggregate(prevWeeks);
    return {
      range,
      weeks: inRange,
      agg,
      comp: completeness(range, inRange),
      prevRange,
      prevAgg,
      prevComp: completeness(prevRange, prevWeeks),
      assignedKeys,
    };
  }, [period, clientWeeks, assignedKeys]);

  // A month / quarter / custom range that holds just one week shows the same numbers as One week: say so.
  const thinPeriod = !!derived && period.type !== 'week' && derived.weeks.length === 1;
  const fullerPeriod = useMemo(() => {
    if (!thinPeriod || period.type === 'custom') return null;
    for (const o of anchorOptions(period.type, clientWeeks)) {
      if (o.value === period.anchor) continue;
      const n = weeksIn(periodRange(period.type, o.value), clientWeeks).length;
      if (n > 1) return { ...o, weeks: n };
    }
    return null;
  }, [thinPeriod, period, clientWeeks]);

  const reviewCount = run.reviewCount || 0;
  const ctx = {
    settings, updateSettings, weeks: clientWeeks, allWeeks: weeks, putWeek, removeWeek, importHistory, persistent,
    clients, activeClientId, activeClient, legacyClientId, setActiveClient, saveClient, removeClient,
    users, saveUser, removeUser, assignments, saveAssignmentsList,
    user, login, logout, assignedKeys, isSuperAdmin: isSuperAdmin(user),
    view, goTo, drill, setDrill, period, setPeriod, derived, toast, run, setRun,
    theme, setTheme, resolvedTheme,
  };

  const visibleMain = MAIN_NAV.filter((n) => canAccess(user, n.id));
  const visibleBottom = BOTTOM_NAV.filter((n) => canAccess(user, n.id));
  const page = ALL.find((n) => n.id === view) || ALL[0];
  const navView = DETAIL.has(view) ? 'overview' : view;
  const navButton = (n) => (
    <button key={n.id} type="button" className={`nav-item ${navView === n.id ? 'on' : ''}`} aria-current={navView === n.id ? 'page' : undefined} onClick={() => goTo(n.id)} title={n.label}>
      <Icon name={n.icon} size={17} /><span>{n.label}</span>
      {n.id === 'run' && reviewCount > 0 && <em className="nav-badge" aria-label={`${reviewCount} items to review`}>{reviewCount}</em>}
    </button>
  );

  if (!loaded) {
    return (
      <div className="login-screen" aria-busy="true" aria-label="Loading">
        <div className="login-card login-loading">
          <div className="login-brand">
            <img src={logoWhite} alt="Purview Digital" />
            <div>
              <h1>Junk Analysis</h1>
              <p>Loading workspace…</p>
            </div>
          </div>
          <div className="login-skel">
            <div className="skeleton" style={{ height: 14, width: '38%' }} />
            <div className="skeleton" style={{ height: 36, width: '100%', borderRadius: 8 }} />
            <div className="skeleton" style={{ height: 14, width: '28%' }} />
            <div className="skeleton" style={{ height: 36, width: '100%', borderRadius: 8 }} />
            <div className="skeleton" style={{ height: 44, width: '100%', borderRadius: 10 }} />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <AppContext.Provider value={ctx}>
        <Login users={users} onLogin={login} />
        <div className="toasts" role="status" aria-live="polite">
          {toasts.map((t) => <div key={t.id} className={`toast ${t.kind === 'err' ? 'err' : ''}`}><Icon name={t.kind === 'err' ? 'alert' : 'checkCircle'} size={16} />{t.msg}</div>)}
        </div>
      </AppContext.Provider>
    );
  }

  return (
    <AppContext.Provider value={ctx}>
      <div className="shell">
        <aside className="sidebar" aria-label="Main navigation">
          <div className="side-scroll">
            <div className="brand">
              <img className="brand-logo" src={logoWhite} alt="Purview Digital" />
              <img className="brand-logo-sm" src={logoIcon} alt="Purview Digital" />
              <div className="brand-product">Junk Analysis{activeClient ? ` · ${activeClient.name}` : ''}</div>
            </div>
            {clients.length > 0 && isSuperAdmin(user) && (
              <div className="client-switch">
                <span className="client-switch-label">Active client</span>
                <select
                  className="select"
                  aria-label="Active client"
                  value={activeClientId || ''}
                  onChange={(e) => setActiveClient(e.target.value)}
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.status === 'inactive' ? ' (inactive)' : ''}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="user-chip">
              <span className={`login-avatar sm ${isSuperAdmin(user) ? 'super' : ''}`}>{user.name.slice(0, 1)}</span>
              <span className="user-chip-text">
                <b>{user.name}</b>
                <em className="role-pill">{ROLE_LABEL[user.role]}</em>
              </span>
              <button type="button" className="user-signout" onClick={logout} title="Sign out" aria-label="Sign out">
                <Icon name="arrowLeft" size={14} />
              </button>
            </div>
            {!isSuperAdmin(user) && assignedKeys?.length > 0 && (
              <div className="assign-hint">
                {assignedKeys.length} programme{assignedKeys.length === 1 ? '' : 's'} owned by you · full catalogue visible
              </div>
            )}
            <div className="nav-label">Analyse</div>
            <nav className="nav">{visibleMain.map(navButton)}</nav>
            <div className="side-bottom">
              <div className="nav-label">Workspace</div>
              <nav className="nav">{visibleBottom.map(navButton)}</nav>
            </div>
          </div>
          <div className="theme-dock">
            <div className="theme-row">
              <span>Theme</span>
              <div className="icon-toggle" role="group" aria-label="Theme">
                {[['light', 'sun'], ['system', 'monitor'], ['dark', 'moon']].map(([t, ic]) => (
                  <button
                    key={t}
                    type="button"
                    className={theme === t ? 'on' : ''}
                    aria-pressed={theme === t}
                    aria-label={`${t[0].toUpperCase()}${t.slice(1)} theme`}
                    title={`${t[0].toUpperCase()}${t.slice(1)} theme`}
                    onClick={() => setTheme(t)}
                  >
                    <Icon name={ic} size={15} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>

        <div className="main">
          <main className="page">
            <header className="page-head">
              <div className="page-title-wrap">
                <div>
                  {DETAIL.has(view) && (
                    <button type="button" className="crumb" onClick={() => goTo('overview')}>
                      <Icon name="arrowLeft" size={13} />Overview
                    </button>
                  )}
                  <h1 className="page-title">{page.label}</h1>
                  {page.blurb && <p className="page-blurb">{page.blurb}</p>}
                </div>
                {ANALYSE.has(view) && derived && <PeriodStatus range={derived.range} comp={derived.comp} prevRange={derived.prevRange} prevComp={derived.prevComp} compare={period.compare} />}
              </div>
              {ANALYSE.has(view) && (
                <div className="page-actions">
                  <PeriodBar />
                </div>
              )}
            </header>
            {ANALYSE.has(view) && thinPeriod && (
              <div className="callout info" role="status">
                <Icon name="info" size={16} />
                <div>
                  <b>{derived.range.label} has only 1 reporting week so far</b> ({derived.weeks[0].label}){derived.comp.notYet ? `; ${derived.comp.notYet} more week(s) have not ended yet` : ''}.
                  {' '}So these numbers are the same as choosing <b>One week</b>. This is correct, not a mistake.
                  {fullerPeriod && (
                    <>
                      {' '}To compare a fuller period, choose{' '}
                      <button type="button" className="crumb" style={{ display: 'inline-flex', margin: 0 }} onClick={() => setPeriod({ ...period, anchor: fullerPeriod.value })}>{fullerPeriod.label}</button>
                      {' '}({fullerPeriod.weeks} weeks).
                    </>
                  )}
                </div>
              </div>
            )}
            {!persistent && (
              <div className="callout warn" role="status"><Icon name="alert" size={16} /><div><b>This browser is not saving data</b> (private window or blocked storage). Use History → Export to keep approved weeks.</div></div>
            )}
            <>
              {view === 'overview' && <Overview />}
              {view === 'run' && <WeeklyRun />}
              {view === 'programmes' && <Programmes />}
              {view === 'campaigns' && <Campaigns />}
              {view === 'leads' && <LeadsDetail />}
              {view === 'junk' && <JunkDetail />}
              {view === 'qualified' && <QualifiedDetail />}
              {view === 'dnp' && <DnpReport />}
              {view === 'untouched' && <UntouchedDetail />}
              {view === 'apps' && <AppsDetail />}
              {view === 'records' && <Records />}
              {view === 'clients' && <Clients />}
              {view === 'history' && <History />}
              {view === 'settings' && <Settings />}
              {view === 'team' && <Team />}
            </>
          </main>
        </div>
      </div>

      {moreOpen && (
        <div className="more-sheet" role="menu">
          {[...visibleMain, ...visibleBottom]
            .filter((n) => !['overview', 'programmes', 'run', 'records'].includes(n.id))
            .map((n) => (
              <button key={n.id} type="button" role="menuitem" onClick={() => goTo(n.id)}><Icon name={n.icon} size={18} />{n.label}</button>
            ))}
        </div>
      )}
      <nav className="mobile-nav" aria-label="Main navigation">
        {[['overview', 'Overview', 'overview'], ['programmes', 'Programmes', 'programmes'], ['records', 'Records', 'records']]
          .filter(([id]) => canAccess(user, id))
          .map(([id, l, ic]) => (
            <button key={id} type="button" className={navView === id ? 'on' : ''} onClick={() => goTo(id)}><Icon name={ic} size={19} />{l}</button>
          ))}
        <button type="button" className={[...visibleMain, ...visibleBottom].some((n) => !['overview', 'programmes', 'records'].includes(n.id) && navView === n.id) ? 'on' : ''} aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)}><Icon name="more" size={19} />More</button>
      </nav>

      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.kind === 'err' ? 'err' : ''}`}><Icon name={t.kind === 'err' ? 'alert' : 'checkCircle'} size={16} />{t.msg}</div>)}
      </div>
    </AppContext.Provider>
  );
}
