# JGU Junk Analysis dashboard

The Ads Team's weekly Junk Analysis (see `_Junk Analysis Process.md`) as a guided dashboard.

## Using it

Open **`JGU Junk Analysis.html`** in Chrome or Edge. Nothing needs to be installed, and the data never leaves your computer.

**Every week (Wednesday → Tuesday):**

1. **Weekly run → Reporting week.** The last completed week is pre-selected.
2. **Upload the three Meritto exports.** Each step shows the exact Meritto clicks with the week's dates filled in:
   - Part 1: leads (Course, Lead Stage, Primary Registration Campaign)
   - Part 2: enrolments (Enrolment Status = Yes)
   - Part 3: applications (Enrolment Status = No)
3. **Review.** Decide on any new programme (managed or excluded), then read the checks. Anything blocking stops approval.
4. **Report.** This is the Weekly Performance table in the usual layout. *Copy for Excel* pastes it straight into the SharePoint sheet.
5. **Approve.** This saves the week and downloads `JGU Junk Report <week>.xlsx`, with Programme-wise, Campaign-wise and Checks sheets.

**Analyse:** Overview, Programmes, Campaigns and Records all follow the period bar (week, month, quarter, 5 months, year or custom). Click a chart to drill into the underlying rows.

**Sharing with the team:** History is stored in each person's browser. Use **History → Export history file**, save the file in the team SharePoint folder, and teammates use **Import history file**. When two copies of a week disagree, an approved week replaces a past-report week, and the most recent approval wins.

## Business rules (fixed)

- Junk = FINANCIAL BARRIER + JUNK LEAD + NOT INTERESTED IN THE PROGRAM. Junk % = Junk ÷ Grand Total.
- Payment Pending = Application Started. Payment Approved = Application Submitted. Other payment statuses are listed but not counted.
- A week counts toward the period in which its Tuesday falls. A period's Junk % is total Junk ÷ total leads.
- 27 past weeks (22 Apr – 27 Oct 2026) are preloaded from `Junk Report - JGU & JIA.xlsx`, with programme rows, the stage split, application figures (from 24 Jun) and campaign rows (from 1 Jul). Three weeks where the workbook's Grand Total row disagrees with its programme rows (22 Apr, 30 Sep, 7 Oct) carry a warning in History → Details.

## Developers

```
npm install
npm test        # calculation tests (no UI)
npm run dev     # local dev server
npm run build   # rebuilds "JGU Junk Analysis.html" (single self-contained file)
```

- `src/lib/junkCore.js`: the documented process, as pure functions
- `src/lib/periods.js`: reporting periods and aggregation
- `src/lib/seed.js`: weeks imported from the PDF
- `src/pages/`: the screens

`legacy-v1/` holds the first plain-HTML version.
