// PDF reports (jsPDF). Page 1 of a student record mirrors the Android layout; everything fits on one page, signature included.
import { placeLabel, PARTS, PART_CLEAN, partOf, partTitle, fmtPct, dm, pretty, leaveReasonLabel, leaveDaysIn, ST } from "./core.js";

const GREEN = [30, 59, 47], CREAM = [245, 240, 230], SAND = [200, 180, 138], SAGE = [127, 140, 106], LIGHT = [230, 220, 197], GREY = [102, 102, 102];
const W = 595.28, H = 841.89;

function newJsPdf() { return new window.jspdf.jsPDF({ unit: "pt", format: "a4" }); }
function bg(doc) { doc.setFillColor(...CREAM); doc.rect(0, 0, W, H, "F"); }
function rect(doc, x, y, w, h, c) { doc.setFillColor(...c); doc.rect(x, y, w, h, "F"); }
function txt(doc, s, x, y, { size = 9, bold = false, italic = false, color = [0, 0, 0], align = "left" } = {}) {
  doc.setFont("helvetica", bold ? "bold" : italic ? "italic" : "normal");
  doc.setFontSize(size); doc.setTextColor(...color);
  doc.text(String(s), x, y, { align });
}
function wrap(doc, s, size, width) {
  doc.setFont("helvetica", "normal"); doc.setFontSize(size);
  return doc.splitTextToSize(s, width);
}

function ailmentText(r) {
  const m = {};
  for (const e of r.sick) for (const a of e.ailments) m[a] = (m[a] || 0) + 1;
  return Object.entries(m).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, v]) => `${k} = ${v}`).join("      ");
}
function leaveText(r) {
  const m = {};
  for (const l of r.leaves) m[l.reason] = (m[l.reason] || 0) + 1;
  return ["last_saturday", "personal", "sick", "duty", "summer"].filter((k) => k in m).map((k) => `${leaveReasonLabel(k)} = ${m[k]}`).join("      ");
}

// Spacing levels for page 1, most comfortable first. The first level whose total height fits is used, so a student with a
// 7-year record (many sick / leave / competition lines) still gets everything, the signature included, on one page.
const LEVELS = [
  { rh: 13, gap: 8, hh: 100, det: 38, box: 104, cg: 14, bar: 26, cnt: 18, ln: 12, ml: 3, fs: 9, hd: 17 },
  { rh: 11.5, gap: 6, hh: 94, det: 36, box: 100, cg: 12, bar: 24, cnt: 17, ln: 11.5, ml: 3, fs: 8.6, hd: 17 },
  { rh: 10.5, gap: 5, hh: 86, det: 32, box: 92, cg: 10, bar: 22, cnt: 16, ln: 11, ml: 2, fs: 8.2, hd: 16 },
  { rh: 9.6, gap: 4, hh: 78, det: 28, box: 82, cg: 8, bar: 20, cnt: 15, ln: 10, ml: 2, fs: 7.6, hd: 15 },
  { rh: 8.8, gap: 3, hh: 70, det: 24, box: 72, cg: 6, bar: 19, cnt: 14, ln: 9.5, ml: 1, fs: 7, hd: 14 },
];
function pickLevel(rows, ail, leave, hasComp) {
  for (const L of LEVELS) {
    const total = L.hh + L.det + L.box + L.cg + 4 * (L.bar + L.hd) + rows * L.rh + 4 * L.gap
      + 2 * (L.bar + L.cnt + L.gap) + Math.min(ail, L.ml) * L.ln + Math.min(leave, L.ml) * L.ln
      + (hasComp ? L.bar + L.cnt + L.ln + L.gap : 0);
    if (total <= 762) return L;
  }
  return LEVELS[LEVELS.length - 1];
}
const clipLines = (lines, max) => (lines.length <= max ? lines : [...lines.slice(0, max - 1), lines[max - 1].replace(/\s*$/, "") + " ..."]);

function drawTop(doc, r, L) {
  const fs = L.fs;
  const s = L.hh / 100;
  rect(doc, 0, 0, W, L.hh, GREEN);
  txt(doc, "In the name of Allah, the Gracious, the Merciful", 297, 16 * s, { size: 9.5, italic: true, color: CREAM, align: "center" });
  txt(doc, "JAMIA AHMADIYYA INTERNATIONAL GHANA", 30, 38 * s, { size: 13, bold: true, color: CREAM });
  txt(doc, "STUDENT RECORD", 30, 53 * s, { size: 9, bold: true, color: SAND });
  txt(doc, r.student.name.slice(0, 40), 30, 76 * s, { size: 21 * (0.85 + 0.15 * s), bold: true, color: CREAM });
  const now = new Date();
  txt(doc, `Period: ${dm(r.from)} ${r.from.slice(0, 4)} to ${dm(r.to)} ${r.to.slice(0, 4)}     Printed: ${dm(now.toISOString().slice(0, 10))} ${now.getFullYear()}`, 30, 92 * s, { size: 9, color: SAND });
  let y = L.hh + 18 * s;
  [["Class", r.className], ["Country", r.student.country || "-"]].forEach(([k, v], i) => {
    txt(doc, k, 30 + i * 135, y + L.det * 0.2, { size: 8, color: GREY });
    txt(doc, v.slice(0, 24), 30 + i * 135, y + L.det * 0.6, { size: 11, bold: true });
  });
  y += L.det;
  // combined % + four bars
  doc.setFillColor(...LIGHT); doc.roundedRect(30, y, 535, L.box, 6, 6, "F");
  txt(doc, fmtPct(r.combined), 42, y + L.box * 0.56, { size: 30 * Math.min(1, 0.7 + L.box / 350), bold: true, color: GREEN });
  const base = y + L.box - 18, maxH = L.box - 48;
  doc.setDrawColor(...SAND); doc.setLineWidth(0.6); doc.line(180, base, 545, base);
  PARTS.forEach((k, i) => {
    const v = r.parts[k], cx = 180 + 45 + i * 92;
    const h = v == null ? 0 : Math.max(0, Math.min(maxH, (maxH * v) / 100));
    if (h > 0) rect(doc, cx - 17, base - h, 34, h, SAGE);
    txt(doc, fmtPct(v), cx, base - h - 4, { size: 8.5, bold: true, align: "center" });
    txt(doc, partTitle(k), cx, base + 10, { size: 8, bold: true, align: "center" });
  });
  y += L.box + L.cg;
  return y;
}

export function drawFirstPage(doc, r) {
  bg(doc);
  const rowsTotal = PARTS.reduce((a, k) => a + Math.max(r.acts.filter((c) => partOf(c.activity) === k).length, 1), 0);
  const ailAll = wrap(doc, ailmentText(r), 9, 520), leaveAll = wrap(doc, leaveText(r), 9, 520);
  const L = pickLevel(rowsTotal, Math.max(1, ailAll.length), Math.max(1, leaveAll.length), r.comps.length > 0);
  const fs = L.fs;
  let y = drawTop(doc, r, L);

  const rh = L.rh, ty = rh * 0.74, gap = L.gap;
  const titles = { salat: "SALAT", other: "ATTENDANCE IN JAMIA ACTIVITIES", sports: "SPORTS", clean: "CLEANLINESS" };
  const hdr = (cols) => {
    rect(doc, 30, y, 535, L.hd - 2, LIGHT);
    for (const [x, t, right] of cols) txt(doc, t, x, y + L.hd - 6, { size: Math.min(8.5, fs), bold: true, align: right ? "center" : "left" });
    y += L.hd;
  };
  const bar = (title, rightText) => {
    const bh = L.bar - 8;
    rect(doc, 30, y, 535, bh, GREEN);
    txt(doc, title, 36, y + bh - 5, { size: Math.min(10.5, fs + 1.5), bold: true, color: CREAM });
    if (rightText) txt(doc, rightText, 559, y + bh - 5, { size: Math.min(10.5, fs + 1.5), bold: true, color: CREAM, align: "right" });
    y += L.bar;
  };
  for (const k of PARTS) {
    const list = r.acts.filter((c) => partOf(c.activity) === k);
    const clean = k === PART_CLEAN;
    bar(titles[k], "Overall  " + fmtPct(r.parts[k]));
    if (clean) hdr([[36, "Activity", false], [300, "Number of inspections", true], [392, "Passed", true], [474, "Needed Improvements", true], [546, "%", true]]);
    else hdr([[36, "Activity", false], [285, "Attendance taken", true], [347, "Present", true], [401, "Late", true], [455, "Absent", true], [508, "Excused", true], [546, "%", true]]);
    for (const a of list) {
      txt(doc, a.activity.name.slice(0, 28), 36, y + ty, { size: fs });
      const cells = clean ? [[300, a.counted], [392, a.present], [474, a.absent]] : [[285, a.counted], [347, a.present], [401, a.late], [455, a.absent], [508, a.excused]];
      for (const [x, n] of cells) txt(doc, n, x, y + ty, { size: fs, align: "center" });
      txt(doc, fmtPct(a.pct), 546, y + ty, { size: fs, align: "center" });
      y += rh;
    }
    if (!list.length) { txt(doc, "No sheets in this period.", 36, y + ty, { size: fs }); y += rh; }
    y += gap;
  }
  const summary = (title, countText, emptyText, lines) => {
    bar(title);
    txt(doc, countText, 36, y + L.cnt - 9, { size: fs, bold: true });
    y += L.cnt;
    if (!lines.length) { txt(doc, emptyText, 36, y + L.ln - 3, { size: fs }); y += L.ln; }
    else for (const l of clipLines(lines, L.ml)) { txt(doc, l, 36, y + L.ln - 3, { size: fs }); y += L.ln; }
    y += gap;
  };
  const hosp = r.sick.filter((x) => x.place === "hospital").length;
  summary("SICK LEAVE", `Times sick: ${r.sick.length}      Hospital visits: ${hosp}      Hostel rest: ${r.sick.length - hosp}`, "No sick leave in this period.", r.sick.length ? ailAll : []);
  summary("JAMIA OFF-CAMPUS LEAVE", `Times on leave: ${r.leaves.length}      Days away: ${r.leaves.reduce((a, l) => a + leaveDaysIn(l, r.from, r.to), 0)}`, "No leave in this period.", r.leaves.length ? leaveAll : []);
  if (r.comps.length) {
    const n = (p) => r.comps.filter((x) => x[1] === p).length;
    const last = r.comps.slice(-3).map(([c, p]) => `${c.name.replace(/ Competition$/, "")} (${placeLabel(p)})`).join("      ");
    summary("MAJLIS-E-ILMI COMPETITIONS", `Position holder in ${r.comps.length} competition(s):      1st = ${n(1)}      2nd = ${n(2)}      3rd = ${n(3)}`, "", [wrap(doc, (r.comps.length > 3 ? "Latest: " : "") + last, fs, 520)[0]]);
  }
  if (y < 768) y = 768;
  rect(doc, 30, y + 22 - 8, 150, 0.8, [0, 0, 0]);
  txt(doc, "Date", 30, y + 34 - 8, { size: 9, color: GREY });
  rect(doc, 380, y + 22 - 8, 185, 0.8, [0, 0, 0]);
  txt(doc, "Housemaster", 380, y + 34 - 8, { size: 9, color: GREY });
}

function drawLaterPages(doc, r) {
  let y = 40;
  const np = () => { doc.addPage(); bg(doc); y = 40; };
  const headRow = (cols) => {
    rect(doc, 30, y, 535, 15, LIGHT);
    for (const [x, t] of cols) txt(doc, t, x, y + 11, { size: 8.5, bold: true });
    y += 17;
  };
  if (r.sick.length || r.leaves.length || r.comps.length) { np(); }
  if (r.sick.length) {
    txt(doc, `${r.student.name.slice(0, 40)} - sick leave record`, 30, y + 4, { size: 13, bold: true, color: GREEN }); y += 16;
    const sc = [[36, "Date"], [110, "Sickness"], [450, "Where"]];
    headRow(sc);
    for (const e of r.sick) {
      if (y + 14 > 805) { np(); headRow(sc); }
      txt(doc, e.date, 36, y + 9); txt(doc, e.ailments.join(", ").slice(0, 55), 110, y + 9); txt(doc, e.place === "hospital" ? "Hospital" : "Hostel rest", 450, y + 9);
      y += 14;
    }
    y += 18;
  }
  if (r.leaves.length) {
    if (y + 60 > 805) np();
    txt(doc, "JAMIA OFF-CAMPUS LEAVE RECORD", 30, y + 4, { size: 13, bold: true, color: GREEN }); y += 16;
    const lc = [[36, "From"], [170, "To"], [300, "Days"], [350, "Reason"]];
    headRow(lc);
    for (const e of r.leaves) {
      if (y + 14 > 805) { np(); headRow(lc); }
      txt(doc, pretty(e.from), 36, y + 9); txt(doc, pretty(e.to), 170, y + 9);
      txt(doc, String(Math.round((new Date(e.to) - new Date(e.from)) / 86400000) + 1), 300, y + 9); txt(doc, leaveReasonLabel(e.reason), 350, y + 9);
      y += 14;
    }
  }
  if (r.comps.length) {
    if (r.sick.length || r.leaves.length) y += 18;
    if (y + 60 > 805) np();
    txt(doc, "MAJLIS-E-ILMI COMPETITION RESULTS", 30, y + 4, { size: 13, bold: true, color: GREEN }); y += 16;
    const cc = [[36, "Date"], [120, "Competition"], [500, "Position"]];
    headRow(cc);
    for (const [c, p] of r.comps) {
      if (y + 14 > 805) { np(); headRow(cc); }
      txt(doc, pretty(c.date), 36, y + 9); txt(doc, c.name.slice(0, 62), 120, y + 9); txt(doc, placeLabel(p), 500, y + 9, { bold: true });
      y += 14;
    }
  }
  np();
  txt(doc, `${r.student.name.slice(0, 40)} - day-by-day log`, 30, y + 4, { size: 13, bold: true, color: GREEN }); y += 16;
  const cols = [[36, "Date"], [100, "Activity"], [235, "Status"], [325, "Taken at (taker's phone)"], [470, "Taken by"]];
  headRow(cols);
  const tint = { [ST.A]: [248, 212, 212], [ST.L]: [255, 239, 194], [ST.D]: [217, 228, 245], [ST.S]: [230, 220, 243], [ST.V]: [251, 227, 204], [ST.N]: [255, 224, 184] };
  for (const e of r.entries) {
    if (y + 14 > 805) { np(); headRow(cols); }
    const c = e.activity.type === "inspection" && e.code === ST.A ? null : tint[e.code];
    if (c) rect(doc, 30, y, 535, 13, c);
    txt(doc, e.date, 36, y + 9, { size: 8.5 }); txt(doc, e.name.slice(0, 30), 100, y + 9, { size: 8.5 });
    txt(doc, e.label, 235, y + 9, { size: 8.5 }); txt(doc, e.deviceLocal || "-", 325, y + 9, { size: 8.5 }); txt(doc, (e.takerName || "").slice(0, 18), 470, y + 9, { size: 8.5 });
    y += 14;
  }
  if (!r.entries.length) txt(doc, "No sheets recorded for this student in this period.", 36, y + 10, { size: 8.5 });
}


// ---------- Reports longer than one year: a different layout ----------
export const isLong = (r) => !!(r.years && r.years.length >= 2);
const SIG = (doc, y) => {
  rect(doc, 30, y + 14, 150, 0.8, [0, 0, 0]); txt(doc, "Date", 30, y + 26, { size: 9, color: GREY });
  rect(doc, 380, y + 14, 185, 0.8, [0, 0, 0]); txt(doc, "Housemaster", 380, y + 26, { size: 9, color: GREY });
};
function drawLongFirstPage(doc, r) {
  bg(doc);
  const L = LEVELS[0];
  let y = drawTop(doc, r, L);
  const bar = (title) => { rect(doc, 30, y, 535, 18, GREEN); txt(doc, title, 36, y + 13, { size: 10.5, bold: true, color: CREAM }); y += 26; };
  bar("YEAR BY YEAR");
  const cols = [[36, "Academic year", false], [190, "Salat", true], [260, "Activities", true], [330, "Sports", true], [400, "Cleanliness", true], [455, "Sick", true], [500, "Leave", true], [543, "Overall", true]];
  rect(doc, 30, y, 535, 15, LIGHT);
  for (const [x, t, c] of cols) txt(doc, t, x, y + 11, { size: 8.5, bold: true, align: c ? "center" : "left" });
  y += 17;
  const n = r.years.length, rh = Math.max(11, Math.min(17, 330 / n));
  r.years.forEach((yr, i) => {
    if (i % 2) rect(doc, 30, y - 1, 535, rh, [240, 233, 218]);
    const bold = { size: 9, bold: true };
    txt(doc, yr.label, 36, y + rh * 0.72, { size: 9 });
    [[190, yr.parts[PARTS[0]]], [260, yr.parts[PARTS[1]]], [330, yr.parts[PARTS[2]]], [400, yr.parts[PARTS[3]]]].forEach(([x, v]) => txt(doc, fmtPct(v), x, y + rh * 0.72, { size: 9, align: "center" }));
    [[455, yr.sick.length], [500, yr.leaves.length]].forEach(([x, v]) => txt(doc, String(v), x, y + rh * 0.72, { size: 9, align: "center" }));
    txt(doc, fmtPct(yr.combined), 543, y + rh * 0.72, { ...bold, align: "center" });
    y += rh;
  });
  y += 14;
  bar("TOTALS FOR THE WHOLE PERIOD");
  const hosp = r.sick.filter((x) => x.place === "hospital").length;
  const c = (p) => r.comps.filter((x) => x[1] === p).length;
  txt(doc, `Times sick: ${r.sick.length}      Hospital visits: ${hosp}      Hostel rest: ${r.sick.length - hosp}`, 36, y + 9, { size: 9, bold: true }); y += 18;
  txt(doc, `Times on leave: ${r.leaves.length}      Days away: ${r.leaves.reduce((a, l) => a + leaveDaysIn(l, r.from, r.to), 0)}`, 36, y + 9, { size: 9, bold: true }); y += 18;
  txt(doc, `Majlis-e-Ilmi positions: ${r.comps.length}      1st = ${c(1)}      2nd = ${c(2)}      3rd = ${c(3)}`, 36, y + 9, { size: 9, bold: true }); y += 18;
  txt(doc, "One full report page for each year follows, then the complete sick leave, off-campus leave and competition lists.", 36, y + 9, { size: 8.5, color: GREY });
  SIG(doc, 768);
}
function drawActivityPage(doc, r) {
  doc.addPage(); bg(doc);
  let y = 40;
  txt(doc, `${r.student.name.slice(0, 40)} - attendance by activity (whole period)`, 30, y + 4, { size: 13, bold: true, color: GREEN }); y += 22;
  const titles = { salat: "SALAT", other: "ATTENDANCE IN JAMIA ACTIVITIES", sports: "SPORTS", clean: "CLEANLINESS" };
  for (const k of PARTS) {
    const list = r.acts.filter((c) => partOf(c.activity) === k), clean = k === PART_CLEAN;
    rect(doc, 30, y, 535, 18, GREEN); txt(doc, titles[k], 36, y + 13, { size: 10.5, bold: true, color: CREAM });
    txt(doc, "Overall  " + fmtPct(r.parts[k]), 559, y + 13, { size: 10.5, bold: true, color: CREAM, align: "right" }); y += 26;
    const cols = clean ? [[36, "Activity", false], [300, "Number of inspections", true], [392, "Passed", true], [474, "Needed Improvements", true], [546, "%", true]]
      : [[36, "Activity", false], [285, "Attendance taken", true], [347, "Present", true], [401, "Late", true], [455, "Absent", true], [508, "Excused", true], [546, "%", true]];
    rect(doc, 30, y, 535, 15, LIGHT);
    for (const [x, t, c] of cols) txt(doc, t, x, y + 11, { size: 8.5, bold: true, align: c ? "center" : "left" });
    y += 17;
    for (const a of list) {
      txt(doc, a.activity.name.slice(0, 28), 36, y + 10, { size: 9 });
      const cells = clean ? [[300, a.counted], [392, a.present], [474, a.absent]] : [[285, a.counted], [347, a.present], [401, a.late], [455, a.absent], [508, a.excused]];
      for (const [x, v] of cells) txt(doc, v, x, y + 10, { size: 9, align: "center" });
      txt(doc, fmtPct(a.pct), 546, y + 10, { size: 9, align: "center" });
      y += 14;
    }
    if (!list.length) { txt(doc, "No sheets in this period.", 36, y + 10, { size: 9 }); y += 14; }
    y += 14;
  }
}

export function studentPdf(r) {
  const doc = newJsPdf();
  if (isLong(r)) { drawLongFirstPage(doc, r); r.years.forEach((yr) => { doc.addPage(); drawFirstPage(doc, yr); }); }
  else drawFirstPage(doc, r);
  drawLaterPages(doc, r);
  return doc;
}
export function classPdf(records) {
  const doc = newJsPdf();
  records.forEach((r, i) => { if (i) doc.addPage(); if (isLong(r)) drawLongFirstPage(doc, r); else drawFirstPage(doc, r); });
  return doc;
}

// Class / whole-school ranking table
export function reportPdf(title, subtitle, rows, ranks) {
  const doc = newJsPdf();
  let y = 0;
  const head = () => { bg(doc); rect(doc, 0, 0, W, 60, GREEN); txt(doc, title, 30, 28, { size: 15, bold: true, color: CREAM }); txt(doc, subtitle, 30, 46, { size: 9, color: SAND }); y = 78; };
  head();
  let prev = "";
  rows.forEach((r, i) => {
    if (y > 800) { doc.addPage(); head(); prev = ""; }
    if (r.student.classId !== prev) {
      prev = r.student.classId; y += 4;
      rect(doc, 30, y, 535, 18, GREEN); txt(doc, r.className, 36, y + 13, { size: 10.5, bold: true, color: CREAM });
      txt(doc, "Salat  Jamia  Sports  Clean  Overall", 559, y + 13, { size: 8.5, bold: true, color: CREAM, align: "right" }); y += 22;
    }
    txt(doc, ranks[i] ? "#" + ranks[i] : "-", 36, y + 9); txt(doc, r.student.name.slice(0, 34), 70, y + 9);
    const xs = [368, 416, 466, 512, 559];
    [r.parts.salat, r.parts.other, r.parts.sports, r.parts.clean, r.pct].forEach((v, j) => txt(doc, fmtPct(v), xs[j], y + 9, { align: "right", bold: j === 4 }));
    y += 13;
  });
  return doc;
}
