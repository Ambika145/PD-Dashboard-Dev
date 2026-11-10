import { baseOption, axisStyle } from '../components/Chart.jsx';

export const CATS = [
  { id: 'jl', label: 'Junk Lead', token: 'jl' },
  { id: 'fin', label: 'Financial Barrier', token: 'fin' },
  { id: 'ni', label: 'Not Interested in the Program', token: 'ni' },
];

/** Distinct non-junk stage colours (stable by stage key). Avoids the old
 *  single grey that made “Where did these leads end up?” hard to read. */
const STAGE_PALETTE = [
  '#0f766e', '#1d4ed8', '#7c3aed', '#b45309', '#0369a1',
  '#4d7c0f', '#c026d3', '#ea580c', '#0e7490', '#4338ca',
  '#a16207', '#15803d', '#6d28d9', '#0891b2', '#ca8a04',
  '#2563eb', '#db2777', '#65a30d', '#0284c7', '#9333ea',
];

const hashKey = (key) => {
  let h = 0;
  const s = String(key || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

/**
 * Colour for a lead-stage bar.
 * Junk stages keep their category hues (JL / Financial / Not Interested).
 * Untouched-over-alert uses crit red. Everything else gets a unique palette colour.
 */
export function stageBarColor(key, { cat, untouchedAlert, tokens: t } = {}) {
  if (untouchedAlert) return t.crit;
  if (cat) {
    const token = CATS.find((c) => c.id === cat)?.token;
    if (token && t[token]) return t[token];
  }
  return STAGE_PALETTE[hashKey(key) % STAGE_PALETTE.length];
}

/** Category-axis label width that leaves room for the bars on small screens. */
export const labelWidth = () => (typeof window !== 'undefined' && window.innerWidth < 640 ? 118 : 250);

const nf = (n) => Number(n).toLocaleString('en-IN');
const pf = (v) => `${(v * 100).toFixed(1)}%`;

/** Shortens long programme names for axis labels; full name stays in tooltips. */
export function shortName(label, max = 40) {
  const s = label
    .replace(/^MASTER OF ARTS \((M\.A\.|MA)\) IN /, 'M.A. ')
    .replace(/^MASTER OF ARTS IN /, 'M.A. ')
    .replace(/^MASTERS IN /, 'Masters ')
    .replace(/TEACHING ENGLISH TO SPEAKERS OF OTHER LANGUAGES /, '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Generic donut — centre shows rate + caption; slices carry id for click filters. */
export function itemsDonutOption(t, items, { centerValue, centerLabel, active } = {}) {
  const total = items.reduce((s, d) => s + (d.value || 0), 0) || 1;
  const data = items
    .filter((d) => (d.value || 0) > 0)
    .map((d, i) => ({
      name: d.name,
      id: d.id,
      value: d.value,
      itemStyle: {
        color: d.color,
        opacity: active && active !== d.id ? 0.28 : 1,
        borderColor: t.surface,
        borderWidth: 3,
        borderRadius: 4,
      },
      label: i === 0 ? {
        show: true,
        position: 'center',
        formatter: () => `{a|${centerValue}}\n{b|${centerLabel}}`,
        rich: {
          a: { fontSize: 26, fontWeight: 700, color: t.ink, fontFamily: t.font, lineHeight: 32 },
          b: { fontSize: 11.5, color: t.muted, fontFamily: t.font, lineHeight: 18 },
        },
      } : undefined,
    }));
  return {
    ...baseOption(t),
    tooltip: {
      ...baseOption(t).tooltip,
      trigger: 'item',
      formatter: (p) => `${p.name}<br/><b>${nf(p.value)}</b> · ${pf(p.value / total)}`,
    },
    series: [{
      type: 'pie',
      radius: ['58%', '86%'],
      padAngle: 1.5,
      label: { show: false },
      labelLine: { show: false },
      emphasis: { scale: true, scaleSize: 5, label: { show: false } },
      data,
    }],
  };
}

export function donutOption(t, cats, active) {
  const total = cats.total || 1;
  const junkPct = cats.total ? Math.round((cats.junk / cats.total) * 100) : 0;
  return itemsDonutOption(
    t,
    [
      ...CATS.map((c) => ({ name: c.label, id: c.id, value: cats[c.id], color: t[c.token] })),
      { name: 'Other stages (not Junk)', id: 'other', value: cats.other, color: t.other },
    ],
    { centerValue: `${junkPct}%`, centerLabel: 'Junk rate', active },
  );
}

/** Pipeline buckets: Qualified / Junk / DNP / Untouched / Remainder. */
export function pipelineDonutOption(t, tot, active) {
  const remainder = Math.max(0, (tot.total || 0) - (tot.qualified || 0) - (tot.junk || 0) - (tot.dnp || 0) - (tot.untouched || 0));
  return itemsDonutOption(
    t,
    [
      { name: 'Qualified', id: 'qualified', value: tot.qualified || 0, color: t.accent },
      { name: 'Junk', id: 'junk', value: tot.junk || 0, color: t.crit },
      { name: 'DNP', id: 'dnp', value: tot.dnp || 0, color: t.violet },
      { name: 'Untouched', id: 'untouched', value: tot.untouched || 0, color: t.warn },
      { name: 'Other stages', id: 'rest', value: remainder, color: t.other },
    ],
    {
      centerValue: tot.total ? nf(tot.total) : '0',
      centerLabel: 'Leads',
      active,
    },
  );
}

/** Funnel-style horizontal conversion bars (App started → submitted → enrolled). */
export function funnelOption(t, steps) {
  const max = Math.max(...steps.map((s) => s.value), 1);
  return {
    ...baseOption(t),
    grid: { left: 8, right: 72, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      ...baseOption(t).tooltip,
      trigger: 'item',
      formatter: (p) => {
        const s = steps[p.dataIndex];
        return `${s.name}<br/><b>${nf(s.value)}</b>${s.rate != null ? ` · ${pf(s.rate)} of leads` : ''}`;
      },
    },
    xAxis: { type: 'value', show: false, max: max * 1.08 },
    yAxis: {
      type: 'category',
      inverse: true,
      data: steps.map((s) => s.name),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: t.ink2, fontSize: 12, fontWeight: 500 },
    },
    series: [{
      type: 'bar',
      data: steps.map((s) => ({
        value: s.value,
        itemStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
            colorStops: [
              { offset: 0, color: s.color },
              { offset: 1, color: s.color + 'cc' },
            ],
          },
          borderRadius: [0, 6, 6, 0],
        },
      })),
      barMaxWidth: 22,
      label: {
        show: true,
        position: 'right',
        color: t.ink2,
        fontSize: 12,
        fontWeight: 600,
        formatter: (p) => nf(p.value),
      },
    }],
  };
}

export function trendOption(t, series, marks = []) {
  const max = Math.max(...series.map((s) => s.junkPct), ...marks.map((m) => m.value), 0.1);
  return {
    ...baseOption(t),
    grid: { left: 8, right: 16, top: 20, bottom: 8, containLabel: true },
    tooltip: {
      ...baseOption(t).tooltip, trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: t.muted, type: 'dashed' } },
      formatter: (ps) => {
        const s = series[ps[0].dataIndex];
        return `${s.label}<br/>Junk <b>${pf(s.junkPct)}</b><br/>${nf(s.junk)} of ${nf(s.total)} leads${s.source === 'imported' ? '<br/><span style="opacity:.7">From past report</span>' : ''}`;
      },
    },
    xAxis: { type: 'category', boundaryGap: false, data: series.map((s) => s.short), ...axisStyle(t), splitLine: { show: false } },
    yAxis: { type: 'value', min: 0, max: Math.min(1, Math.ceil((max + 0.04) * 10) / 10), axisLabel: { ...axisStyle(t).axisLabel, formatter: (v) => `${Math.round(v * 100)}%` }, axisLine: { show: false }, axisTick: { show: false }, splitLine: axisStyle(t).splitLine },
    series: [{
      type: 'line', name: 'Junk %', data: series.map((s) => s.junkPct), symbol: 'circle', symbolSize: (v, p) => (p.dataIndex === series.length - 1 ? 9 : 6),
      lineStyle: { width: 2.5, color: t.accent }, itemStyle: { color: t.accent, borderColor: t.surface, borderWidth: 2 },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: (t.accent2 || t.o2) + '40' },
            { offset: 0.55, color: t.accent + '22' },
            { offset: 1, color: t.accent + '05' },
          ],
        },
      },
      markLine: {
        symbol: 'none', silent: true,
        data: marks.map((m) => ({ yAxis: m.value, lineStyle: { color: m.color || t.muted, type: 'dashed', width: 1 }, label: { formatter: m.label, color: t.muted, fontSize: 11, position: 'insideEndTop' } })),
      },
    }],
  };
}

export function mixOption(t, series, mode) {
  const val = (s, k) => (s[k] === null ? null : mode === 'pct' ? s[k] / s.total : s[k]);
  return {
    ...baseOption(t),
    grid: { left: 8, right: 12, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      ...baseOption(t).tooltip, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(127,127,127,.08)' } },
      formatter: (ps) => {
        const s = series[ps[0].dataIndex];
        if (s.jl === null) return `${s.label}<br/>No category split in the source report`;
        return `${s.label}<br/>${CATS.map((c) => `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${t[c.token]};margin-right:6px"></span>${c.label}: <b>${mode === 'pct' ? pf(s[c.id] / s.total) : nf(s[c.id])}</b>`).join('<br/>')}`;
      },
    },
    xAxis: { type: 'category', data: series.map((s) => s.short), ...axisStyle(t), splitLine: { show: false } },
    yAxis: { type: 'value', axisLabel: { ...axisStyle(t).axisLabel, formatter: (v) => (mode === 'pct' ? `${Math.round(v * 100)}%` : nf(v)) }, axisLine: { show: false }, splitLine: axisStyle(t).splitLine },
    series: CATS.map((c, i) => ({
      type: 'bar', name: c.label, stack: 'junk', barMaxWidth: 30, data: series.map((s) => val(s, c.id)),
      itemStyle: { color: t[c.token], borderColor: t.surface, borderWidth: 1, borderRadius: i === CATS.length - 1 ? [3, 3, 0, 0] : 0 },
    })),
  };
}

/** Horizontal bars for long category names; largest at the top. */
export function hbarOption(t, items, { value, format, color, tooltip }) {
  const sorted = [...items].sort((a, b) => value(b) - value(a));
  return {
    ...baseOption(t),
    grid: { left: 8, right: 56, top: 4, bottom: 4, containLabel: true },
    tooltip: { ...baseOption(t).tooltip, trigger: 'item', formatter: (p) => tooltip(sorted[p.dataIndex]) },
    xAxis: { type: 'value', show: false, max: (v) => v.max * 1.02 || 1 },
    yAxis: { type: 'category', inverse: true, data: sorted.map((x) => shortName(x.label)), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: t.ink2, fontSize: 11.5, width: labelWidth(), overflow: 'truncate' } },
    series: [{
      type: 'bar', data: sorted.map(value), barMaxWidth: 16, itemStyle: { color, borderRadius: [0, 3, 3, 0] },
      label: { show: true, position: 'right', color: t.ink2, fontSize: 11, formatter: (p) => format(p.value) },
    }],
    _sorted: sorted,
  };
}

/** Gauge: current junk rate against the configured threshold goal. */
export function gaugeOption(t, rate, threshold) {
  const pct = Math.round((rate || 0) * 1000) / 10;
  const th = Math.round((threshold || 0) * 1000) / 10;
  const over = rate >= threshold;
  const color = over ? t.crit : t.teal || t.accent2;
  return {
    ...baseOption(t),
    series: [{
      type: 'gauge',
      startAngle: 210, endAngle: -30, min: 0, max: 100,
      radius: '100%', center: ['50%', '58%'],
      axisLine: {
        lineStyle: {
          width: 14,
          color: [
            [Math.min(th / 100, 1), t.teal || t.accent2],
            [1, t.crit],
          ],
        },
      },
      pointer: { length: '62%', width: 5, itemStyle: { color } },
      axisTick: { show: false },
      splitLine: { length: 10, lineStyle: { color: t.line, width: 2 } },
      axisLabel: { color: t.muted, fontSize: 10, distance: 14, formatter: (v) => `${v}%` },
      anchor: { show: true, size: 10, itemStyle: { color } },
      title: { show: true, offsetCenter: [0, '72%'], color: t.muted, fontSize: 12, fontFamily: t.font },
      detail: {
        valueAnimation: true, offsetCenter: [0, '42%'],
        formatter: () => `{v|${pct}%}\n{s|vs ${th}% goal}`,
        rich: {
          v: { fontSize: 26, fontWeight: 700, color: t.ink, fontFamily: t.font, lineHeight: 30 },
          s: { fontSize: 11, color: t.muted, fontFamily: t.font, lineHeight: 18 },
        },
      },
      data: [{ value: pct, name: over ? 'Above threshold' : 'Within goal' }],
    }],
  };
}

/** Radial progress ring for a single rate (e.g. period completeness). */
export function radialOption(t, value, label, color) {
  const pct = Math.round((value || 0) * 1000) / 10;
  const c = color || t.accent;
  return {
    ...baseOption(t),
    series: [{
      type: 'pie', radius: ['72%', '90%'], silent: true, label: { show: false },
      data: [
        { value: pct, itemStyle: { color: c, borderRadius: 6 } },
        { value: Math.max(0, 100 - pct), itemStyle: { color: t.line }, tooltip: { show: false } },
      ],
    }, {
      type: 'pie', radius: ['0%', '64%'], silent: true, label: {
        show: true, position: 'center',
        formatter: () => `{a|${pct}%}\n{b|${label}}`,
        rich: {
          a: { fontSize: 22, fontWeight: 700, color: t.ink, fontFamily: t.font, lineHeight: 28 },
          b: { fontSize: 11, color: t.muted, fontFamily: t.font },
        },
      },
      data: [{ value: 1, itemStyle: { color: 'transparent' } }],
    }],
  };
}

export function appsOption(t, items) {
  const sorted = [...items].filter((x) => x.started + x.submitted + x.enrolled > 0).sort((a, b) => (b.started + b.submitted + b.enrolled) - (a.started + a.submitted + a.enrolled));
  const S = [['started', 'Application Started', t.o1], ['submitted', 'Application Submitted', t.o2], ['enrolled', 'Enrollment Done', t.o3]];
  return {
    option: {
      ...baseOption(t),
      grid: { left: 8, right: 28, top: 4, bottom: 4, containLabel: true },
      tooltip: { ...baseOption(t).tooltip, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(127,127,127,.08)' } },
        formatter: (ps) => { const x = sorted[ps[0].dataIndex]; return `${x.label}<br/>${S.map(([k, l, c]) => `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${c};margin-right:6px"></span>${l}: <b>${nf(x[k])}</b>`).join('<br/>')}`; } },
      xAxis: { type: 'value', ...axisStyle(t), axisLine: { show: false }, minInterval: 1 },
      yAxis: { type: 'category', inverse: true, data: sorted.map((x) => shortName(x.label)), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: t.ink2, fontSize: 11.5, width: labelWidth(), overflow: 'truncate' } },
      series: S.map(([k, l, c]) => ({ type: 'bar', name: l, data: sorted.map((x) => x[k]), barMaxWidth: 9, barGap: '20%', itemStyle: { color: c, borderRadius: [0, 2, 2, 0] } })),
    },
    count: sorted.length,
    legend: S.map(([, l, c]) => ({ label: l, color: c })),
  };
}
