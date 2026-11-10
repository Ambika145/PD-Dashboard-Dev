import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import { clean, pct } from './junkCore.js';

function cellText(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((p) => p.text).join('');
    if ('result' in v) return cellText(v.result);
    if ('text' in v) return String(v.text);
  }
  return String(v);
}

/** Reads a Meritto export (CSV, or XLSX first sheet) into headers + row objects. */
export async function parseFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) throw new Error('The workbook has no sheets.');
    const headers = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => { headers[col - 1] = clean(cellText(cell.value)) || `Column ${col}`; });
    const rows = [];
    for (let i = 2; i <= ws.rowCount; i++) {
      const row = ws.getRow(i);
      const obj = {};
      let any = false;
      headers.forEach((h, idx) => {
        const t = cellText(row.getCell(idx + 1).value);
        if (t !== '') any = true;
        obj[h] = t;
      });
      if (any) rows.push(obj);
    }
    return { headers, rows };
  }
  if (ext === 'xls') throw new Error('Old .xls files are not supported. Download the CSV from Meritto, or save the file as .xlsx.');
  if (ext !== 'csv' && ext !== 'txt') throw new Error('Upload the CSV (or .xlsx) file downloaded from Meritto.');
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => clean(h),
      complete: (res) => resolve({ headers: (res.meta.fields || []).filter(Boolean), rows: res.data }),
      error: (err) => reject(err),
    });
  });
}

export function downloadBlob(data, filename, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const border = { top: { style: 'thin', color: { argb: 'FFD9D9D9' } }, bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } } };

/** Weekly Performance workbook in the team's existing layout. `report` is the
 *  Map-based shape from buildReport / weekToReport. */
export async function exportWeekWorkbook(report, label, threshold, meta = {}) {
  const th = threshold / 100;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'JGU Junk Analysis Dashboard';

  const sheet = (name, rows, withApps) => {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }] });
    const heads = ['Row Labels', ...report.stageCols.map((s) => s.label), 'Grand Total', 'Junk', 'Junk %',
      ...(withApps ? ['Application Started', 'Application Submitted', 'Enrollment Done'] : [])];
    ws.addRow([label]).font = { bold: true, size: 12 };
    const hr = ws.addRow(heads);
    hr.height = 48;
    hr.eachCell((cell, col) => {
      const stage = report.stageCols[col - 2];
      cell.font = { bold: true, size: 9 };
      cell.alignment = { wrapText: true, vertical: 'middle', horizontal: col === 1 ? 'left' : 'center' };
      cell.fill = fill(stage && stage.junk ? 'FFFFC000' : 'FFF2CEEF');
    });
    const pctCol = report.stageCols.length + 4;
    const write = (x, kind) => {
      const row = ws.addRow([x.label, ...report.stageCols.map((s) => x.counts.get(s.key) || null), x.total, x.junk, x.junkPct,
        ...(withApps ? [x.started, x.submitted, x.enrolled] : [])]);
      row.getCell(pctCol).numFmt = '0%';
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.border = border;
        if (col > 1) cell.alignment = { horizontal: 'center' };
      });
      if (kind === 'course') { row.font = { bold: true }; row.eachCell({ includeEmpty: true }, (c) => { c.fill = fill('FFDDEBF7'); }); }
      if (kind === 'campaign') row.getCell(1).alignment = { indent: 2 };
      if (kind === 'total') { row.font = { bold: true }; row.eachCell({ includeEmpty: true }, (c) => { c.fill = fill('FFBDD7EE'); }); }
      if (x.total && x.junkPct >= th) row.getCell(pctCol).fill = fill('FFFFC7CE');
    };
    rows.forEach((x) => write(x, x.type));
    write(report.totals, 'total');
    ws.getColumn(1).width = 62;
    for (let i = 2; i <= heads.length; i++) ws.getColumn(i).width = 12;
  };

  sheet('Programme-wise', report.rows, true);
  if (report.hasCampaign) sheet('Campaign-wise', report.campaignRows, true);
  const cs = wb.addWorksheet('Checks');
  cs.addRow(['Level', 'Check', 'Detail', 'Doc step']).font = { bold: true };
  report.checks.forEach((c) => cs.addRow([c.level.toUpperCase(), c.title, c.detail, c.doc]));
  cs.addRow([]);
  if (meta.files) cs.addRow(['Files', meta.files.join(' · ')]);
  if (meta.approvedAt) cs.addRow(['Approved', new Date(meta.approvedAt).toLocaleString('en-IN')]);
  cs.getColumn(1).width = 10; cs.getColumn(2).width = 60; cs.getColumn(3).width = 90; cs.getColumn(4).width = 14;

  downloadBlob(await wb.xlsx.writeBuffer(), `JGU Junk Report ${label}.xlsx`, XLSX_TYPE);
}

/** Period summary workbook: programme totals plus the week-by-week series. */
export async function exportPeriodWorkbook(range, agg, comp, threshold) {
  const th = threshold / 100;
  const wb = new ExcelJS.Workbook();
  const head = (ws, cells) => {
    const r = ws.addRow(cells);
    r.font = { bold: true, size: 10 };
    r.eachCell((c) => { c.fill = fill('FFF2CEEF'); c.alignment = { wrapText: true, vertical: 'middle' }; });
  };
  const s = wb.addWorksheet('Summary');
  s.addRow([`JGU Junk Analysis — ${range.label}`]).font = { bold: true, size: 13 };
  s.addRow([comp.complete ? 'Complete period' : `Partial period: ${comp.present} of ${comp.expected} weeks${comp.notYet ? ` (${comp.notYet} not ended yet)` : ''}`]);
  s.addRow(['Weeks are counted in the period in which their Tuesday falls. Junk % = Junk ÷ total leads.']);
  s.addRow([]);
  head(s, ['Week', 'Source', 'Leads', 'Junk', 'Junk %', 'Junk Lead', 'Financial Barrier', 'Not Interested']);
  for (const w of agg.series) {
    const r = s.addRow([w.label, w.source === 'imported' ? 'Past report' : 'Approved', w.total, w.junk, w.junkPct, w.jl, w.fin, w.ni]);
    r.getCell(5).numFmt = '0%';
    if (w.junkPct >= th) r.getCell(5).fill = fill('FFFFC7CE');
  }
  const tr = s.addRow(['Total', '', agg.totals.total, agg.totals.junk, agg.totals.junkPct]);
  tr.font = { bold: true };
  tr.getCell(5).numFmt = '0%';
  s.getColumn(1).width = 26; s.getColumn(2).width = 18;
  for (let i = 3; i <= 8; i++) s.getColumn(i).width = 14;

  const p = wb.addWorksheet('Programmes');
  p.addRow([`Programme totals — ${range.label} (${agg.weeksDetailed} approved week(s) with programme detail)`]).font = { bold: true };
  head(p, ['Programme', 'Leads', 'Junk', 'Junk %', 'Junk Lead', 'Financial Barrier', 'Not Interested', 'Application Started', 'Application Submitted', 'Enrollment Done']);
  for (const x of agg.programmes) {
    const r = p.addRow([x.label, x.total, x.junk, x.junkPct, x.jl, x.fin, x.ni, x.started, x.submitted, x.enrolled]);
    r.getCell(4).numFmt = '0%';
    if (x.junkPct >= th) r.getCell(4).fill = fill('FFFFC7CE');
  }
  p.getColumn(1).width = 62;
  for (let i = 2; i <= 10; i++) p.getColumn(i).width = 13;

  const dnp = agg.dnpDetail;
  if (dnp?.notesMapped && dnp.callAttemptsReport?.length) {
    const d = wb.addWorksheet('DNP Calling');
    d.addRow([`DNP Calling report — ${range.label}`]).font = { bold: true, size: 13 };
    d.addRow(['Filter: Lead Stage = DID NOT PICK (DNP). Note Count = Call Attempts.']);
    d.addRow([`${dnp.notesKnown} of ${dnp.total} DNP leads have a Note Count. % is of leads with a known call-attempt count.`]);
    d.addRow([]);
    head(d, ['Call Attempts', 'Number of Call Attempts', '%']);
    for (const row of dnp.callAttemptsReport.filter((r) => ['1', '2', '3', '4'].includes(r.key) || r.n > 0)) {
      const r = d.addRow([row.label, row.n, row.pct]);
      r.getCell(3).numFmt = '0.0%';
    }
    const tot = d.addRow(['Total (with Note Count)', dnp.notesKnown, 1]);
    tot.font = { bold: true };
    tot.getCell(3).numFmt = '0.0%';
    d.getColumn(1).width = 22;
    d.getColumn(2).width = 24;
    d.getColumn(3).width = 12;
  }

  downloadBlob(await wb.xlsx.writeBuffer(), `JGU Junk Analysis ${range.label.replace(/[:/]/g, '')}.xlsx`, XLSX_TYPE);
}

export function toCSV(headers, rows) {
  const q = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [headers, ...rows].map((r) => r.map(q).join(',')).join('\r\n');
}

export { pct };
