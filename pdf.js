// PDF reports (jsPDF). Page 1 of a student record mirrors the Android layout; everything fits on one page, signature included.
import { PARTS, PART_CLEAN, partOf, partTitle, fmtPct, dm, pretty, leaveReasonLabel, leaveDaysIn, ST } from "./core.js";

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
  return ["last_saturday", "personal", "sick"].filter((k) => k in m).map((k) => `${leaveReasonLabel(k)} = ${m[k]}`).join("      ");
}

export function drawFirstPage(doc, r) {
  bg(doc);
  rect(doc, 0, 0, W, 100, GREEN);
  txt(doc, "In the name of Allah, the Gracious, the Merciful", 297, 16, { size: 9.5, italic: true, color: CREAM, align: "center" });
  txt(doc, "JAMIA AHMADIYYA INTERNATIONAL GHANA", 30, 38, { size: 13, bold: true, color: CREAM });
  txt(doc, "STUDENT RECORD", 30, 53, { size: 9, bold: true, color: SAND });
  txt(doc, r.student.name.slice(0, 40), 30, 76, { size: 21, bold: true, color: CREAM });
  const now = new Date();
  txt(doc, `Period: ${dm(r.from)} ${r.from.slice(0, 4)} to ${dm(r.to)} ${r.to.slice(0, 4)}     Printed: ${dm(now.toISOString().slice(0, 10))} ${now.getFullYear()}`, 30, 92, { size: 9, color: SAND });
  let y = 118;
  [["Class", r.className], ["Country", r.student.country || "-"]].forEach(([k, v], i) => {
    txt(doc, k, 30 + i * 135, y + 8, { size: 8, color: GREY });
    txt(doc, v.slice(0, 24), 30 + i * 135, y + 23, { size: 11, bold: true });
  });
  y += 38;
  // combined % + four bars
  doc.setFillColor(...LIGHT); doc.roundedRect(30, y, 535, 104, 6, 6, "F");
  txt(doc, fmtPct(r.combined), 42, y + 58, { size: 30, bold: true, color: GREEN });
  const base = y + 86;
  doc.setDrawColor(...SAND); doc.setLineWidth(0.6); doc.line(180, base, 545, base);
  PARTS.forEach((k, i) => {
    const v = r.parts[k], cx = 180 + 45 + i * 92;
    const h = v == null ? 0 : Math.max(0, Math.min(56, (56 * v) / 100));
    if (h > 0) rect(doc, cx - 17, base - h, 34, h, SAGE);
    txt(doc, fmtPct(v), cx, base - h - 4, { size: 8.5, bold: true, align: "center" });
    txt(doc, partTitle(k), cx, base + 10, { size: 8, bold: true, align: "center" });
  });
  y += 118;

  // fit everything including the signature on this page
  const rowsTotal = PARTS.reduce((a, k) => a + Math.max(r.acts.filter((c) => partOf(c.activity) === k).length, 1), 0);
  const ailLines = Math.max(1, wrap(doc, ailmentText(r), 9, 520).length);
  const leaveLines = Math.max(1, wrap(doc, leaveText(r), 9, 520).length);
  const gap = 8;
  const fixed = 4 * 43 + 2 * 44 + 6 * gap + (ailLines + leaveLines) * 12;
  const rh = Math.max(9.5, Math.min(13, (762 - y - fixed) / rowsTotal));
  const ty = rh * 0.72;

  const titles = { salat: "SALAT", other: "ATTENDANCE IN JAMIA ACTIVITIES", sports: "SPORTS", clean: "CLEANLINESS" };
  const hdr = (cols) => {
    rect(doc, 30, y, 535, 15, LIGHT);
    for (const [x, t, right] of cols) txt(doc, t, x, y + 11, { size: 8.5, bold: true, align: right ? "center" : "left" });
    y += 17;
  };
  const bar = (title, rightText) => {
    rect(doc, 30, y, 535, 18, GREEN);
    txt(doc, title, 36, y + 13, { size: 10.5, bold: true, color: CREAM });
    if (rightText) txt(doc, rightText, 559, y + 13, { size: 10.5, bold: true, color: CREAM, align: "right" });
    y += 26;
  };
  for (const k of PARTS) {
    const list = r.acts.filter((c) => partOf(c.activity) === k);
    const clean = k === PART_CLEAN;
    bar(titles[k], "Overall  " + fmtPct(r.parts[k]));
    if (clean) hdr([[36, "Activity", false], [300, "Number of inspections", true], [392, "Passed", true], [474, "Needed Improvements", true], [546, "%", true]]);
    else hdr([[36, "Activity", false], [285, "Attendance taken", true], [347, "Present", true], [401, "Late", true], [455, "Absent", true], [508, "Excused", true], [546, "%", true]]);
    for (const a of list) {
      txt(doc, a.activity.name.slice(0, 28), 36, y + ty, { size: 9 });
      const cells = clean ? [[300, a.counted], [392, a.present], [474, a.absent]] : [[285, a.counted], [347, a.present], [401, a.late], [455, a.absent], [508, a.excused]];
      for (const [x, n] of cells) txt(doc, n, x, y + ty, { size: 9, align: "center" });
      txt(doc, fmtPct(a.pct), 546, y + ty, { size: 9, align: "center" });
      y += rh;
    }
    if (!list.length) { txt(doc, "No sheets in this period.", 36, y + ty, { size: 9 }); y += rh; }
    y += gap;
  }
  // sick summary
  bar("SICK LEAVE");
  const hosp = r.sick.filter((x) => x.place === "hospital").length;
  txt(doc, `Times sick: ${r.sick.length}      Hospital visits: ${hosp}      Hostel rest: ${r.sick.length - hosp}`, 36, y + 9, { size: 9, bold: true });
  y += 18;
  if (!r.sick.length) { txt(doc, "No sick leave in this period.", 36, y + 9, { size: 9 }); y += 12; }
  else for (const l of wrap(doc, ailmentText(r), 9, 520)) { txt(doc, l, 36, y + 9, { size: 9 }); y += 12; }
  y += gap;
  bar("JAMIA OFF-CAMPUS LEAVE");
  txt(doc, `Times on leave: ${r.leaves.length}      Days away: ${r.leaves.reduce((a, l) => a + leaveDaysIn(l, r.from, r.to), 0)}`, 36, y + 9, { size: 9, bold: true });
  y += 18;
  if (!r.leaves.length) { txt(doc, "No leave in this period.", 36, y + 9, { size: 9 }); y += 12; }
  else for (const l of wrap(doc, leaveText(r), 9, 520)) { txt(doc, l, 36, y + 9, { size: 9 }); y += 12; }
  y += gap;
  if (y < 768) y = 768;
  rect(doc, 30, y + 22, 150, 0.8, [0, 0, 0]);
  txt(doc, "Date", 30, y + 34, { size: 9, color: GREY });
  rect(doc, 380, y + 22, 185, 0.8, [0, 0, 0]);
  txt(doc, "Housemaster", 380, y + 34, { size: 9, color: GREY });
}

function drawLaterPages(doc, r) {
  let y = 40;
  const np = () => { doc.addPage(); bg(doc); y = 40; };
  const headRow = (cols) => {
    rect(doc, 30, y, 535, 15, LIGHT);
    for (const [x, t] of cols) txt(doc, t, x, y + 11, { size: 8.5, bold: true });
    y += 17;
  };
  if (r.sick.length || r.leaves.length) { np(); }
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

export function studentPdf(r) {
  const doc = newJsPdf();
  drawFirstPage(doc, r);
  drawLaterPages(doc, r);
  return doc;
}
export function classPdf(records) {
  const doc = newJsPdf();
  records.forEach((r, i) => { if (i) doc.addPage(); drawFirstPage(doc, r); });
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
