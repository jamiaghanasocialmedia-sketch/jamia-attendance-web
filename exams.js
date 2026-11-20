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
/** exam-app spellings that are corrected to the name used in the attendance system (key = sorted lower-case words) */
const NAME_FIX = { "egyir suley": "Sulaiman Egyir Junior" };
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
  const names = {}; for (const id of Object.keys(hist)) { const n = ((b.students[id] || {}).n || "").trim(); names[id] = NAME_FIX[keyOf(n)] || n; }
  return { names, hist };
}

// ---------- matching exam-app students to attendance-app students ----------
const tokens = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
export const keyOf = (s) => tokens(s).sort().join(" ");
const bgOf = (t) => { const m = new Map(); for (let i = 0; i < t.length - 1; i++) { const g = t.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
const memo = new Map();
/** each name is analysed once: words, letters-only forms (words in given order and sorted) and their letter pairs */
const prep = (s) => {
  let o = memo.get(s); if (o) return o;
  const t = tokens(s), a = t.join(""), b = [...t].sort().join("");
  o = { A: new Set(t), ga: bgOf(a), na: Math.max(0, a.length - 1), gb: bgOf(b), nb: Math.max(0, b.length - 1) };
  memo.set(s, o); return o;
};
const pdice = (x, y, nx, ny) => { if (nx + ny === 0) return 0; let n = 0; for (const [g, v] of x) { const w = y.get(g); if (w) n += v < w ? v : w; } return 2 * n / (nx + ny); };
/** spelling-tolerant score: words (any order) or letters only (so "Lungipaa" ~ "Lungi Pa") */
const fuzzy = (a, b) => {
  const p = prep(a), q = prep(b); let n = 0;
  if (p.A.size && q.A.size) { for (const t of p.A) if (q.A.has(t)) n++; n = 2 * n / (p.A.size + q.A.size); }
  return Math.max(n, pdice(p.ga, q.ga, p.na, q.na), pdice(p.gb, q.gb, p.nb, q.nb));
};
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
      T(list.length ? `${yrs[0]} to ${yrs[yrs.length - 1]}     Printed: ${printed}` : `Printed: ${printed}`, X, 92, { size: 9, color: SAND });
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
      let x = X; const tw = cols.reduce((a, c) => a + c.w, 0);
      if (r.total) R(X, y, tw, rh, CREAM); else if (r.fill !== false && i % 2 === 0) R(X, y, tw, rh, ROW);
      cols.forEach((c, k) => {
        const val = String(r.c[k] ?? ""), v = clip(val, 8.5, c.w - 8);
        const col = c.status ? (/^fail/i.test(val) ? [178, 34, 34] : /^pass/i.test(val) ? [30, 110, 60] : /^comp/i.test(val) ? [176, 110, 20] : [0, 0, 0]) : [0, 0, 0];
        T(v, c.a === "r" ? x + c.w - 4 : x + 4, y + 10.5, { size: 8.5, bold: !!r.bold || (c.b && k === c.bi) || (c.status && col[0] !== 0), color: col, align: c.a === "r" ? "right" : "left" });
        x += c.w;
      });
      doc.setLineWidth(r.total ? 1 : 0.4); doc.setDrawColor(...(r.total ? GREEN : [228, 218, 192])); doc.line(X, y + (r.total ? 0 : rh), X + tw, y + (r.total ? 0 : rh));
      if (r.total) doc.line(X, y + rh, X + tw, y + rh);
      y += rh;
    });
  };
  const heading = (s) => { ensure(30); T(s.toUpperCase(), X, y + 10, { size: 10.5, bold: true, color: GREEN }); y += 18; };

  // summary
  if (list.length) {
    const sumCols = [{ l: "Year", w: 55 }, { l: "Class", w: 70 }, { l: "Roll", w: 35 }, { l: "Exam", w: 55 }, { l: "Total", w: 85, a: "r" }, { l: "%", w: 45, a: "r" }, { l: "Position", w: 55 }, { l: "Compartments", w: 80 }, { l: "Remark", status: true, w: 55 }];
    table(sumCols, list.map((e) => ({ c: [e.y, e.cn + (e.rep ? " (R)" : ""), e.roll, EXAM_NAME[e.e].replace(" Semester", " Sem"), `${fmtMark(e.total)} / ${e.max}`, e.pct.toFixed(2), `${e.pos} of ${e.of}`,
      e.comp.length ? e.comp.map((c) => `${c.n} ${fmtMark(c.m)}`).join(", ") : "-", e.rem ? (e.rem === "Comp." ? "Comp." : e.rem === "Passed after compartment" ? "Pass (comp.)" : e.rem === "Failed compartment" ? "Failed comp." : e.rem) : "-"] })), { preH: 0 });
    y += 16;
    // best and lowest performing subjects (average % of the marks over the annual results) and class standing
    const ann = (entries.filter((e) => e.e === "annual").length ? entries.filter((e) => e.e === "annual") : list);
    const bySub = {}, SKIP = ["arabic muhadithah", "english muhadithah", "urdu muhadithah", "ruhani khazain", "deeni maloomat", "khutbat e imam"]; // not counted in the best/lowest summary
    const norm = (t) => t.toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim().replace(/khaza in/, "khazain");
    for (const e of ann) for (const sb of e.subs) if (sb.max > 0 && sb.m != null && !SKIP.includes(norm(sb.n))) { const k = sb.n.trim().toLowerCase(); (bySub[k] ||= { n: sb.n.trim(), r: [] }).r.push({ y: e.y, m: sb.m, max: sb.max, p: sb.m / sb.max * 100 }); }
    let subs = Object.values(bySub).map((o) => ({ ...o, avg: o.r.reduce((a, x) => a + x.p, 0) / o.r.length }));
    const need = Math.max(2, Math.ceil(Math.max(0, ...subs.map((o) => o.r.length)) / 2)); // judge only subjects taken in at least half of the exams
    if (subs.some((o) => o.r.length >= need)) subs = subs.filter((o) => o.r.length >= need);
    if (subs.length >= 2) {
      const sorted = subs.slice().sort((a, b) => b.avg - a.avg), k = Math.min(3, Math.floor(sorted.length / 2));
      const top = sorted.slice(0, k), bottom = sorted.slice(-k).reverse();
      const card = (x0, w, title, rows, tone) => {
        const bh = 16 + rows.length * 15 + 6; R(x0, y, w, bh, tone); doc.setDrawColor(...SAND); doc.setLineWidth(0.5); doc.rect(x0, y, w, bh, "S");
        T(title.toUpperCase(), x0 + 10, y + 14, { size: 8, bold: true, color: GREEN });
        rows.forEach((o, i) => { const by = y + 30 + i * 15; T(`${i + 1}.  ${clip(o.n, 9.5, w - 150)}`, x0 + 10, by, { size: 9.5, bold: true }); R(x0 + w - 112, by - 7, 70, 6, [255, 255, 255]); R(x0 + w - 112, by - 7, Math.max(1, 70 * o.avg / 100), 6, tone === GOODBG ? SAGE : [184, 170, 130]); T(`${o.avg.toFixed(1)}%`, x0 + w - 10, by, { size: 9.5, align: "right" }); });
        return bh;
      };
      ensure(150); heading("Subject summary");
      const gw = (W - 2 * X - 12) / 2, GOODBG = [236, 244, 236], LOWBG = [245, 241, 230];
      const h1 = card(X, gw, "Best performing subjects", top, GOODBG);
      card(X + gw + 12, gw, "Lowest performing subjects", bottom, LOWBG);
      y += h1 + 6;
      T("Average % of the marks over the annual results; only subjects taken in at least half of the years are compared.", X, y + 8, { size: 7, italic: true, color: GREY });
      y += 18;
    }
    // class standing: rank as a share of the class size, so small and large classes can be compared
    const pc = ann.filter((e) => e.pos && e.of).map((e) => ({ y: e.y, v: Math.max(1, Math.round(e.pos / e.of * 100)) }));
    if (pc.length) {
      const avg = Math.max(1, Math.round(pc.reduce((a, x) => a + x.v, 0) / pc.length));
      const bst = pc.reduce((a, b) => (b.v < a.v ? b : a)), wst = pc.reduce((a, b) => (b.v > a.v ? b : a));
      ensure(46); R(X, y, W - 2 * X, 36, [236, 244, 236]); doc.setDrawColor(...SAND); doc.setLineWidth(0.5); doc.rect(X, y, W - 2 * X, 36, "S");
      T("CLASS STANDING", X + 10, y + 14, { size: 8, bold: true, color: GREEN });
      T(`On average in the top ${avg}% of his class`, X + 10, y + 28, { size: 10, bold: true });
      if (pc.length > 1) T(`Best: top ${bst.v}% (${bst.y})     Lowest: top ${wst.v}% (${wst.y})`, W - X - 10, y + 28, { size: 8.5, color: GREY, align: "right" });
      y += 36 + 16;
    }
    // charts
    const chart = (title, labels, vals, o) => {
      const h = 150; ensure(h + 22); heading(title);
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

  // the overview above has page 1 to itself; the exam-by-exam tables start on the next page
  if (list.length) { doc.addPage(); page(false); }

  // one table per exam
  for (const e of list) {
    const ann = e.e === "annual";
    const pre = () => {
      y += 6;
      T(`${e.y}  |  ${e.cn.toUpperCase()}${e.rep ? " (REPEAT)" : ""}  |  ${EXAM_NAME[e.e].toUpperCase()}`, X, y + 10, { size: 10.5, bold: true, color: GREEN });
      T(`Roll ${e.roll}     Position ${e.pos} of ${e.of}     ${e.pct.toFixed(2)}%     ${e.rem ? (e.rem === "Comp." ? "Compartment" : e.rem) : ""}`, W - X, y + 10, { size: 8.5, align: "right" });
      y += 16;
    };
    const cols = ann ? [{ l: "Subject", w: 132 }, { l: "Out of", w: 42, a: "r" }, { l: "Pass mark", w: 50, a: "r" }, { l: "Semester 1", w: 62, a: "r" }, { l: "Semester 2", w: 62, a: "r" }, { l: "Average", w: 56, a: "r" }, { l: "Status", w: 44, status: true }, { l: "Teacher", w: 87 }]
      : [{ l: "Subject", w: 150 }, { l: "Out of", w: 50, a: "r" }, { l: "Pass mark", w: 60, a: "r" }, { l: "Marks", w: 70, a: "r" }, { l: "Status", w: 55, status: true }, { l: "Teacher", w: 150 }];
    const status = (s) => (s.f ? "Fail" : s.pass ? "Pass" : "-");
    const hasT = e.subs.some((x) => x.t); // the teacher column is dropped when no teacher is recorded
    const cut = (a) => (hasT ? a : a.slice(0, -1));
    const cols2 = hasT ? cols : cols.slice(0, -1).map((c, i) => (i === 0 ? { ...c, w: c.w + cols[cols.length - 1].w } : c));
    const rows = e.subs.map((s) => ({ c: cut(ann ? [s.n, s.max, s.pass || "-", fmtMark(s.a), fmtMark(s.b), fmtMark(s.m), status(s), s.t || ""] : [s.n, s.max, s.pass || "-", fmtMark(s.m), status(s), s.t || ""]) }));
    rows.push({ bold: true, total: true, c: cut(ann ? ["Total", e.max, "", "", "", fmtMark(e.total), "", ""] : ["Total", e.max, "", fmtMark(e.total), "", ""]) });
    table(cols2, rows, { pre, preH: 22 });
    if (e.comp.length) { T("Compartment papers: " + e.comp.map((c) => `${c.n} ${fmtMark(c.m)} (${c.ok ? "passed" : "failed"})`).join(", "), X, y + 11, { size: 8.5, color: GREY }); y += 14; }
    y += 8;
  }
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); T(`${studentName}    Page ${i} of ${n}`, W / 2, H - 22, { size: 7.5, color: GREY, align: "center" }); }
  return doc;
}
