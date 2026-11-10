import React, { useMemo, useState } from 'react';
import Icon from './Icons.jsx';

export const fmt = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('en-IN'));
export const fmtPct = (v, digits = 0) => (v === null || v === undefined || Number.isNaN(v) ? '—' : `${(v * 100).toFixed(digits)}%`);

/** Tiny SVG sparkline for KPI trend context. */
export function Sparkline({ values = [], color = 'var(--accent)', height = 36 }) {
  const nums = values.filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
  if (nums.length < 2) return null;
  const w = 120;
  const h = height;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const pts = nums.map((v, i) => {
    const x = (i / (nums.length - 1)) * w;
    const y = h - 4 - ((v - min) / span) * (h - 8);
    return `${x},${y}`;
  });
  const area = `0,${h} ${pts.join(' ')} ${w},${h}`;
  return (
    <svg className="kpi-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline fill={color} fillOpacity="0.12" stroke="none" points={area} />
      <polyline fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" points={pts.join(' ')} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Kpi({ label, value, sub, delta, tone = '', icon, iconTone = '', spark = null, sparkColor, onClick, title }) {
  const clickable = typeof onClick === 'function';
  const Tag = clickable ? 'button' : 'div';
  return (
    <Tag
      type={clickable ? 'button' : undefined}
      className={`kpi ${tone}${clickable ? ' clickable' : ''}`}
      onClick={clickable ? onClick : undefined}
      title={title || (clickable ? `Open ${label}` : undefined)}
    >
      <div className="kpi-top">
        <span className="kpi-label">{label}{clickable && <span className="kpi-go" aria-hidden="true">→</span>}</span>
        {icon && <span className={`kpi-icon ${iconTone}`} aria-hidden="true"><Icon name={icon} size={16} stroke={1.9} /></span>}
      </div>
      <span className="kpi-value">{value}</span>
      {(sub || delta) && <span className="kpi-sub">{delta}{sub && <span>{sub}</span>}</span>}
      {spark && spark.length > 1 && <Sparkline values={spark} color={sparkColor} />}
    </Tag>
  );
}

/** Compact change vs the comparison period; renders nothing when invalid. */
export function Delta({ cur, prev, kind = 'count', badWhenUp = true, show = true }) {
  if (!show || prev === null || prev === undefined) return null;
  let up;
  let text;
  if (kind === 'pct') {
    const pts = (cur - prev) * 100;
    if (Math.abs(pts) < 0.05) return <span className="delta flat">No change</span>;
    up = pts > 0;
    text = `${Math.abs(pts).toFixed(1)} pts`;
  } else {
    if (!prev) return null;
    const ch = (cur - prev) / prev;
    if (Math.abs(ch) < 0.0005) return <span className="delta flat">No change</span>;
    up = ch > 0;
    text = `${Math.abs(ch * 100).toFixed(1)}%`;
  }
  const cls = up === badWhenUp ? 'bad' : 'good';
  return (
    <span className={`delta ${cls}`} title="Change versus the previous period">
      <Icon name={up ? 'trendUp' : 'trendDown'} size={12} stroke={2.4} />
      {text}
      <span className="delta-vs">vs previous</span>
    </span>
  );
}

const TAG_ICON = { good: 'check', warn: 'alert', crit: 'xCircle', info: 'info' };
export function Tag({ tone = 'neutral', children, icon = true }) {
  return <span className={`tag t-${tone}`}>{icon && TAG_ICON[tone] && <Icon name={TAG_ICON[tone]} size={11} stroke={2.4} />}{children}</span>;
}

const CALL_ICON = { warn: 'alert', info: 'info', crit: 'xCircle', good: 'checkCircle' };
export function Callout({ tone = 'info', children }) {
  return <div className={`callout ${tone}`} role={tone === 'crit' ? 'alert' : undefined}><Icon name={CALL_ICON[tone]} size={16} /><div>{children}</div></div>;
}

export function Empty({ icon = 'chart', title, children, action }) {
  return (
    <div className="empty">
      <Icon name={icon} size={32} stroke={1.4} />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Seg({ value, options, onChange, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={value === o.value ? 'on' : ''} aria-pressed={value === o.value} disabled={o.disabled} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

/** Chart legend chips — colour + label, optional click. */
export function Legend({ items = [], active, onSelect }) {
  return (
    <div className="legend" role="list">
      {items.map((it) => {
        const on = !active || active === it.id;
        const clickable = typeof onSelect === 'function' && it.id;
        const Tag = clickable ? 'button' : 'span';
        return (
          <Tag
            key={it.id || it.label}
            type={clickable ? 'button' : undefined}
            role="listitem"
            className={`legend-item${clickable ? ' clickable' : ''}${active && active === it.id ? ' on' : ''}${active && !on ? ' dim' : ''}`}
            onClick={clickable ? () => onSelect(active === it.id ? null : it.id) : undefined}
            aria-pressed={clickable ? active === it.id : undefined}
          >
            <i style={{ background: it.color }} />
            {it.label}
            {it.value != null && <b>{it.value}</b>}
          </Tag>
        );
      })}
    </div>
  );
}

/** Plain card: title, one-line subtitle, optional actions. */
export function Card({ title, sub, actions, children, foot, className = '', icon, iconTone = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          <div className="card-title-row">
            {icon && <span className={`card-icon ${iconTone}`} aria-hidden="true"><Icon name={icon} size={16} stroke={1.9} /></span>}
            <div>
              {title && <h3 className="card-title">{title}</h3>}
              {sub && <p className="card-sub">{sub}</p>}
            </div>
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      {children}
      {foot && <p className="card-foot">{foot}</p>}
    </section>
  );
}

/** Sortable, searchable table. columns: [{ key, label, align, render, value, sort }] */
export function DataTable({ columns, rows, search, searchKeys = [], pageSize = 0, onRowClick, footer, initialSort, empty = 'No rows match.', rowClass, maxHeight = true, tools }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(initialSort || null);
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => {
    let out = rows;
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      out = out.filter((r) => searchKeys.some((k) => String(r[k] ?? '').toLowerCase().includes(s)));
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      const val = col?.value || ((r) => r[sort.key]);
      out = [...out].sort((a, b) => {
        const x = val(a); const y = val(b);
        const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'en', { numeric: true });
        return sort.dir === 'asc' ? c : -c;
      });
    }
    return out;
  }, [rows, q, sort, columns, searchKeys]);
  const pages = pageSize ? Math.max(1, Math.ceil(filtered.length / pageSize)) : 1;
  const p = Math.min(page, pages - 1);
  const shown = pageSize ? filtered.slice(p * pageSize, (p + 1) * pageSize) : filtered;
  const toggle = (key) => setSort((s) => (s && s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));

  return (
    <div>
      {(search || tools) && (
        <div className="table-tools">
          {search ? (
            <label className="search">
              <Icon name="search" size={14} />
              <input aria-label={search} placeholder={search} value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
            </label>
          ) : <span />}
          <span className="btns">{tools}<span className="small muted">{fmt(filtered.length)} {filtered.length === 1 ? 'row' : 'rows'}</span></span>
        </div>
      )}
      <div className={`tw ${maxHeight ? 'max' : ''}`}>
        <table className="tbl">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={`${c.align === 'left' ? 'l' : ''} ${c.sort !== false ? 'sortable' : ''}`} onClick={c.sort !== false ? () => toggle(c.key) : undefined} aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {c.label}
                    {sort?.key === c.key && <Icon name={sort.dir === 'asc' ? 'trendUp' : 'trendDown'} size={11} stroke={2.4} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={columns.length} className="l muted" style={{ padding: 24 }}>{empty}</td></tr>}
            {shown.map((r, i) => (
              <tr key={r.id ?? r.key ?? i} className={`${onRowClick ? 'clickable' : ''} ${rowClass ? rowClass(r) : ''}`} onClick={onRowClick ? () => onRowClick(r) : undefined}>
                {columns.map((c) => (
                  <td key={c.key} className={`${c.align === 'left' ? 'l' : ''} ${c.wrap ? 'wrap' : ''} ${c.cellClass ? c.cellClass(r) : ''}`}>{c.render ? c.render(r) : r[c.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer && <tfoot><tr>{footer}</tr></tfoot>}
        </table>
      </div>
      {pageSize > 0 && pages > 1 && (
        <div className="pager">
          <span>Page {p + 1} of {pages}</span>
          <button className="btn ghost sm" type="button" disabled={p === 0} onClick={() => setPage(p - 1)}>Previous</button>
          <button className="btn ghost sm" type="button" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}

/** Ranked list with inline bars — one clear view instead of a chart plus a table. */
export function RankList({ items, value, format, valueLabel, threshold, onOpen, limit = 8, highlight }) {
  const [all, setAll] = useState(false);
  const sorted = [...items].sort((a, b) => value(b) - value(a));
  const shown = all ? sorted : sorted.slice(0, limit);
  const max = Math.max(...sorted.map(value), 0) || 1;
  return (
    <div className="rank">
      <div className="rank-head"><span>#</span><span>Programme name</span><span className="rank-num">Leads</span><span /><span className="rank-num">{valueLabel}</span></div>
      {shown.map((x, i) => (
        <button key={x.key} type="button" className="rank-row" onClick={() => onOpen(x)} title={x.label}>
          <span className="rank-pos">{i + 1}</span>
          <span className="rank-name">{x.label}</span>
          <span className="rank-num">{fmt(x.total)}</span>
          <span className="rank-bar"><i style={{ width: `${(value(x) / max) * 100}%`, background: highlight }} /></span>
          <span className={`rank-val ${threshold !== undefined && x.junkPct >= threshold ? 'hi' : ''}`}>{format(value(x))}</span>
        </button>
      ))}
      {sorted.length > limit && (
        <div className="rank-more"><button type="button" className="link" onClick={() => setAll(!all)}>{all ? 'Show top ' + limit : `Show all ${sorted.length} programmes`}</button></div>
      )}
    </div>
  );
}

/** In-page confirmation (browser dialogs are avoided). */
export function ConfirmButton({ label, confirmText, onConfirm, className = 'btn ghost sm', danger = 'Delete' }) {
  const [ask, setAsk] = useState(false);
  if (!ask) return <button type="button" className={className} onClick={() => setAsk(true)}>{label}</button>;
  return (
    <span className="confirm">
      <span>{confirmText}</span>
      <button type="button" className="btn danger sm" onClick={() => { setAsk(false); onConfirm(); }}>{danger}</button>
      <button type="button" className="btn ghost sm" onClick={() => setAsk(false)}>Cancel</button>
    </span>
  );
}
