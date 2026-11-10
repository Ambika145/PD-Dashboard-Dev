import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart, GaugeChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, MarkLineComponent, AriaComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useApp } from '../context.js';

echarts.use([BarChart, LineChart, PieChart, GaugeChart, GridComponent, TooltipComponent, MarkLineComponent, AriaComponent, LegendComponent, CanvasRenderer]);

/** Reads chart colours from the design tokens so both themes stay in sync. */
export function chartTokens() {
  const s = getComputedStyle(document.documentElement);
  const v = (n) => s.getPropertyValue(n).trim();
  return {
    ink: v('--ink'), ink2: v('--ink-2'), muted: v('--muted'), faint: v('--faint'), line: v('--line'), surface: v('--surface'),
    accent: v('--accent'), accent2: v('--accent-2'), teal: v('--teal') || v('--accent-2'), violet: v('--violet') || '#7c3aed',
    good: v('--good'), warn: v('--warn'), crit: v('--crit'),
    jl: v('--s-jl'), fin: v('--s-fin'), ni: v('--s-ni'), other: v('--s-other'),
    o1: v('--o-1'), o2: v('--o-2'), o3: v('--o-3'), font: v('--f-ui'),
  };
}

/** Shared axis/tooltip styling: recessive grid, token-coloured text. */
export function baseOption(t) {
  return {
    textStyle: { fontFamily: t.font, color: t.ink2 },
    aria: { enabled: true },
    animationDuration: 350,
    tooltip: {
      backgroundColor: t.ink, borderWidth: 0, padding: [10, 14],
      textStyle: { color: t.surface, fontSize: 12.5, fontFamily: t.font, fontWeight: 500 },
      extraCssText: 'box-shadow:0 12px 32px rgba(11,31,58,.22);border-radius:10px;backdrop-filter:blur(8px);',
    },
  };
}

export const axisStyle = (t) => ({
  axisLine: { lineStyle: { color: t.line } },
  axisTick: { show: false },
  axisLabel: { color: t.muted, fontSize: 11 },
  splitLine: { lineStyle: { color: t.line, type: [3, 3] } },
});

export default function Chart({ option, height = 280, onClick, label }) {
  const ref = useRef(null);
  const inst = useRef(null);
  const clickRef = useRef(onClick);
  const { resolvedTheme } = useApp();
  clickRef.current = onClick;

  useEffect(() => {
    const c = echarts.init(ref.current, null, { renderer: 'canvas' });
    inst.current = c;
    c.on('click', (p) => clickRef.current && clickRef.current(p));
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(ref.current);
    return () => { ro.disconnect(); c.dispose(); };
  }, []);

  useEffect(() => {
    if (inst.current) inst.current.setOption(option, true);
  }, [option, resolvedTheme]);

  return <div ref={ref} className="chart" style={{ height }} role="img" aria-label={label} />;
}
