// Exam results from the Jamia Exams Database backup (jamia-exams-backup-*.json): calculation (ported from the exams app so the
// totals, positions and remarks are the same), matching exams-app students to attendance-app students, and the results PDF.
export const EXAM_NAME = { s1: "First Semester", s2: "Second Semester", annual: "Annual" };
const baseClass = (id) => String(id).replace(/-[ab]$/, "");
const round2 = (x) => Math.round(x * 100) / 100;

// ---------- calculation (same rules as the exams app) ----------
const sat = (doc, sem, sid) => { const m = doc[sem].marks; for (const k in m) if (m[k][sid] != null) return true; return false; };
const semHasMarks = (doc, sem) => { const m = doc[sem].marks; for (const k in m) for (const s in m[k]) if (m[k][s] != null) return true; return false; };
function examStats(doc, exam, repeatFrom) {
  // a subject with only:"s1"/"s2" was examined in that semester alone
  const subs = exam === "annual" ? doc.subjects : doc.subjects.filter((s) => !s.only || s.only === exam), maxTotal = subs.reduce((a, s) => a + (+s.max || 0), 0), rows = [];
  for (const sid of Object.keys(doc.roster)) {
    const a = sat(doc, "s1", sid), b = sat(doc, "s2", sid); let marks = {}, parts = null;
    const get = (sem, s) => { const v = (doc[sem].marks[s.id] || {})[sid]; return v == null ? null : +v; };
    const a1 = a && !(doc.s2only || []).includes(sid);
    if (exam === "annual") {
      if (!b) continue;
      parts = { s1: {}, s2: {} };
      for (const s of subs) {
        const m1 = get("s1", s), m2 = get("s2", s); parts.s1[s.id] = a1 ? m1 : null; parts.s2[s.id] = b ? m2 : null;
        marks[s.id] = s.only ? ((s.only === "s1" ? m1 : m2) || 0) : a1 && b ? ((m1 || 0) + (m2 || 0)) / 2 : a1 ? (m1 || 0) : (m2 || 0);
      }
    } else {
      if (!(exam === "s1" ? a : b)) continue;
      for (const s of subs) marks[s.id] = get(exam, s);
    }
    const total = subs.reduce((t, s) => t + (marks[s.id] || 0), 0);
    const fails = subs.filter((s) => +s.pass > 0 && (marks[s.id] || 0) < +s.pass).map((s) => s.id);
    let remark = "";
    if (exam === "annual") remark = !fails.length ? "Pass" : fails.length >= (+repeatFrom || 99) ? "Repeated" : "Comp.";
    rows.push({ late: exam === "annual" && !a1, sid, roll: doc.roster[sid], marks, parts, total, pct: maxTotal ? total / maxTotal * 100 : 0, fails, remark, pos: 0 });
  }
  const sorted = [...rows].sort((x, y) => (x.late - y.late) || (y.total - x.total));
  sorted.forEach((r, i) => { r.pos = i && sorted[i - 1].late === r.late && Math.abs(sorted[i - 1].total - r.total) < 1e-9 ? sorted[i - 1].pos : i + 1; });
  return { rows, subs, maxTotal, count: rows.length };
}
function compList(doc, repeatFrom) {
  if (!semHasMarks(doc, "s2")) return null;
  const st = examStats(doc, "annual", repeatFrom), out = [];
  for (const r of st.rows) {
    if (!r.fails.length || r.remark === "Repeated") continue;
    for (const f of r.fails) { const s = st.subs.find((x) => x.id === f), v = (((doc.comp || {}).marks || {})[f] || {})[r.sid]; out.push({ row: r, s, mark: v == null ? null : +v, passed: v == null ? null : +v >= +s.pass }); }
  }
  return out;
}
function finalRemark(row, comps) { // the annual remark after any compartment papers
  if (row.remark !== "Comp.") return row.remark;
  const l = (comps || []).filter((x) => x.row.sid === row.sid);
  if (!l.length || l.some((x) => x.mark == null)) return "Comp.";
  return l.every((x) => x.passed) ? "Passed after compartment" : "Failed compartment";
}

/** backup (parsed JSON) -> { names: {examId: name}, hist: {examId: [entry]} }. Entries are oldest first. */
export function buildHistories(b) {
  if (!b || b.app !== "jamia-exams" || !b.results || !b.students) throw new Error("This is not a Jamia Exams Database backup file.");
  const rf = +(b.config || {}).repeatFrom || 99;
  const docs = Object.values(b.results).filter((d) => d && d.roster && d.subjects).sort((x, y) => x.year.localeCompare(y.year) || String(x.classId).localeCompare(String(y.classId)));
  for (const d of docs) { d.s1 = d.s1 || {}; d.s2 = d.s2 || {}; d.s1.marks = d.s1.marks || {}; d.s2.marks = d.s2.marks || {}; }
  const hist = {};
  for (const doc of docs) for (const exam of ["s1", "s2", "annual"]) {
    if (!semHasMarks(doc, exam === "annual" ? "s2" : exam)) continue;
    const st = examStats(doc, exam, rf), comps = exam === "annual" ? compList(doc, rf) : [];
    for (const row of st.rows) {
      const subs = st.subs.map((s) => ({ n: s.name, max: +s.max || 0, pass: +s.pass || 0, m: row.marks[s.id] == null ? null : round2(row.marks[s.id]),
        a: row.parts ? (row.parts.s1[s.id] == null ? null : row.parts.s1[s.id]) : null, b: row.parts ? (row.parts.s2[s.id] == null ? null : row.parts.s2[s.id]) : null, f: row.fails.includes(s.id) ? 1 : 0,
        t: (exam === "annual" ? [(doc.s1.teachers || {})[s.id], (doc.s2.teachers || {})[s.id]] : [(doc[exam].teachers || {})[s.id]]).filter((x, i, a) => x && a.indexOf(x) === i).join(", ") }));
      const cl = (comps || []).filter((x) => x.row.sid === row.sid && x.mark != null).map((x) => ({ n: x.s.name, m: x.mark, ok: x.passed ? 1 : 0 }));
      const rep = docs.some((d) => d.year < doc.year && baseClass(d.classId) === baseClass(doc.classId) && row.sid in d.roster) ? 1 : 0;
      (hist[row.sid] ||= []).push({ y: doc.year, cn: doc.className || doc.classId, roll: String(doc.roster[row.sid]), e: exam, subs, total: round2(row.total), max: st.maxTotal,
        pct: round2(row.pct), pos: row.pos, of: st.count, rem: exam === "annual" ? finalRemark(row, comps) : "", comp: cl, rep });
    }
  }
  const names = {}; for (const id of Object.keys(hist)) names[id] = ((b.students[id] || {}).n || "").trim();
  return { names, hist };
}

// ---------- matching exam-app students to attendance-app students ----------
const tokens = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
export const keyOf = (s) => tokens(s).sort().join(" ");
const dice = (a, b) => { const A = new Set(tokens(a)), B = new Set(tokens(b)); if (!A.size || !B.size) return 0; let n = 0; for (const t of A) if (B.has(t)) n++; return 2 * n / (A.size + B.size); };
/** spelling-tolerant score: compares the letters only (so "Lungipaa" ~ "Lungi Pa"), with the words in either order */
const bg = (t) => { const m = new Map(); for (let i = 0; i < t.length - 1; i++) { const g = t.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
const cdice = (a, b) => { const x = bg(a), y = bg(b); let n = 0, tx = 0, ty = 0; for (const v of x.values()) tx += v; for (const v of y.values()) ty += v; for (const [g, v] of x) n += Math.min(v, y.get(g) || 0); return tx + ty ? 2 * n / (tx + ty) : 0; };
const fuzzy = (a, b) => { const ta = tokens(a), tb = tokens(b); return Math.max(dice(a, b), cdice(ta.join(""), tb.join("")), cdice([...ta].sort().join(""), [...tb].sort().join(""))); };
/** students = [{id,name}], names = {examId: name}. -> { matched:[{sid,name,ids}], suggested:[{sid,name,ids,examName,score}], unmatched:[{sid,name}] } */
export function matchStudents(students, names) {
  const byKey = {}; for (const [id, n] of Object.entries(names)) (byKey[keyOf(n)] ||= []).push(id);
  const matched = [], suggested = [], unmatched = [];
  for (const s of students) {
    const ids = byKey[keyOf(s.name)];
    if (ids && ids.length) { matched.push({ sid: s.id, name: s.name, ids }); continue; }
    let best = null, bs = 0;
    for (const [id, n] of Object.entries(names)) { const sc = fuzzy(s.name, n); if (sc > bs) { bs = sc; best = { id, n }; } }
    if (best && bs >= 0.7) suggested.push({ sid: s.id, name: s.name, ids: [best.id], examName: best.n, score: bs });
    else unmatched.push({ sid: s.id, name: s.name });
  }
  return { matched, suggested, unmatched };
}
/** people in the backup who are not linked to a current student: grouped by name so a person registered twice appears once -> [{key, ids, name}] */
export function leftovers(data, usedIds) {
  const g = {};
  for (const [id, n] of Object.entries(data.names)) if (!usedIds.has(id) && (data.hist[id] || []).length) (g[keyOf(n)] ||= []).push(id);
  return Object.values(g).map((ids) => { ids.sort(); return { key: "x_" + ids[0], ids, name: ids.map((i) => data.names[i]).join(" / ") }; });
}
/** merge the histories of one or more exam ids (the same person registered twice) into one list, oldest first */
export function entriesFor(hist, ids) {
  const out = ids.flatMap((id) => hist[id] || []);
  const seen = new Set();
  return out.filter((e) => { const k = e.y + "|" + e.cn + "|" + e.e; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((x, y) => x.y.localeCompare(y.y) || ["s1", "s2", "annual"].indexOf(x.e) - ["s1", "s2", "annual"].indexOf(y.e));
}
export const fmtMark = (v) => (v == null ? "-" : Number.isInteger(v) ? String(v) : String(round2(v)));

// ---------- PDF (same layout as the exams app's student report, under the normal Jamia header) ----------
const GREEN = [30, 59, 47], CREAM = [245, 240, 230], SAND = [200, 180, 138], SAGE = [127, 140, 106], GREY = [102, 102, 102], ROW = [250, 246, 236];
const W = 595.28, H = 841.89, X = 30;
const ascii = (s) => String(s).replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, "-");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** opts: { semesters: include first/second semester results as well as the annual results } */
export function examPdf(studentName, className, entries, opts = {}) {
  const list = entries.filter((e) => opts.semesters || e.e === "annual");
  const doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4" });
  try { doc.viewerPreferences({ PrintScaling: "None", FitWindow: true }); } catch (e) { /* ignore */ }
  const T = (s, x, y, o = {}) => { doc.setFont("helvetica", o.bold ? "bold" : o.italic ? "italic" : "normal"); doc.setFontSize(o.size || 9); doc.setTextColor(...(o.color || [0, 0, 0])); doc.text(ascii(s), x, y, { align: o.align || "left" }); };
  const R = (x, y, w, h, c) => { doc.setFillColor(...c); doc.rect(x, y, w, h, "F"); };
  const clip = (s, size, w) => { doc.setFont("helvetica", "normal"); doc.setFontSize(size); const l = doc.splitTextToSize(ascii(s), w); return l.length > 1 ? l[0].replace(/\s*\S?$/, "") + "..." : (l[0] || ""); };
  const now = new Date(), printed = `${now.getDate()} ${MON[now.getMonth()]} ${now.getFullYear()}`;
  let y = 0;
  const page = (first) => {
    R(0, 0, W, H, [255, 255, 255]);
    if (first) {
      R(0, 0, W, 100, GREEN);
      T("In the name of Allah, the Gracious, the Merciful", W / 2, 16, { size: 9.5, italic: true, color: CREAM, align: "center" });
      T("JAMIA AHMADIYYA INTERNATIONAL GHANA", X, 38, { size: 13, bold: true, color: CREAM });
      T("STUDENT EXAMINATION REPORT", X, 53, { size: 9, bold: true, color: SAND });
      T(String(studentName).slice(0, 40), X, 78, { size: 21, bold: true, color: CREAM });
      const yrs = list.map((e) => e.y).sort(), last = list[list.length - 1];
      T(list.length ? `${list.length} exam${list.length === 1 ? "" : "s"}   |   ${yrs[0]} to ${yrs[yrs.length - 1]}   |   latest class ${last.cn}, roll ${last.roll}     Printed: ${printed}` : `Printed: ${printed}`, X, 92, { size: 9, color: SAND });
      y = 116;
    } else y = 36;
  };
  const ensure = (h) => { if (y + h > H - 40) { doc.addPage(); page(false); return true; } return false; };
  page(true);
  if (!list.length) T("No exam results on record.", X, y + 10, { size: 10, color: GREY });

  // a table: cols = [{l, w, a:"l"|"r"}], rows = [{c:[...], bold, fill}]; the header row repeats on a new page
  // pre() draws a heading (preH tall) just above the table; a table never leaves fewer than 3 rows (or starts with fewer than 5) on a page
  const table = (cols, rows, { rh = 15, pre = null, preH = 0 } = {}) => {
    const head = () => { let x = X; for (const c of cols) { R(x, y, c.w, 16, GREEN); T(c.l, c.a === "r" ? x + c.w - 4 : x + 4, y + 11, { size: 8, bold: true, color: [255, 255, 255], align: c.a === "r" ? "right" : "left" }); x += c.w; } y += 16; };
    const fit = Math.floor((H - 40 - y - 16 - preH) / rh); let brk = -1;
    if (fit < rows.length) { brk = rows.length - fit < 3 ? rows.length - 3 : fit; if (brk < 5) { doc.addPage(); page(false); brk = -1; } }
    if (pre) pre();
    head();
    rows.forEach((r, i) => {
      if (i === brk) { doc.addPage(); page(false); head(); } else if (ensure(rh)) head();
      let x = X; if (r.fill !== false && i % 2 === 0) R(X, y, cols.reduce((a, c) => a + c.w, 0), rh, ROW);
      cols.forEach((c, k) => {
        doc.setDrawColor(...SAND); doc.setLineWidth(0.5); doc.rect(x, y, c.w, rh, "S");
        const v = clip(String(r.c[k] ?? ""), 8.5, c.w - 8);
        T(v, c.a === "r" ? x + c.w - 4 : x + 4, y + 10.5, { size: 8.5, bold: !!r.bold || (c.b && k === c.bi), align: c.a === "r" ? "right" : "left" });
        x += c.w;
      });
      y += rh;
    });
  };
  const heading = (s) => { ensure(30); T(s.toUpperCase(), X, y + 10, { size: 10.5, bold: true, color: GREEN }); y += 18; };

  // summary
  if (list.length) {
    const sumCols = [{ l: "Year", w: 55 }, { l: "Class", w: 70 }, { l: "Roll", w: 35 }, { l: "Exam", w: 55 }, { l: "Total", w: 85, a: "r" }, { l: "%", w: 45, a: "r" }, { l: "Position", w: 55 }, { l: "Compartments", w: 80 }, { l: "Remark", w: 55 }];
    table(sumCols, list.map((e) => ({ c: [e.y, e.cn + (e.rep ? " (R)" : ""), e.roll, EXAM_NAME[e.e].replace(" Semester", " Sem"), `${fmtMark(e.total)} / ${e.max}`, e.pct.toFixed(2), `${e.pos} of ${e.of}`,
      e.comp.length ? e.comp.map((c) => `${c.n} ${fmtMark(c.m)}`).join(", ") : "-", e.rem ? (e.rem === "Comp." ? "Comp." : e.rem === "Passed after compartment" ? "Pass (comp.)" : e.rem === "Failed compartment" ? "Failed comp." : e.rem) : "-"] })), { preH: 0 });
    y += 16;
    // charts
    const chart = (title, labels, vals, o) => {
      const h = 118; ensure(h + 22); heading(title);
      const L = X + 30, Rr = W - X - 12, top = y + 10, bot = y + h - 22, n = vals.length;
      doc.setDrawColor(215, 215, 215); doc.setLineWidth(0.4);
      let lo, hi, ticks;
      if (o.invert) { const u = [...new Set(vals)].sort((a, b) => a - b); lo = u[0]; hi = u[u.length - 1]; if (lo === hi) { lo = Math.max(1, lo - 1); hi = hi + 1; }
        const step = hi - lo <= 8 ? 1 : hi - lo <= 16 ? 2 : hi - lo <= 40 ? 5 : 10; ticks = []; for (let t = lo; t < hi; t += step) ticks.push(t); ticks.push(hi); } // every step on the scale, not only the ranks reached
      else { lo = Math.max(0, Math.floor((Math.min(...vals) - 3) / 10) * 10); hi = Math.min(100, Math.ceil((Math.max(...vals) + 2) / 10) * 10); if (hi - lo < 20) lo = Math.max(0, hi - 20); ticks = []; for (let t = lo; t <= hi; t += 10) ticks.push(t); }
      const ty = (v) => (o.invert ? top + (v - lo) / (hi - lo) * (bot - top) : bot - (v - lo) / (hi - lo) * (bot - top));
      for (const t of ticks) { doc.line(L, ty(t), Rr, ty(t)); T(String(t), L - 6, ty(t) + 2.5, { size: 7, color: GREY, align: "right" }); }
      const px = (i) => (n === 1 ? (L + Rr) / 2 : L + 18 + i * ((Rr - L - 36) / (n - 1)));
      doc.setDrawColor(...SAGE); doc.setLineWidth(1.6);
      for (let i = 1; i < n; i++) doc.line(px(i - 1), ty(vals[i - 1]), px(i), ty(vals[i]));
      vals.forEach((v, i) => { doc.setFillColor(...GREEN); doc.circle(px(i), ty(v), 2.6, "F"); T(o.fmt(v), px(i), ty(v) - 6, { size: 7.5, bold: true, align: "center" }); });
      labels.forEach((lb, i) => T(lb, px(i), bot + 12, { size: n > 12 ? 5.5 : 7, color: GREY, align: "center" }));
      y += h;
    };
    const labels = list.map((e) => e.cn + (e.e === "annual" ? "" : e.e === "s1" ? " S1" : " S2"));
    chart("Class position", labels, list.map((e) => e.pos), { invert: true, fmt: (v) => String(v) });
    chart("Percentage", labels, list.map((e) => e.pct), { fmt: (v) => v.toFixed(1) + "%" });
  }

  // one table per exam
  for (const e of list) {
    const ann = e.e === "annual";
    const pre = () => {
      y += 6;
      T(`${e.y}  |  ${e.cn.toUpperCase()}${e.rep ? " (REPEAT)" : ""}  |  ${EXAM_NAME[e.e].toUpperCase()}`, X, y + 10, { size: 10.5, bold: true, color: GREEN });
      T(`Roll ${e.roll}     Position ${e.pos} of ${e.of}     ${e.pct.toFixed(2)}%     ${e.rem ? (e.rem === "Comp." ? "Compartment" : e.rem) : ""}`, W - X, y + 10, { size: 8.5, align: "right" });
      y += 16;
    };
    const cols = ann ? [{ l: "Subject", w: 132 }, { l: "Out of", w: 42, a: "r" }, { l: "Pass mark", w: 50, a: "r" }, { l: "Semester 1", w: 62, a: "r" }, { l: "Semester 2", w: 62, a: "r" }, { l: "Average", w: 56, a: "r" }, { l: "Status", w: 44 }, { l: "Teacher", w: 87 }]
      : [{ l: "Subject", w: 150 }, { l: "Out of", w: 50, a: "r" }, { l: "Pass mark", w: 60, a: "r" }, { l: "Marks", w: 70, a: "r" }, { l: "Status", w: 55 }, { l: "Teacher", w: 150 }];
    const status = (s) => (s.f ? "Fail" : s.pass ? "Pass" : "-");
    const rows = e.subs.map((s) => ({ c: ann ? [s.n, s.max, s.pass || "-", fmtMark(s.a), fmtMark(s.b), fmtMark(s.m), status(s), s.t || ""] : [s.n, s.max, s.pass || "-", fmtMark(s.m), status(s), s.t || ""] }));
    rows.push({ bold: true, fill: false, c: ann ? ["Total", e.max, "", "", "", fmtMark(e.total), "", ""] : ["Total", e.max, "", fmtMark(e.total), "", ""] });
    table(cols, rows, { pre, preH: 22 });
    if (e.comp.length) { T("Compartment papers: " + e.comp.map((c) => `${c.n} ${fmtMark(c.m)} (${c.ok ? "passed" : "failed"})`).join(", "), X, y + 11, { size: 8.5, color: GREY }); y += 14; }
    y += 8;
  }
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); T(`${studentName}    Page ${i} of ${n}`, W / 2, H - 22, { size: 7.5, color: GREY, align: "center" }); }
  return doc;
}
