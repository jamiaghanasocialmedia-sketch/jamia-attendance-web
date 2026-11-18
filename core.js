// Data model + logic, ported 1:1 from the Android app (Models.kt, Reports.kt, StudentRecord.kt, Leave.kt).
export const ST = { P: "P", L: "L", A: "A", N: "N", D: "D", S: "S", V: "V" };
export const SPORTS_ID = "sports";
export const LEAVE_LAST_SATURDAY = "last_saturday", LEAVE_SICK = "sick", LEAVE_PERSONAL = "personal", LEAVE_SUMMER = "summer", LEAVE_DUTY = "duty";
export const PRAYER_PAIR = { zuhr: "asr", asr: "zuhr", maghrib: "isha", isha: "maghrib" };
export const PART_SALAT = "salat", PART_OTHER = "other", PART_SPORTS = "sports", PART_CLEAN = "clean";
export const PARTS = [PART_SALAT, PART_OTHER, PART_SPORTS, PART_CLEAN];
export const PART_WEIGHT = { salat: 30, other: 30, sports: 20, clean: 20 };
export const DEFAULT_DUTY_RULES = {
  day: ["morning_assembly", "sports", "zuhr", "asr", "maghrib", "isha", "night_assembly"],
  night: ["maghrib", "isha", "night_assembly", "sports"],
  nightNext: ["fajr", "morning_assembly"],
};
export const DEFAULT_LEAVE_RULES = {
  thu: ["zuhr", "asr", "sports", "maghrib", "isha", "night_assembly", "study_time"],
  fri: null,
  sat: ["fajr", "morning_assembly", "jamia_classes", "saturday_program", "zuhr", "asr", "sports"],
};
export const DEFAULT_ACTIVITIES = [
  ["fajr", "Fajr", "Prayers", "attendance", 1], ["zuhr", "Zuhr", "Prayers", "attendance", 2],
  ["asr", "Asr", "Prayers", "attendance", 3], ["maghrib", "Maghrib", "Prayers", "attendance", 4],
  ["isha", "Isha", "Prayers", "attendance", 5], ["morning_assembly", "Morning Assembly", "Assemblies", "attendance", 6],
  ["night_assembly", "Night Assembly", "Assemblies", "attendance", 7],
  ["friday_sermon", "Weekly Friday Sermon of Huzoor-e-Anwar", "Programs", "attendance", 8, true],
  ["saturday_program", "Saturday Program", "Programs", "attendance", 9],
  ["majlis_ilmi", "Majlis-e-Ilmi", "Programs", "attendance", 10], ["ruhani_khazain", "Ruhani Khazain Lecture", "Programs", "attendance", 11],
  ["cleanliness", "General Cleanliness", "Inspection", "inspection", 12], ["sports", "Sports", "Sports", "attendance", 13],
  ["jamia_classes", "Jamia Classes", "Class", "attendance", 14, true], ["study_time", "Study Time", "Class", "attendance", 15, true],
  ["waqar_e_amal", "Waqar-e-Amal Attendance", "Inspection", "attendance", 16],
].map(([id, name, group, type, order, multi]) => ({ id, name, group, type, order, active: true, multi: !!multi }));

export const isInspection = (a) => a.type === "inspection";
export const isExcused = (m) => m === ST.D || m === ST.S || m === ST.V;
export const isSports = (a) => a && a.id === SPORTS_ID;
export const isAbsentBase = (a) => a.group === "Prayers";
export const isNoLate = (a) => a.group === "Class";
export const shownCode = (m, absentBase) => (m == null && absentBase ? ST.A : m ?? null);
export const sessionId = (classId, date, activityId, n = 0) => `${classId}_${date}_${activityId}` + (n > 0 ? `_${n}` : "");
export const todayStr = () => ymd(new Date());
export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const parseD = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return ymd(d); };
export const daysBetween = (a, b) => Math.round((parseD(b) - parseD(a)) / 86400000);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const pretty = (s) => { try { const d = parseD(s); return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`; } catch { return s; } };
export const dm = (s) => { try { const d = parseD(s); return `${d.getDate()} ${MON[d.getMonth()]}`; } catch { return s; } };
export const fmtPct = (d) => (d == null ? "-" : d.toFixed(1) + "%");
export const leaveReasonLabel = (r) => (r === LEAVE_LAST_SATURDAY ? "Last Saturday Leave" : r === LEAVE_SICK ? "Sick leave" : r === LEAVE_SUMMER ? "Summer Holidays" : r === LEAVE_DUTY ? "Duty leave" : "Personal leave");
export const leaveDays = (l) => daysBetween(l.from, l.to) + 1;
export const leaveDaysIn = (l, from, to) => {
  const a = l.from > from ? l.from : from, z = l.to < to ? l.to : to;
  return z < a ? 0 : daysBetween(a, z) + 1;
};
export function lastSaturdayFor(today) {
  const lastSat = (y, m) => { const d = new Date(y, m + 1, 0); while (d.getDay() !== 6) d.setDate(d.getDate() - 1); return ymd(d); };
  const t = parseD(today);
  const thisM = lastSat(t.getFullYear(), t.getMonth());
  return today <= thisM ? thisM : lastSat(t.getFullYear(), t.getMonth() + 1);
}

export function statusLabel(code, inspection, dutyLabel = "Duty") {
  if (code === ST.D) return dutyLabel;
  if (code === ST.S) return "Permission";
  if (code === ST.V) return "Leave";
  if (inspection) return code === ST.N ? "Needs improvement" : "Pass";
  if (code === ST.L) return "Late";
  if (code === ST.A) return "Absent";
  return "Present";
}
export function scoreOf(mark, absentBase, inspection) {
  if (inspection) return mark === ST.N ? 0 : 1;
  if (mark === ST.P) return 1;
  if (mark === ST.L) return 0.5;
  if (mark === ST.A) return 0;
  return absentBase ? 0 : 1;
}
export function nextStatus(cur, inspection, absentBase = false, noLate = false, permission = false) {
  if (permission && !inspection && !noLate && !absentBase) {
    if (cur == null) return ST.L; if (cur === ST.L) return ST.A; if (cur === ST.A) return ST.S; return null;
  }
  if (inspection) return cur == null ? ST.N : null;
  if (noLate) return cur == null ? ST.A : null;
  if (absentBase) { if (cur == null) return ST.P; if (cur === ST.P) return ST.L; return null; }
  if (cur == null) return ST.L; if (cur === ST.L) return ST.A; return null;
}
export function nextStatusHm(cur, inspection, absentBase = false, noLate = false, permission = false) {
  if (cur === ST.S || cur === ST.V) return null;
  if (cur === ST.D) return permission ? ST.S : null;
  if (noLate) return cur == null ? ST.A : ST.D;
  if (absentBase) { if (cur == null) return ST.P; if (cur === ST.P) return ST.L; return ST.D; }
  if (cur == null) return inspection ? ST.N : ST.L;
  if (cur === ST.L) return ST.A;
  return ST.D;
}

// ---- the shared live data and the rules that depend on it ----
export const DEFAULT_ACADEMIC_YEAR = { sm: 9, sd: 1, em: 6, ed: 30 };
export const S = {
  academicYear: DEFAULT_ACADEMIC_YEAR,
  me: null, classes: [], students: [], activities: [], users: [],
  dutyRules: DEFAULT_DUTY_RULES, dutyDays: {}, sportsEx: [], clinic: [], leaves: [], leaveRules: DEFAULT_LEAVE_RULES,
  competitions: [], compResults: [],
};
export const DEFAULT_COMPETITIONS = ["Holy Qur’an Recitation Competition", "Kasauti (Guess and Pass) Competition", "Khutbat-e-Imam Competition", "Nazm Recitation Competition", "English Message Delivery Competition", "Urdu Extempore Speech Competition", "Qaseedah Recitation Competition", "English Extempore Speech Competition", "Urdu Message Delivery Competition", "Adhan Calling Competition", "Khutbah Ilhamiyyah Competition", "Arabic Extempore Speech Competition", "General Knowledge Quiz", "Prayer Memorisation Competition", "Religious Knowledge Quiz", "Khazain Dictionary Competition", "Arabic Prepared Speech Competition", "Urdu Prepared Speech Competition", "English Prepared Speech Competition", "Muqabila Ayat-e-Qur’ani (Qur’anic Verses Competition)", "Arabic Message Delivery Competition", "Bait Bazi Competition", "English Essay Writing Competition", "Urdu Essay Writing Competition", "Arabic Essay Writing Competition"];
export const placeLabel = (p) => (p === 1 ? "1st" : p === 2 ? "2nd" : "3rd");
export const placeOf = (r, id) => (r.p1.includes(id) ? 1 : r.p2.includes(id) ? 2 : r.p3.includes(id) ? 3 : null);

export function leaveCovers(date, studentId, activityId) {
  for (const l of S.leaves) {
    if (l.studentId !== studentId || date < l.from || date > l.to) continue;
    // Sick leave never excuses attendance; it is only recorded for the reports.
    if (l.reason === LEAVE_SICK) continue;
    if (l.reason !== LEAVE_LAST_SATURDAY) return true;
    let set;
    if (l.from !== l.to && date === l.from) set = S.leaveRules.thu;
    else if (l.from !== l.to && date === l.to) set = S.leaveRules.sat;
    else set = S.leaveRules.fri;
    if (set == null || set.includes(activityId)) return true;
  }
  return false;
}
export function sportsStatus(date, studentId, activityId) {
  if (activityId !== SPORTS_ID) return null;
  let found = null;
  for (const e of S.sportsEx) {
    if (e.studentId !== studentId || date < e.from || date > e.to) continue;
    if (e.kind === "duty") return ST.D;
    found = ST.S;
  }
  return found;
}
export function dutyExcused(date, studentId, activityId) {
  const r = S.dutyRules, today = S.dutyDays[date];
  if (r.day.includes(activityId) && today && today.day.includes(studentId)) return true;
  if (r.night.includes(activityId) && today && today.night.includes(studentId)) return true;
  if (r.nightNext.includes(activityId)) {
    const y = S.dutyDays[addDays(date, -1)];
    if (y && y.night.includes(studentId)) return true;
  }
  return false;
}
export function effective(s, studentId, inspection) {
  const m = s.marks[studentId] ?? null;
  if (isExcused(m) || inspection) return m;
  // Security duty only turns an Absent mark into Duty; Present and Late stay as they are.
  if (shownCode(m, s.base === ST.A) === ST.A && dutyExcused(s.date, studentId, s.activityId)) return ST.D;
  // Leave and sports duty / permission override every mark (Present, Late or Absent).
  if (leaveCovers(s.date, studentId, s.activityId)) return ST.V;
  return sportsStatus(s.date, studentId, s.activityId) ?? m;
}

// ---- reports ----
export const partOf = (a) => (isInspection(a) ? PART_CLEAN : a.group === "Prayers" ? PART_SALAT : a.group === "Sports" ? PART_SPORTS : PART_OTHER);
export const partTitle = (k) => ({ salat: "Salat", other: "Jamia Activities", sports: "Sports", clean: "Cleanliness" }[k]);

export function buildReport(sessions, classId, activityIds) {
  const actMap = Object.fromEntries(S.activities.map((a) => [a.id, a]));
  const idSet = new Set(activityIds);
  const inScope = new Set([...idSet].map((i) => actMap[i]).filter(Boolean).map(partOf));
  const per = {}, cat = {};
  for (const s of sessions) {
    if (classId && s.classId !== classId) continue;
    if (!idSet.has(s.activityId)) continue;
    const act = actMap[s.activityId]; if (!act) continue;
    const part = partOf(act);
    for (const sid of s.roster) {
      const arr = ((per[sid] ??= {})[act.id] ??= [0, 0, 0]);
      const c = ((cat[sid] ??= {})[part] ??= [0, 0, 0, 0]);
      c[3]++;
      const m = effective(s, sid, isInspection(act));
      if (isExcused(m)) { arr[2]++; c[2]++; continue; }
      const sc = scoreOf(m, s.base === ST.A, isInspection(act));
      arr[1]++; arr[0] += sc; c[1]++; c[0] += sc;
    }
  }
  const clsName = Object.fromEntries(S.classes.map((c) => [c.id, c.name]));
  const clsOrder = Object.fromEntries(S.classes.map((c) => [c.id, c.order]));
  const rows = S.students.filter((st) => (!classId || st.classId === classId) && (st.active || per[st.id])).map((st) => {
    const p = per[st.id] || {};
    let pts = 0, n = 0, cp = 0, ct = 0, ex = 0;
    for (const [aid, arr] of Object.entries(p)) {
      ex += arr[2];
      if (actMap[aid] && isInspection(actMap[aid])) { cp += arr[0]; ct += arr[1]; } else { pts += arr[0]; n += arr[1]; }
    }
    const mine = cat[st.id] || {};
    const parts = {};
    for (const k of PARTS) {
      const c = mine[k];
      if (!inScope.has(k)) parts[k] = null;
      else if (!c || c[3] === 0) parts[k] = 0;
      else if (c[1] === 0) parts[k] = null;
      else if (k === PART_OTHER) {
        const pcts = Object.entries(p).filter(([id, v]) => actMap[id] && partOf(actMap[id]) === PART_OTHER && v[1] > 0).map(([, v]) => (v[0] / v[1]) * 100);
        parts[k] = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
      } else parts[k] = (c[0] / c[1]) * 100;
    }
    const used = PARTS.filter((k) => parts[k] != null);
    const anything = Object.values(mine).some((c) => c[3] > 0);
    const combined = !anything || !used.length ? null : used.reduce((a, k) => a + PART_WEIGHT[k] * parts[k], 0) / used.reduce((a, k) => a + PART_WEIGHT[k], 0);
    return { student: st, className: clsName[st.classId] || "", sessions: n, points: pts, cleanPass: cp, cleanTotal: ct, excused: ex, per: p, parts, combined, pct: combined };
  });
  rows.sort((a, b) => (clsOrder[a.student.classId] ?? 99) - (clsOrder[b.student.classId] ?? 99) || (b.pct ?? -1) - (a.pct ?? -1) || a.student.name.toLowerCase().localeCompare(b.student.name.toLowerCase()));
  return rows;
}
export function classRanks(rows) {
  const out = []; let prevClass = "", pos = 0, rank = 0, prevPct = null;
  for (const r of rows) {
    if (r.student.classId !== prevClass) { prevClass = r.student.classId; pos = 0; rank = 0; prevPct = null; }
    pos++;
    const p = r.pct;
    if (p == null) out.push(null);
    else { if (prevPct == null || Math.abs(p - prevPct) > 1e-9) rank = pos; prevPct = p; out.push(rank); }
  }
  return out;
}

export const ayText = (a) => { const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]; return `${a.sd} ${M[a.sm - 1]} to ${a.ed} ${M[a.em - 1]}`; };
const p2 = (n) => String(n).padStart(2, "0");
/** Academic years (e.g. 1 Sep to 30 Jun) that overlap from..to, each clipped to the period. */
export function academicWindows(from, to, ay = S.academicYear) {
  const out = [], wraps = ay.em < ay.sm || (ay.em === ay.sm && ay.ed < ay.sd);
  for (let y = +from.slice(0, 4) - 1; y <= +to.slice(0, 4); y++) {
    const s = `${y}-${p2(ay.sm)}-${p2(ay.sd)}`, e = `${wraps ? y + 1 : y}-${p2(ay.em)}-${p2(ay.ed)}`;
    const f = s > from ? s : from, t = e < to ? e : to;
    if (f <= t) out.push({ label: wraps ? `${y}/${String((y + 1) % 100).padStart(2, "0")}` : String(y), from: f, to: t });
  }
  return out;
}

export function buildStudentRecord(st, sessions, from, to, duty, noYears) {
  const rec = buildStudentRecordOne(st, sessions, from, to, duty);
  if (!noYears && (new Date(to) - new Date(from)) / 86400000 > 366) {
    rec.years = [];
    for (const w of academicWindows(from, to)) {
      const sub = buildStudentRecordOne(st, sessions.filter((x) => x.date >= w.from && x.date <= w.to), w.from, w.to, duty);
      if (!sub.acts.length && !sub.sick.length && !sub.leaves.length && !sub.comps.length) continue;
      sub.label = w.label; rec.years.push(sub);
    }
  }
  return rec;
}
function buildStudentRecordOne(st, sessions, from, to, duty) {
  const actMap = Object.fromEntries(S.activities.map((a) => [a.id, a]));
  const allIds = S.activities.map((a) => a.id);
  const rows = buildReport(sessions, null, allIds);
  const ranks = classRanks(rows);
  const idx = rows.findIndex((r) => r.student.id === st.id);
  const row = rows[idx];
  const rank = idx >= 0 ? ranks[idx] : null;
  const classSize = rows.filter((r) => r.student.classId === st.classId && r.student.active).length;
  const counts = {}, partCounts = Object.fromEntries(PARTS.map((k) => [k, [0, 0, 0, 0]])), entries = [];
  for (const s of sessions) {
    if (!s.roster.includes(st.id)) continue;
    const act = actMap[s.activityId]; if (!act) continue;
    const mark = effective(s, st.id, isInspection(act));
    const shown = shownCode(mark, s.base === ST.A);
    const c = (counts[act.id] ??= { activity: act, present: 0, late: 0, absent: 0, excused: 0 });
    const pc = partCounts[partOf(act)];
    if (isExcused(mark)) { c.excused++; pc[3]++; }
    else if (isInspection(act)) { if (mark === ST.N) { c.absent++; pc[2]++; } else { c.present++; pc[0]++; } }
    else if (shown === ST.L) { c.late++; pc[1]++; }
    else if (shown === ST.A) { c.absent++; pc[2]++; }
    else { c.present++; pc[0]++; }
    entries.push({ date: s.date, activity: act, code: shown, label: statusLabel(shown, isInspection(act)), deviceLocal: s.deviceLocal || "", takerName: s.takerName,
      name: act.name + (act.multi ? ` #${s.n > 0 ? s.n : 1}` + (s.title ? ` ${s.title}` : "") : "") });
  }
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.activity.order - b.activity.order);
  const acts = [...S.activities].sort((a, b) => a.order - b.order).map((a) => counts[a.id]).filter(Boolean)
    .map((c) => ({ ...c, counted: c.present + c.late + c.absent, pct: c.present + c.late + c.absent === 0 ? null : ((c.present + 0.5 * c.late) / (c.present + c.late + c.absent)) * 100 }));
  return {
    student: st, className: (S.classes.find((c) => c.id === st.classId) || {}).name || "", rank, classSize,
    combined: row ? row.combined : null, parts: row ? row.parts : {}, partCounts, acts, entries, from, to,
    sick: S.clinic.filter((x) => x.studentId === st.id && x.date >= from && x.date <= to).sort((a, b) => a.date.localeCompare(b.date)),
    leaves: S.leaves.filter((x) => x.studentId === st.id && x.from <= to && x.to >= from).sort((a, b) => a.from.localeCompare(b.from)),
    comps: S.compResults.filter((r) => r.date >= from && r.date <= to).map((r) => [r, placeOf(r, st.id)]).filter((x) => x[1]).sort((a, b) => a[0].date.localeCompare(b[0].date) || a[0].name.localeCompare(b[0].name)),
  };
}
