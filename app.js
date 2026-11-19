import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getFirestore, collection, doc, onSnapshot, getDoc, getDocs,
  setDoc, updateDoc, deleteDoc, writeBatch, query, where, serverTimestamp, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import * as C from "./core.js";
import { S, ST } from "./core.js";
import { h, $, toast, modal, confirmBox, chips, check, dateRow, appBar, pill, navBar, modalOpen } from "./ui.js";
import { studentPdf, classPdf, reportPdf } from "./pdf.js";
import { DEFAULT_SIG } from "./sigdata.js";

const app = initializeApp(firebaseConfig);
let db;
try { db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); } catch { db = getFirestore(app); }
const auth = getAuth(app);

const emailFor = (s) => { const t = s.trim(); return t.includes("@") ? t : t.toLowerCase().replace(/ /g, "") + "@attendance.jamia"; };
const displayUsername = (u) => (u || "").replace(/@attendance\.jamia$/, "");
const friendly = (e) => {
  const c = e && e.code || "";
  if (c.includes("weak-password")) return "Password must be at least 6 characters.";
  if (c.includes("email-already-in-use")) return "That username is already taken.";
  if (c.includes("invalid-credential") || c.includes("user-not-found") || c.includes("wrong-password") || c.includes("invalid-email")) return "Wrong username or password.";
  if (c.includes("network")) return "No internet connection.";
  if (c.includes("permission-denied")) return "Not allowed (permission denied).";
  if (c.includes("api-key") || c.includes("referer")) return "This web address is not allowed for the app's Firebase key. See the setup note (web app config).";
  return (e && e.message) || "Something went wrong.";
};

// ---------- Firestore -> model ----------
const arr = (v) => (Array.isArray(v) ? v : []);
const mUser = (d) => { const x = d.data(); return { uid: d.id, name: x.name || "", username: x.username || "", role: x.role || "taker", activities: arr(x.activities), classes: arr(x.classes), active: x.active !== false, canEnterDuty: !!x.canEnterDuty, canClinic: !!x.canClinic, canLeave: !!x.canLeave, canCompetitions: !!x.canCompetitions }; };
const mClass = (d) => ({ id: d.id, name: d.data().name || d.id, order: d.data().order || 0 });
const mStudent = (d) => { const x = d.data(); return { id: d.id, name: x.name || "", country: x.country || "", aims: x.aims || "", classId: x.classId || "", active: x.active !== false }; };
const mActivity = (d) => { const x = d.data(); return { id: d.id, name: x.name || d.id, group: x.group || "", type: x.type || "attendance", order: x.order || 0, active: x.active !== false, multi: !!x.multi }; };
const mSession = (d) => { const x = d.data(); return { id: d.id, classId: x.classId || "", date: x.date || "", activityId: x.activityId || "", takerName: x.takerName || "", roster: arr(x.roster), marks: x.marks || {}, base: x.base || "P", deviceLocal: x.deviceLocal || "", n: x.n || 0, title: x.title || "", pending: d.metadata.hasPendingWrites }; };
const isHM = () => S.me && S.me.role === "housemaster";
const num = (s) => (s.n > 0 ? s.n : 1);
const byId = () => Object.fromEntries(S.students.map((s) => [s.id, s]));
const clsName = (id) => (S.classes.find((c) => c.id === id) || {}).name || "";
const sheetSuffix = (a, s) => (!a || !a.multi || !s ? "" : ` #${num(s)}` + (s.title ? ` ${s.title}` : ""));

// ---------- saved accounts (passwords encrypted with a non-extractable key kept in this browser) ----------
const Vault = (() => {
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open("jamia-vault", 1); r.onupgradeneeded = () => r.result.createObjectStore("k"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const get = async (k) => { const d = await idb(); return new Promise((res) => { const q = d.transaction("k").objectStore("k").get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); };
  const put = async (k, v) => { const d = await idb(); return new Promise((res) => { const t = d.transaction("k", "readwrite"); t.objectStore("k").put(v, k); t.oncomplete = () => res(); }); };
  const key = async () => {
    let k = await get("key");
    if (!k) { k = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); await put("key", k); }
    return k;
  };
  const b64 = (u8) => btoa(String.fromCharCode(...u8)), unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const read = () => { try { return JSON.parse(localStorage.getItem("accounts") || "[]"); } catch { return []; } };
  const write = (l) => localStorage.setItem("accounts", JSON.stringify(l));
  return {
    list: read,
    async save(login, pw, name, role) {
      try {
        const k = await key(), iv = crypto.getRandomValues(new Uint8Array(12));
        const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, new TextEncoder().encode(pw)));
        const l = read().filter((a) => a.login !== login.trim().toLowerCase());
        l.push({ login: login.trim().toLowerCase(), name, role, iv: b64(iv), pw: b64(ct) }); write(l);
      } catch {}
    },
    async password(login) {
      try {
        const a = read().find((x) => x.login === login); if (!a) return null;
        const k = await key();
        return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(a.iv) }, k, unb64(a.pw)));
      } catch { return null; }
    },
    remove(login) { write(read().filter((a) => a.login !== login)); },
  };
})();

// ---------- admin code lockout (3 wrong tries = 5 minutes) ----------
const Lock = {
  left() { return Math.max(0, Math.ceil((Number(localStorage.getItem("lockUntil") || 0) - Date.now()) / 1000)); },
  fail() { const n = Number(localStorage.getItem("lockFails") || 0) + 1; if (n >= 3) { localStorage.setItem("lockFails", "0"); localStorage.setItem("lockUntil", String(Date.now() + 300000)); } else localStorage.setItem("lockFails", String(n)); },
  reset() { localStorage.setItem("lockFails", "0"); },
};
async function verifyCode(code) {
  const uid = auth.currentUser.uid;
  try { await setDoc(doc(db, "admin_checks", uid), { code, ts: serverTimestamp() }); return true; }
  catch (e) { if (String(e.code).includes("permission-denied")) return false; throw e; }
}
async function commitWithProof(code, ops) {
  const b = writeBatch(db);
  b.set(doc(db, "admin_checks", auth.currentUser.uid), { code, ts: serverTimestamp() });
  ops(b);
  await b.commit();
}
function askAdminCode(onOk) {
  modal((close) => {
    const inp = h("input", { type: "password", inputmode: "numeric", placeholder: "Admin code" });
    const err = h("div", { class: "err" });
    const go = h("button", { onclick: async () => {
      const left = Lock.left();
      if (left > 0) { err.textContent = `Too many wrong attempts. Try again in ${Math.ceil(left / 60)} minute(s).`; return; }
      go.disabled = true;
      try {
        if (await verifyCode(inp.value)) { Lock.reset(); close(); onOk(inp.value); }
        else { Lock.fail(); err.textContent = "Wrong code."; }
      } catch { err.textContent = "Could not check the code. You need internet for this."; }
      go.disabled = false;
    } }, "OK");
    setTimeout(() => inp.focus(), 50);
    return [h("h3", {}, "Admin code"), inp, err, h("div", { class: "row" }, h("button", { class: "o", onclick: close }, "Cancel"), h("div", { class: "grow" }), go)];
  });
}

// ---------- live data ----------
let regs = [];
function startData(u) {
  stopData();
  S.me = u;
  const L = (q, fn) => regs.push(onSnapshot(q, fn, () => {}));
  L(collection(db, "classes"), (s) => { S.classes = s.docs.map(mClass).sort((a, b) => a.order - b.order); render(); });
  L(collection(db, "students"), (s) => { S.students = s.docs.map(mStudent); render(); });
  L(collection(db, "activities"), (s) => { S.activities = s.docs.map(mActivity).sort((a, b) => a.order - b.order); render(); });
  L(doc(db, "config", "dutyRules"), (s) => { const x = s.data(); S.dutyRules = s.exists() ? { day: arr(x.day), night: arr(x.night), nightNext: arr(x.nightNext) } : C.DEFAULT_DUTY_RULES; render(); });
  L(doc(db, "config", "academicYear"), (s) => { const x = s.data(); S.academicYear = s.exists() && x.sm ? { sm: x.sm, sd: x.sd, em: x.em, ed: x.ed } : C.DEFAULT_ACADEMIC_YEAR; render(); });
  L(doc(db, "config", "signature"), (s) => { const x = s.data(); S.signature = s.exists() && x.data ? x.data : null; render(); });
  L(collection(db, "duty"), (s) => { S.dutyDays = {}; for (const d of s.docs) S.dutyDays[d.id] = { day: arr(d.data().day), night: arr(d.data().night) }; render(); });
  L(collection(db, "sports_exempt"), (s) => { S.sportsEx = s.docs.map((d) => ({ id: d.id, studentId: d.data().studentId || "", kind: d.data().kind || "duty", from: d.data().from || "", to: d.data().to || "", note: d.data().note || "" })); render(); });
  L(collection(db, "clinic"), (s) => { S.clinic = s.docs.map((d) => { const x = d.data(); return { id: d.id, studentId: x.studentId || "", classId: x.classId || "", date: x.date || "", ailments: arr(x.ailments), place: x.place || "hostel", by: x.by || "", byUid: x.byUid || "" }; }); render(); });
  L(collection(db, "leaves"), (s) => { S.leaves = s.docs.map((d) => { const x = d.data(); return { id: d.id, studentId: x.studentId || "", classId: x.classId || "", reason: x.reason || "personal", from: x.from || "", to: x.to || "", by: x.by || "", byUid: x.byUid || "" }; }); render(); });
  L(collection(db, "competitions"), (s) => { S.competitions = s.docs.map((d) => ({ id: d.id, name: d.data().name || d.id, active: d.data().active !== false, order: d.data().order || 0 })).sort((a, b) => a.order - b.order); render(); });
  L(collection(db, "competition_results"), (s) => { S.compResults = s.docs.map((d) => { const x = d.data(); return { id: d.id, date: x.date || "", competitionId: x.competitionId || "", name: x.name || "", p1: arr(x.p1), p2: arr(x.p2), p3: arr(x.p3), by: x.by || "", byUid: x.byUid || "" }; }); render(); });
  L(doc(db, "config", "leaveRules"), (s) => { const x = s.data(), d = C.DEFAULT_LEAVE_RULES; S.leaveRules = s.exists() ? { thu: Array.isArray(x.thu) ? x.thu : d.thu, fri: Array.isArray(x.fri) ? x.fri : d.fri, sat: Array.isArray(x.sat) ? x.sat : d.sat } : d; render(); });
  L(doc(db, "users", u.uid), (s) => { if (s.exists()) { S.me = mUser(s); render(); } });
  if (u.role === "housemaster") L(collection(db, "users"), (s) => { S.users = s.docs.map(mUser); render(); });
}
function stopData() {
  regs.forEach((r) => r()); regs = [];
  Object.assign(S, { me: null, classes: [], students: [], activities: [], users: [], dutyRules: C.DEFAULT_DUTY_RULES, dutyDays: {}, sportsEx: [], clinic: [], leaves: [], leaveRules: C.DEFAULT_LEAVE_RULES, competitions: [], compResults: [], academicYear: C.DEFAULT_ACADEMIC_YEAR, signature: null });
  liveStop();
}
// sessions for one date / one sheet
let liveReg = [], live = { sessions: [], sheet: undefined, sheetLoaded: false };
function liveStop() { liveReg.forEach((r) => r()); liveReg = []; live = { sessions: [], sheet: undefined, sheetLoaded: false }; liveKey = ""; }
let liveKey = "";
function watchDate(date) {
  if (liveKey === "d" + date) return; liveStop(); liveKey = "d" + date;
  liveReg.push(onSnapshot(query(collection(db, "sessions"), where("date", "==", date)), (s) => { live.sessions = s.docs.map(mSession); render(); }, () => {}));
}
function watchSheet(sid) {
  if (liveKey === "s" + sid) return; liveStop(); liveKey = "s" + sid;
  liveReg.push(onSnapshot(doc(db, "sessions", sid), { includeMetadataChanges: true }, (s) => { live.sheet = s.exists() ? mSession(s) : null; live.sheetLoaded = true; render(); }, () => {}));
}
async function fetchSessions(from, to) {
  const s = await getDocs(query(collection(db, "sessions"), where("date", ">=", from), where("date", "<=", to)));
  return s.docs.map(mSession);
}

// ---------- navigation / render ----------
let view = { name: "loading" };
let phase = "loading", loginMsg = "", busy = false;
export function go(name, p = {}) { view = { name, ...p }; scrollTo(0, 0); render(); }
let renderQueued = false;
function render() {
  if (renderQueued) return; renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; doRender(); });
}
function doRender() {
  const root = $("#app");
  const ae = document.activeElement;
  const k = ae && ae.dataset && ae.dataset.k, pos = ae && ae.selectionStart;
  const y = scrollY;
  let el;
  try { el = build(); } catch (e) { console.error(e); el = h("div", { class: "pad" }, h("div", { class: "err" }, "Screen error: " + e.message)); }
  root.replaceChildren(el);
  scrollTo(0, y);
  if (k) { const n = root.querySelector(`[data-k="${k}"]`); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch {} } }
}
function build() {
  if (phase === "loading") return h("div", { class: "pad" }, "Loading...");
  if (phase === "login") return loginView();
  if (!S.me) return h("div", { class: "pad" }, "Loading...");
  return isHM() ? hmRoot() : takerRoot();
}
const input = (key, props = {}) => h("input", { "data-k": key, type: "search", ...props });

// ---------- auth ----------
async function enter(uid) {
  const d = await getDoc(doc(db, "users", uid));
  const u = d.exists() ? mUser(d) : null;
  if (!u || !u.active) { await signOut(auth); loginMsg = "This account has no access. Please ask the housemaster."; phase = "login"; return false; }
  startData(u); phase = "home"; view = { name: "home" }; return true;
}
async function loginWith(id, pw) {
  busy = true; loginMsg = ""; render();
  try {
    stopData();
    const cred = await signInWithEmailAndPassword(auth, emailFor(id), pw);
    if (await enter(cred.user.uid)) await Vault.save(id, pw, S.me.name, S.me.role);
  } catch (e) { loginMsg = friendly(e); phase = "login"; }
  busy = false; render();
}
async function logout() { stopData(); await signOut(auth); loginMsg = ""; phase = "login"; render(); }

function loginView() {
  const saved = Vault.list();
  const u = h("input", { type: "text", placeholder: "Username or email", autocapitalize: "none", autocorrect: "off", "data-k": "lu" });
  const p = h("input", { type: "password", placeholder: "Password", "data-k": "lp" });
  const submit = () => { if (u.value.trim() && p.value) loginWith(u.value, p.value); };
  p.addEventListener("keydown", (e) => e.key === "Enter" && submit());
  return h("div", { class: "login" },
    h("h1", {}, "Jamia Attendance"), h("div", { class: "muted" }, "Sign in to continue"),
    saved.length ? [h("div", { class: "b" }, "Saved accounts"), saved.map((a) => h("div", { class: "row" },
      h("button", { class: "o grow", disabled: busy, onclick: async () => { const pw = await Vault.password(a.login); if (pw) loginWith(a.login, pw); else { loginMsg = "Please type the password again."; render(); } } }, a.name || a.login),
      h("button", { class: "t", onclick: () => { Vault.remove(a.login); render(); } }, "Remove"))), h("div", { class: "muted" }, "Or sign in with another account")] : null,
    u, p, loginMsg ? h("div", { class: "err" }, loginMsg) : null,
    h("button", { disabled: busy, onclick: submit }, busy ? "Signing in..." : "Sign in"));
}
function switchAccount() {
  const cur = S.me && emailFor(S.me.username);
  modal((close) => [h("h3", {}, "Switch account"),
    Vault.list().length ? null : h("div", { class: "muted" }, "No accounts saved yet."),
    Vault.list().map((a) => h("button", { class: "o", disabled: emailFor(a.login) === cur, onclick: async () => { close(); const pw = await Vault.password(a.login); if (pw) loginWith(a.login, pw); else logout(); } }, (a.name || a.login) + (emailFor(a.login) === cur ? "  (current)" : ""))),
    h("div", { class: "row" }, h("button", { class: "t", onclick: close }, "Close"), h("div", { class: "grow" }), h("button", { onclick: () => { close(); logout(); } }, "Add another account"))]);
}

// =====================================================================
// shared little widgets
// =====================================================================
function studentRow(name, sub, code, inspection, tappable, onTap, dutyLabel = "Duty") {
  return h("div", { class: "stu" + (tappable ? "" : " locked"), onclick: tappable ? onTap : null },
    h("div", { class: "grow" }, h("div", { class: "b" }, name), sub ? h("div", { class: "muted" }, sub) : null),
    pill(code, C.statusLabel(code, inspection, dutyLabel)));
}
function pickStudents(state, key, { single = false, redraw } = {}) {
  const rd = redraw ? () => {
    const ae = document.activeElement, k = ae && ae.dataset && ae.dataset.k, pos = ae && ae.selectionStart;
    redraw();
    if (k) { const n = document.querySelector(`#overlay [data-k="${k}"]`); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch {} } }
  } : render;
  // class chips + search + list; state[key] = Set of ids; state.cid, state.q
  const cid = state.cid || (S.classes[0] || {}).id;
  const q = (state.q || "").trim().toLowerCase();
  const list = (q ? S.students.filter((s) => s.name.toLowerCase().includes(q)) : S.students.filter((s) => s.classId === cid)).filter((s) => s.active)
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  return [
    input("pq", { placeholder: "Search by name", value: state.q || "", oninput: (e) => { state.q = e.target.value; rd(); } }),
    q ? null : chips(S.classes.map((c) => [c.id, c.name]), cid, (id) => { state.cid = id; rd(); }),
    list.map((s) => {
      const on = state[key].has(s.id);
      return h("div", { class: "stu", onclick: () => { if (single) state[key] = new Set(on ? [] : [s.id]); else on ? state[key].delete(s.id) : state[key].add(s.id); rd(); } },
        h("div", { class: "grow" }, h("div", { class: "b" }, s.name), q ? h("div", { class: "muted" }, clsName(s.classId)) : null),
        h("span", { class: "pill", style: { background: on ? "var(--tint)" : "var(--fill)", color: on ? "#fff" : "var(--muted)" } }, on ? "Picked" : "Tap"));
    }),
  ];
}

// =====================================================================
// TAKER
// =====================================================================
function takerRoot() {
  const me = S.me, v = view;
  if (v.name === "duty") return dutyScreen(() => go("home"));
  if (v.name === "leave") return leaveScreen(() => go("home"));
  if (v.name === "clinic") return clinicScreen(() => go("home"));
  if (v.name === "comps") return compsScreen(() => go("home"));
  if (v.name === "sports") return sportsScreen(() => go("home"));
  if (v.name === "picker") return sessionPicker(v);
  if (v.name === "roster") return rosterView(v);
  v.date ||= C.todayStr();
  const myActs = S.activities.filter((a) => a.active && me.activities.includes(a.id));
  const myCls = me.classes.includes("*") ? S.classes : S.classes.filter((c) => me.classes.includes(c.id));
  if (!v.activityId && myActs.length === 1) v.activityId = myActs[0].id;
  if (!v.classId && myCls.length === 1) v.classId = myCls[0].id;
  const act = myActs.find((a) => a.id === v.activityId), cls = myCls.find((c) => c.id === v.classId);
  watchDate(v.date);
  const done = new Set(live.sessions.filter((s) => s.activityId === v.activityId).map((s) => s.classId));
  const box = (t, fn, d) => h("div", { class: "card" }, h("div", { class: "b" }, t), d ? h("div", { class: "muted" }, d) : null, h("div", { style: { marginTop: "8px" } }, h("button", { onclick: fn }, "Open")));
  return h("div", {}, appBar("Take attendance", me.name, { actions: [["Switch", switchAccount], ["Sign out", logout]] }),
    h("div", { class: "pad" },
      me.canEnterDuty ? box("Security duty", () => go("duty"), "Enter who is on Day duty and Night duty.") : null,
      me.canLeave ? box("Leave", () => go("leave")) : null,
      me.canClinic ? box("Sick Leave", () => go("clinic")) : null,
      me.canCompetitions ? box("Majlis-e-Ilmi competitions", () => go("comps")) : null,
      me.activities.includes(C.SPORTS_ID) ? box("Duty & Permissions", () => go("sports")) : null,
      (!myActs.length || !myCls.length) && !me.canEnterDuty && !me.canClinic && !me.canLeave && !me.canCompetitions ? h("div", { class: "err" }, "No activities or classes are assigned to your account yet. Please ask the housemaster.") : null,
      myActs.length && myCls.length ? [
        h("div", { class: "b" }, "1. Date"), dateRow(v.date, (d) => { v.date = d; render(); }),
        h("div", { class: "b" }, "2. What are you recording?"),
        [...new Set(myActs.map((a) => a.group))].map((g) => [h("div", { class: "muted" }, g), chips(myActs.filter((a) => a.group === g).map((a) => [a.id, a.name]), v.activityId, (id) => { v.activityId = id; render(); })]),
        myCls.length > 1 ? [h("div", { class: "b" }, "3. Class"), chips(myCls.map((c) => [c.id, c.name + (done.has(c.id) ? "  (done)" : "")]), v.classId, (id) => { v.classId = id; render(); }),
          act ? h("div", { class: "muted" }, `${myCls.filter((c) => done.has(c.id)).length} of ${myCls.length} classes done for ${act.name}`) : null]
          : (cls ? h("div", { class: "b" }, "Class: " + cls.name) : null),
        h("button", { disabled: !(act && cls), onclick: () => go(act.multi ? "picker" : "roster", { date: v.date, activityId: act.id, classId: cls.id, n: 0, title: "" }) }, "Open the list"),
      ] : null));
}
const backHome = (v) => () => go("home", { date: v.date, activityId: v.activityId, classId: v.classId });

function sessionPicker(v) {
  const act = S.activities.find((a) => a.id === v.activityId), cls = S.classes.find((c) => c.id === v.classId);
  watchDate(v.date);
  const mine = live.sessions.filter((s) => s.classId === cls.id && s.activityId === act.id).sort((a, b) => num(a) - num(b));
  const next = Math.max(0, ...mine.map(num)) + 1;
  v.newTitle ??= "";
  return h("div", {}, appBar(`${act.name} - ${cls.name}`, C.pretty(v.date), { back: backHome(v) }),
    h("div", { class: "pad" },
      mine.map((x) => h("div", { class: "card tap", onclick: () => go("roster", { ...v, name: "roster", n: x.n > 0 ? x.n : 0, title: x.title }) },
        h("div", { class: "b" }, `Session ${num(x)}` + (x.title ? ` - ${x.title}` : "")),
        h("div", { class: "muted" }, "Submitted" + (x.deviceLocal.length >= 16 ? " at " + x.deviceLocal.slice(11, 16) : "")))),
      h("div", { class: "b" }, "New session"),
      input("nt", { type: "text", placeholder: "Title (optional, e.g. Fiqh)", value: v.newTitle, oninput: (e) => { v.newTitle = e.target.value.slice(0, 30); } }),
      h("button", { onclick: () => go("roster", { ...v, name: "roster", n: next, title: v.newTitle.trim() }) }, "Start session " + next)));
}

const draftKey = (sid) => "draft:" + sid;
const loadDraft = (sid) => { try { return JSON.parse(localStorage.getItem(draftKey(sid)) || "{}"); } catch { return {}; } };
const saveDraft = (sid, m) => { try { Object.keys(m).length ? localStorage.setItem(draftKey(sid), JSON.stringify(m)) : localStorage.removeItem(draftKey(sid)); } catch {} };
const nowLocal = () => { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
function sheetMap(me, classId, date, activityId, roster, marks, absentBase, n, title) {
  return { ...(n > 0 ? { n, title: (title || "").trim() } : {}), classId, date, activityId, takerUid: me.uid, takerName: me.name, roster, marks, base: absentBase ? ST.A : ST.P,
    deviceAt: Date.now(), deviceLocal: nowLocal(), submittedAt: serverTimestamp() };
}

function rosterView(v) {
  const me = S.me, act = S.activities.find((a) => a.id === v.activityId), cls = S.classes.find((c) => c.id === v.classId);
  const n = act.multi ? v.n || 0 : 0;
  const sid = C.sessionId(cls.id, v.date, act.id, n);
  watchSheet(sid);
  const back = () => (act.multi ? go("picker", { ...v, name: "picker" }) : backHome(v)());
  const bar = appBar(act.name + (act.multi ? ` #${n <= 0 ? 1 : n}` : "") + " - " + cls.name, C.pretty(v.date), { back });
  if (!live.sheetLoaded) return h("div", {}, bar, h("div", { class: "pad" }, "Loading..."));
  const ex = live.sheet, insp = C.isInspection(act), absentBase = C.isAbsentBase(act), noLate = C.isNoLate(act);
  const dl = C.isSports(act) ? "Duty" : "Security duty";
  if (ex) {
    const eff = Object.fromEntries(ex.roster.map((i) => [i, C.effective(ex, i, insp)]));
    const vals = Object.values(eff), late = vals.filter((x) => x === ST.L).length, absent = vals.filter((x) => C.shownCode(x, ex.base === ST.A) === ST.A).length, needs = vals.filter((x) => x === ST.N).length;
    const duty = vals.filter((x) => x === ST.D).length, perm = vals.filter((x) => x === ST.S).length;
    const B = byId();
    return h("div", {}, bar, h("div", { class: "pad" },
      h("div", { class: "card", style: { background: "var(--light)" } }, h("div", { class: "b" }, "Already submitted - locked"),
        h("div", {}, "By " + ex.takerName + (ex.deviceLocal ? " at " + ex.deviceLocal.slice(11, 16) : "")),
        h("div", {}, ex.pending ? "Saved on this device - will sync when you are online." : "Synced to the housemaster."),
        h("div", {}, (insp ? `${needs} need improvement` : `${late} late, ${absent} absent`) + (duty ? `, ${duty} on duty` : "") + (perm ? `, ${perm} with permission` : "")),
        h("div", { class: "muted" }, "To change it, ask the housemaster.")),
      ex.roster.map((i) => B[i]).filter(Boolean).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())).map((s) => studentRow(s.name, "", C.shownCode(eff[s.id], ex.base === ST.A), insp, false, null, dl))));
  }
  const roster = S.students.filter((s) => s.classId === cls.id && s.active).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  const exempt = {};
  for (const s of roster) {
    if (C.dutyExcused(v.date, s.id, act.id)) exempt[s.id] = ST.D;
    else if (C.leaveCovers(v.date, s.id, act.id)) exempt[s.id] = ST.V;
    else { const sp = C.sportsStatus(v.date, s.id, act.id); if (sp) exempt[s.id] = sp; }
  }
  // duty wins over sports/leave when both apply (same order as the phone app)
  for (const s of roster) if (C.dutyExcused(v.date, s.id, act.id)) exempt[s.id] = ST.D;
  const marks = (v.marks ||= loadDraft(sid));
  const partner = S.activities.find((a) => a.active && a.id === C.PRAYER_PAIR[act.id] && me.activities.includes(a.id));
  const cnt = (f) => roster.filter((s) => !exempt[s.id] && f(marks[s.id])).length;
  const late = cnt((m) => m === ST.L), absent = cnt((m) => C.shownCode(m, absentBase) === ST.A), needs = cnt((m) => m === ST.N), dutyN = roster.filter((s) => exempt[s.id]).length;
  const summary = (insp ? `${needs} need improvement` : `${late} late, ${absent} absent`) + (dutyN ? `, ${dutyN} on duty / permission` : "") + ".";
  return h("div", {}, bar, h("div", { class: "pad" },
    v.error ? h("div", { class: "err" }, v.error) : null,
    !roster.length ? h("div", {}, "There are no students in this class.") : null,
    roster.map((s) => studentRow(s.name, "", exempt[s.id] || C.shownCode(marks[s.id], absentBase), insp, !exempt[s.id], () => {
      const nx = C.nextStatus(marks[s.id] ?? null, insp, absentBase, noLate, C.isSports(act));
      if (nx == null) delete marks[s.id]; else marks[s.id] = nx;
      saveDraft(sid, marks); render();
    }, dl)),
    partner ? check(`Prayed together with ${partner.name} (one list counts for both)`, !!v.combined, (on) => { v.combined = on; render(); }) : null,
    h("button", { disabled: !roster.length, onclick: () => confirmBox(`Submit ${act.name}?`, summary + (v.combined && partner ? ` This list also counts for ${partner.name}.` : "") + " After you submit, this list is locked. Only the housemaster can change it.", "Submit", async () => {
      v.error = "";
      const ids = roster.map((s) => s.id), m = {};
      for (const k of ids) { if (exempt[k]) m[k] = exempt[k]; else if (marks[k]) m[k] = marks[k]; }
      try {
        if (v.combined && partner) {
          const psid = C.sessionId(cls.id, v.date, partner.id);
          if ((await getDoc(doc(db, "sessions", psid))).exists()) throw new Error("The " + partner.name + " list was already submitted.");
          const m2 = {};
          for (const k of ids) { if (C.dutyExcused(v.date, k, partner.id)) m2[k] = ST.D; else if (C.leaveCovers(v.date, k, partner.id)) m2[k] = ST.V; else if (marks[k]) m2[k] = marks[k]; }
          const b = writeBatch(db);
          b.set(doc(db, "sessions", sid), sheetMap(me, cls.id, v.date, act.id, ids, m, absentBase, 0, ""));
          b.set(doc(db, "sessions", psid), sheetMap(me, cls.id, v.date, partner.id, ids, m2, C.isAbsentBase(partner), 0, ""));
          await b.commit();
        } else await setDoc(doc(db, "sessions", sid), sheetMap(me, cls.id, v.date, act.id, ids, m, absentBase, n, v.title));
        saveDraft(sid, {}); v.marks = null;
      } catch (e) { v.error = "Could not save: it may already have been submitted. (" + friendly(e) + ")"; render(); }
    }) }, "Submit")));
}

// =====================================================================
// HOUSEMASTER
// =====================================================================
function hmRoot() {
  const v = view;
  const tabs = [["today", "Today"], ["students", "Students"], ["people", "People"], ["reports", "Reports"], ["more", "More"]];
  if (v.name === "sheet") return sheetDetail(v);
  if (v.name === "record") return recordScreen(v);
  if (v.name === "duty") return dutyScreen(() => go("home", { tab: "more" }));
  if (v.name === "leave") return leaveScreen(() => go("home", { tab: "more" }));
  if (v.name === "leaveRules") return leaveRulesScreen(() => go("home", { tab: "more" }));
  if (v.name === "sports") return sportsScreen(() => go("home", { tab: "more" }));
  if (v.name === "comps") return compsScreen(() => go("home", { tab: "more" }));
  v.tab ||= "today";
  const body = { today: todayTab, students: studentsTab, people: peopleTab, reports: reportsTab, more: moreTab }[v.tab](v);
  return h("div", {}, appBar("Housemaster", S.me.name), body, navBar(tabs, v.tab, (t) => { go("home", { tab: t }); }));
}

function todayTab(v) {
  v.date ||= C.todayStr();
  watchDate(v.date);
  v.group ||= "salat";
  // Four groups: Salat, Jamia Activities, Sports, and Cleanliness together with Waqar-e-Amal.
  const groupOf = (a) => (C.isInspection(a) || a.id === "waqar_e_amal" ? "clean" : a.group === "Prayers" ? "salat" : a.id === C.SPORTS_ID || a.group === "Sports" ? "sports" : "other");
  const acts = S.activities.filter((a) => a.active && groupOf(a) === v.group);
  const sName = (id) => (S.students.find((s) => s.id === id) || { name: "(removed student)" }).name, cName = (id) => clsName(id);
  const showSick = () => {
    const list = S.clinic.filter((x) => x.date === v.date).sort((a, b) => sName(a.studentId).localeCompare(sName(b.studentId)));
    modal((close) => [h("h3", {}, `Sick on ${C.pretty(v.date)} (${list.length})`), list.length ? list.map((x) => h("div", { class: "card" }, h("div", { class: "b" }, sName(x.studentId)),
      h("div", { class: "muted" }, `${cName(x.classId)}  -  ${x.place === "hospital" ? "Hospital" : "Hostel rest"}${(x.ailments || []).length ? "  -  " + x.ailments.join(", ") : ""}`))) : h("div", {}, "Nobody was recorded sick on this day."), h("button", { class: "o", onclick: close }, "Close")]);
  };
  const showLeave = () => {
    const list = S.leaves.filter((x) => v.date >= x.from && v.date <= x.to).sort((a, b) => sName(a.studentId).localeCompare(sName(b.studentId)));
    modal((close) => [h("h3", {}, `Off campus on ${C.pretty(v.date)} (${list.length})`), list.length ? list.map((x) => h("div", { class: "card" }, h("div", { class: "b" }, sName(x.studentId)),
      h("div", { class: "muted" }, `${cName(x.classId)}  -  ${C.leaveReasonLabel(x.reason)}  -  ${C.pretty(x.from)} to ${C.pretty(x.to)}`))) : h("div", {}, "Nobody is on off-campus leave on this day."), h("button", { class: "o", onclick: close }, "Close")]);
  };
  return h("div", { class: "pad" }, dateRow(v.date, (d) => { v.date = d; render(); }),
    chips([["salat", "Salat"], ["other", "Jamia Activities"], ["sports", "Sports"], ["clean", "Cleanliness & Waqar-e-Amal"]], v.group, (g) => { v.group = g; render(); }),
    h("div", { class: "row" }, h("button", { class: "o", onclick: showSick }, "Sick today"), h("button", { class: "o", onclick: showLeave }, "On leave today")),
    acts.map((a) => h("div", { class: "card" }, h("div", { class: "b" }, a.name),
      h("div", { class: "grid", style: { gridTemplateColumns: `repeat(${S.classes.length || 1},1fr)`, marginTop: "8px" } },
        S.classes.map((c, i) => {
          const ss = live.sessions.filter((x) => x.classId === c.id && x.activityId === a.id).sort((x, y) => num(x) - num(y));
          const eff = ss.flatMap((x) => x.roster.map((id) => [C.effective(x, id, C.isInspection(a)), x.base === ST.A]));
          const late = eff.filter((e) => e[0] === ST.L).length, absent = eff.filter((e) => C.shownCode(e[0], e[1]) === ST.A).length, needs = eff.filter((e) => e[0] === ST.N).length;
          const label = !ss.length ? "" : late + absent + needs === 0 ? (ss.length > 1 ? `${ss.length}x OK` : "OK") : (ss.length > 1 ? `${ss.length}x ` : "") + [late ? late + "L" : "", absent ? absent + "A" : "", needs ? needs + "N" : ""].filter(Boolean).join(" ");
          return h("div", { class: "cell" + (ss.length ? " ok" : ""), title: c.name, onclick: () => {
            if (!ss.length) return;
            if (ss.length === 1) return go("sheet", { id: ss[0].id, back: v });
            modal((close) => [h("h3", {}, "Which sheet?"), ss.map((x) => h("button", { class: "o", onclick: () => { close(); go("sheet", { id: x.id, back: v }); } }, `Session ${num(x)}` + (x.title ? " - " + x.title : ""))), h("button", { class: "t", onclick: close }, "Close")]);
          } }, h("span", {}, String(i + 1)), label ? h("small", {}, label) : null);
        })))),
    h("div", { class: "muted" }, "Boxes 1-" + S.classes.length + " are the classes in order: " + S.classes.map((c, i) => `${i + 1} ${c.name}`).join(", ") + "."));
}

function sheetDetail(v) {
  watchSheet(v.id);
  const back = () => go("home", { tab: "today", date: v.back && v.back.date });
  if (!live.sheetLoaded) return h("div", {}, appBar("Sheet", "", { back }), h("div", { class: "pad" }, "Loading..."));
  const cur = live.sheet;
  if (!cur) { setTimeout(back, 0); return h("div", { class: "pad" }, "This sheet was deleted."); }
  const act = S.activities.find((a) => a.id === cur.activityId), insp = act && C.isInspection(act), absentBase = cur.base === ST.A, noLate = act && C.isNoLate(act);
  const B = byId();
  v.edits ||= null;
  const save = () => askAdminCode(async (code) => {});
  const editing = !!v.edits;
  return h("div", {}, appBar((act ? act.name : "Sheet") + sheetSuffix(act, cur) + " - " + clsName(cur.classId), C.pretty(cur.date), { back }),
    h("div", { class: "pad" },
      h("div", { class: "card", style: { background: "var(--light)" } }, h("div", {}, "Taken by " + cur.takerName),
        cur.deviceLocal ? h("div", { class: "b" }, `Taken at: ${cur.deviceLocal} (taker's device clock)`) : null,
        h("div", {}, cur.pending ? "Waiting to sync" : "Synced"), v.msg ? h("div", { class: "b" }, v.msg) : null),
      h("div", { class: "row wrap" }, !editing ?
        h("button", { onclick: () => askAdminCode((code) => { v.code = code; v.edits = { ...cur.marks }; v.msg = ""; render(); }) }, "Correct this sheet (admin code)") :
        [h("button", { disabled: v.busy, onclick: async () => {
          v.busy = true; render();
          try { await commitWithProof(v.code, (b) => b.update(doc(db, "sessions", v.id), { marks: v.edits, correctedAt: serverTimestamp(), correctedBy: S.me.name })); v.edits = null; v.code = ""; v.msg = "Saved."; }
          catch (e) { v.msg = String(e.code).includes("permission-denied") ? "Rejected: wrong admin code." : friendly(e); }
          v.busy = false; render();
        } }, v.busy ? "Saving..." : "Save"),
        h("button", { class: "o", onclick: () => { v.edits = null; v.code = ""; render(); } }, "Cancel"),
        h("button", { class: "o", onclick: () => confirmBox("Delete this sheet?", "The sheet is removed, so the taker can submit it again. This cannot be undone.", "Delete", async () => {
          try { await commitWithProof(v.code, (b) => b.delete(doc(db, "sessions", v.id))); } catch (e) { v.msg = friendly(e); render(); }
        }, true) }, "Delete")]),
      h("div", { class: "muted" }, editing ? "Editing: tap a name to change it." : "Locked."),
      cur.roster.map((i) => B[i]).filter(Boolean).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())).map((s) =>
        studentRow(s.name, "", C.shownCode(editing ? v.edits[s.id] : C.effective(cur, s.id, insp), absentBase), insp, editing, () => {
          const nx = C.nextStatusHm(v.edits[s.id] ?? null, insp, absentBase, noLate, cur.activityId === C.SPORTS_ID);
          if (nx == null) delete v.edits[s.id]; else v.edits[s.id] = nx; render();
        }, "Duty"))));
}

function studentsTab(v) {
  v.q ??= ""; v.archived ??= false;
  const cid = v.cid || (S.classes[0] || {}).id, q = v.q.trim().toLowerCase();
  const list = S.students.filter((s) => (q ? s.name.toLowerCase().includes(q) : s.classId === cid) && (s.active || v.archived)).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  return h("div", { class: "pad" },
    input("sq", { placeholder: "Search by name", value: v.q, oninput: (e) => { v.q = e.target.value; render(); } }),
    q ? null : chips(S.classes.map((c) => [c.id, `${c.name} (${S.students.filter((s) => s.classId === c.id && s.active).length})`]), cid, (id) => { v.cid = id; render(); }),
    h("div", { class: "row" }, h("button", { onclick: () => studentDialog(null, cid) }, "Add student"), h("div", { class: "grow" }), check("Archived", v.archived, (on) => { v.archived = on; render(); })),
    list.map((s) => h("div", { class: "card tap", onclick: () => studentDialog(s, cid) }, h("div", { class: "row" },
      h("div", { class: "grow" }, h("div", { class: "b" }, s.name), h("div", { class: "muted" }, [s.country, s.aims && "AIMS " + s.aims].filter(Boolean).join(" - ") + (s.active ? "" : "   [archived]"))),
      h("button", { class: "o", onclick: (e) => { e.stopPropagation(); go("record", { st: s, back: v }); } }, "Record")))));
}
function studentDialog(init, defCls) {
  modal((close) => {
    const f = { name: init ? init.name : "", country: init ? init.country : "", aims: init ? init.aims : "", cls: init ? init.classId : defCls, active: init ? init.active : true };
    const inp = (k, ph) => h("input", { type: "text", placeholder: ph, value: f[k], oninput: (e) => (f[k] = e.target.value) });
    const clsBox = h("div", {});
    const drawCls = () => clsBox.replaceChildren(chips(S.classes.map((c) => [c.id, c.name]), f.cls, (id) => { f.cls = id; drawCls(); }));
    drawCls();
    return [h("h3", {}, init ? "Edit student" : "Add student"), inp("name", "Name"), inp("country", "Country"), inp("aims", "AIMS number (optional)"),
      h("div", { class: "muted" }, "Class (pick another class to transfer)"), clsBox,
      init ? check("Active (untick to archive: removed from attendance lists, history is kept)", f.active, (on) => (f.active = on)) : null,
      h("div", { class: "row" }, h("button", { class: "o", onclick: close }, "Cancel"), h("div", { class: "grow" }), h("button", { onclick: async () => {
        if (!f.name.trim() || !f.cls) return;
        const id = init ? init.id : doc(collection(db, "students")).id;
        await setDoc(doc(db, "students", id), { name: f.name.trim(), country: f.country.trim(), aims: f.aims.trim(), classId: f.cls, active: f.active });
        close();
      } }, "Save"))];
  });
}

function peopleTab(v) {
  const A = Object.fromEntries(S.activities.map((a) => [a.id, a.name])), K = Object.fromEntries(S.classes.map((c) => [c.id, c.name]));
  const people = S.users.filter((u) => u.role !== "housemaster").sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  return h("div", { class: "pad" }, h("button", { onclick: () => personDialog(null) }, "Add person"),
    h("div", { class: "muted" }, "Each person can only record the activities and classes you tick for them."),
    people.map((p) => h("div", { class: "card tap", onclick: () => personDialog(p) },
      h("div", { class: "b" }, p.name + (p.canEnterDuty ? "   (enters duty list)" : "") + (p.canClinic ? "   (Jamia Clinic)" : "") + (p.canLeave ? "   (Leave)" : "") + (p.canCompetitions ? "   (Competitions)" : "") + (p.active ? "" : "   [inactive]")),
      h("div", { class: "muted" }, "Username: " + displayUsername(p.username)),
      h("div", { class: "muted" }, "Records: " + (p.activities.map((i) => A[i]).filter(Boolean).join(", ") || "nothing")),
      h("div", { class: "muted" }, "Classes: " + (p.classes.includes("*") ? "All classes" : p.classes.map((i) => K[i]).filter(Boolean).join(", ") || "none")))));
}
async function createTaker(name, username, password, activities, classes, canEnterDuty, canClinic, canLeave, canCompetitions) {
  let app2; try { app2 = (await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js")).getApp("secondary"); } catch { app2 = initializeApp(firebaseConfig, "secondary"); }
  const a2 = getAuth(app2), email = emailFor(username);
  const uid = (await createUserWithEmailAndPassword(a2, email, password)).user.uid;
  await signOut(a2);
  await setDoc(doc(db, "users", uid), { name: name.trim(), username: email, role: "taker", active: true, activities, classes, canEnterDuty, canClinic, canLeave, canCompetitions });
}
function personDialog(init) {
  modal((close) => {
    const f = { name: init ? init.name : "", username: init ? displayUsername(init.username) : "", password: "", acts: new Set(init ? init.activities : []),
      all: init ? init.classes.includes("*") : false, cls: new Set(init ? init.classes.filter((c) => c !== "*") : []), duty: init ? init.canEnterDuty : false,
      clinic: init ? init.canClinic : false, leave: init ? init.canLeave : false, comp: init ? init.canCompetitions : false, active: init ? init.active : true };
    const body = h("div", { class: "pad", style: { padding: 0 } });
    const err = h("div", { class: "err" });
    const ids = (...g) => new Set(S.activities.filter((a) => a.active && g.includes(a.group)).map((a) => a.id));
    const draw = () => {
      body.replaceChildren(...[
        h("input", { type: "text", placeholder: "Full name", value: f.name, oninput: (e) => (f.name = e.target.value) }),
        init ? h("div", { class: "muted" }, "Username: " + displayUsername(init.username)) : [
          h("input", { type: "text", placeholder: "Username (for sign in)", autocapitalize: "none", value: f.username, oninput: (e) => (f.username = e.target.value.replace(/ /g, "")) }),
          h("input", { type: "password", placeholder: "Password (6+ characters)", value: f.password, oninput: (e) => (f.password = e.target.value) })],
        h("div", { class: "b" }, "Quick setup"),
        h("div", { class: "hscroll" },
          [["Salat taker", () => { f.acts = ids("Prayers", "Class"); f.all = false; }], ["Assembly", () => { f.acts = ids("Assemblies"); f.all = true; }],
           ["Programs", () => { f.acts = ids("Programs", "Inspection"); f.all = true; }], ["Sports", () => { f.acts = ids("Sports"); f.all = true; }],
           ["Duty list only", () => { f.acts = new Set(); f.all = false; f.cls = new Set(); f.duty = true; }],
           ["Jamia Clinic", () => { f.acts = new Set(); f.all = false; f.cls = new Set(); f.duty = false; f.clinic = true; f.leave = false; f.comp = false; }],
           ["Leave", () => { f.acts = new Set(); f.all = false; f.cls = new Set(); f.duty = false; f.clinic = false; f.leave = true; f.comp = false; }],
           ["Competitions", () => { f.acts = new Set(); f.all = false; f.cls = new Set(); f.duty = false; f.clinic = false; f.leave = false; f.comp = true; }]]
            .map(([l, fn]) => h("button", { class: "o", onclick: () => { fn(); draw(); } }, l))),
        check("Can enter the security duty list", f.duty, (on) => (f.duty = on)), check("Jamia Clinic (records Sick Leave)", f.clinic, (on) => (f.clinic = on)), check("Leave (records Jamia off-campus leave)", f.leave, (on) => (f.leave = on)), check("Competitions (enters Majlis-e-Ilmi results)", f.comp, (on) => (f.comp = on)),
        h("div", { class: "b" }, "Can record"),
        [...new Set(S.activities.filter((a) => a.active).map((a) => a.group))].map((g) => [h("div", { class: "muted" }, g), S.activities.filter((a) => a.active && a.group === g).map((a) => check(a.name, f.acts.has(a.id), (on) => (on ? f.acts.add(a.id) : f.acts.delete(a.id))))]),
        h("div", { class: "b" }, "For these classes"), check("All classes", f.all, (on) => { f.all = on; draw(); }),
        S.classes.map((c) => check(c.name, f.cls.has(c.id), (on) => (on ? f.cls.add(c.id) : f.cls.delete(c.id)), f.all)),
        init ? check("Account active (untick to block this person)", f.active, (on) => (f.active = on)) : null].flat(Infinity).filter((x) => x != null && x !== false));
    };
    draw();
    const save = h("button", { onclick: async () => {
      const canRec = f.acts.size && (f.all || f.cls.size);
      if (!f.name.trim() || !(canRec || f.duty || f.clinic || f.leave || f.comp)) { err.textContent = "Add a name and at least one thing this person can do."; return; }
      if (!init && (f.username.trim().length < 3 || f.password.length < 6)) { err.textContent = "Username 3+ characters and password 6+ characters."; return; }
      save.disabled = true; err.textContent = "";
      const classes = f.all ? ["*"] : [...f.cls];
      try {
        if (!init) await createTaker(f.name, f.username, f.password, [...f.acts], classes, f.duty, f.clinic, f.leave, f.comp);
        else await updateDoc(doc(db, "users", init.uid), { name: f.name.trim(), activities: [...f.acts], classes, canEnterDuty: f.duty, canClinic: f.clinic, canLeave: f.leave, canCompetitions: f.comp, active: f.active });
        close();
      } catch (e) { err.textContent = friendly(e); save.disabled = false; }
    } }, "Save");
    return [h("h3", {}, init ? "Edit person" : "Add person"), body, err, h("div", { class: "row" }, h("button", { class: "o", onclick: close }, "Cancel"), h("div", { class: "grow" }), save)];
  });
}

// ---------- reports ----------
const csvq = (s) => '"' + String(s).replace(/"/g, '""') + '"';
function download(name, blob) {
  const a = h("a", { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
function savePdf(doc, name) { download(name, doc.output("blob")); }

function reportsTab(v) {
  v.from ||= C.todayStr().slice(0, 8) + "01"; v.to ||= C.todayStr(); v.filter ||= "all"; v.cid ??= null;
  const groups = [...new Set(S.activities.map((a) => a.group))];
  const idsFor = (k) => (k === "all" ? S.activities.map((a) => a.id) : k.startsWith("g:") ? S.activities.filter((a) => a.group === k.slice(2)).map((a) => a.id) : [k.slice(2)]);
  const labelFor = (k) => (k === "all" ? "Everything" : k.startsWith("g:") ? k.slice(2) : (S.activities.find((a) => a.id === k.slice(2)) || {}).name || k);
  const subtitle = `${v.from} to ${v.to}  |  ${v.cid ? clsName(v.cid) : "All classes"}  |  ${labelFor(v.filter)}`;
  const rows = v.rows, ranks = rows ? C.classRanks(rows) : [];
  const run = async (fn) => { v.loading = true; v.err = ""; render(); try { await fn(); } catch (e) { v.err = friendly(e); } v.loading = false; render(); };
  return h("div", { class: "pad" },
    h("div", { class: "b" }, "From"), dateRow(v.from, (d) => { v.from = d; render(); }), h("div", { class: "b" }, "To"), dateRow(v.to, (d) => { v.to = d; render(); }),
    h("div", { class: "b" }, "Class"), chips([[null, "All classes"], ...S.classes.map((c) => [c.id, c.name])], v.cid, (id) => { v.cid = id; v.rows = null; render(); }),
    h("div", { class: "b" }, "Activity"), chips([["all", "Everything"], ...groups.map((g) => ["g:" + g, g])], v.filter, (k) => { v.filter = k; render(); }),
    chips(S.activities.map((a) => ["a:" + a.id, a.name]), v.filter, (k) => { v.filter = k; render(); }),
    h("button", { disabled: v.loading, onclick: () => run(async () => { const ss = await fetchSessions(v.from, v.to); v.sheetCount = ss.filter((s) => !v.cid || s.classId === v.cid).length; v.rows = C.buildReport(ss, v.cid, idsFor(v.filter)); }) }, v.loading ? "Working..." : "Make report"),
    v.cid ? h("button", { class: "o", disabled: v.loading, onclick: () => run(async () => {
      const ss = await fetchSessions(v.from, v.to), recs = [];
      const pupils = S.students.filter((s) => s.classId === v.cid && s.active).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
      for (const st of pupils) recs.push(C.buildStudentRecord(st, ss, v.from, v.to));
      savePdf(classPdf(recs), `records_${clsName(v.cid).replace(/[^A-Za-z0-9]+/g, "_")}_${v.from}_to_${v.to}.pdf`);
    }) }, v.loading ? "Working..." : "All student records of this class (1 page each)") : null,
    v.err ? h("div", { class: "err" }, v.err) : null,
    rows ? [
      h("div", { class: "b" }, `${rows.length} students from ${v.sheetCount} sheets`),
      h("div", { class: "muted" }, "Present = 1, Late = 0.5, Absent = 0. Big % = combined: Salat 30 + Jamia activities 30 + Sports 20 + Cleanliness 20."),
      h("div", { class: "row wrap" },
        h("button", { class: "o", onclick: () => {
          const acts = S.activities.filter((a) => idsFor(v.filter).includes(a.id) && !C.isInspection(a));
          const head = ["Class", "Rank in class", "Name", "Country", "AIMS No", "Combined %", "Salat % (30)", "Jamia activities % (30)", "Sports % (20)", "Cleanliness % (20)", "Excused", ...acts.map((a) => a.name + " %")];
          const f1 = (x) => (x == null ? "" : x.toFixed(1));
          const lines = [head.map(csvq).join(",")];
          rows.forEach((r, i) => lines.push([r.className, ranks[i] ?? "", r.student.name, r.student.country, r.student.aims, f1(r.pct), f1(r.parts.salat), f1(r.parts.other), f1(r.parts.sports), f1(r.parts.clean), r.excused,
            ...acts.map((a) => { const p = r.per[a.id]; return p && p[1] > 0 ? (p[0] / p[1] * 100).toFixed(1) : ""; })].map(csvq).join(",")));
          download(`attendance_${v.from}_to_${v.to}.csv`, new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv" }));
        } }, "Export Excel (CSV)"),
        h("button", { class: "o", onclick: () => savePdf(reportPdf("Attendance report", subtitle, rows, ranks), `attendance_${v.from}_to_${v.to}.pdf`) }, "Export PDF")),
      rows.map((r, i) => [
        i === 0 || rows[i - 1].student.classId !== r.student.classId ? h("h3", { style: { color: "var(--green)" } }, `${r.className}  (${rows.filter((x) => x.student.classId === r.student.classId).length} students, highest score first)`) : null,
        h("div", { class: "card" }, h("div", { class: "row" }, h("div", { class: "b", style: { width: "44px" } }, ranks[i] ? "#" + ranks[i] : "-"),
          h("div", { class: "grow" }, h("div", { class: "b" }, r.student.name + (r.student.active ? "" : " [archived]")),
            h("div", { class: "muted" }, `Salat ${C.fmtPct(r.parts.salat)}  |  Other ${C.fmtPct(r.parts.other)}  |  Sports ${C.fmtPct(r.parts.sports)}  |  Clean ${C.fmtPct(r.parts.clean)}` + (r.excused ? `  |  ${r.excused} excused` : ""))),
          h("div", { class: "big", style: { fontSize: "20px" } }, C.fmtPct(r.pct))))]),
    ] : null);
}

function recordScreen(v) {
  const st = v.st;
  v.from ||= C.todayStr().slice(0, 8) + "01"; v.to ||= C.todayStr();
  const back = () => go("home", { tab: "students" });
  const r = v.rec;
  return h("div", {}, appBar(st.name, clsName(st.classId), { back }), h("div", { class: "pad" },
    h("div", { class: "b" }, "From"), dateRow(v.from, (d) => { v.from = d; render(); }), h("div", { class: "b" }, "To"), dateRow(v.to, (d) => { v.to = d; render(); }),
    h("button", { disabled: v.loading, onclick: async () => {
      v.loading = true; v.err = ""; render();
      try { v.rec = C.buildStudentRecord(st, await fetchSessions(v.from, v.to), v.from, v.to); } catch (e) { v.err = friendly(e); }
      v.loading = false; render();
    } }, v.loading ? "Working..." : "Make record"),
    v.err ? h("div", { class: "err" }, v.err) : null,
    r ? [h("div", { class: "card" }, h("div", { class: "muted" }, "Combined percentage"), h("div", { class: "big" }, C.fmtPct(r.combined)),
      h("div", { class: "b" }, r.rank != null ? `Rank in class: #${r.rank} of ${r.classSize}` : "Nothing recorded in this period."),
      C.PARTS.map((k) => { const c = r.partCounts[k]; return h("div", { class: "muted" }, `${C.partTitle(k)}: ${C.fmtPct(r.parts[k])}   (${c[0]} present, ${c[1]} late, ${c[2]} absent, ${c[3]} excused)`); }),
      h("div", { class: "muted" }, `${r.entries.length} sheets in this period.`),
      h("div", { class: "muted" }, `Sick: ${r.sick.length} time(s), ${r.sick.filter((x) => x.place === "hospital").length} hospital visit(s).`),
      h("div", { class: "muted" }, `Leave: ${r.leaves.length} time(s), ${r.leaves.reduce((a, l) => a + C.leaveDaysIn(l, r.from, r.to), 0)} day(s) away.`)),
      h("button", { onclick: () => savePdf(studentPdf(r), `record_${st.name.replace(/[^A-Za-z0-9]+/g, "_")}_${v.from}_to_${v.to}.pdf`) }, "Export PDF")] : null));
}

// ---------- More ----------
function moreTab(v) {
  const box = (t, d, ...btns) => h("div", { class: "card" }, h("div", { class: "b" }, t), d ? h("div", { class: "muted" }, d) : null, h("div", { class: "row wrap", style: { marginTop: "8px" } }, btns));
  return h("div", { class: "pad" },
    box("Duty & Permissions", "", h("button", { class: "o", onclick: () => go("sports") }, "Open")),
    box("Majlis-e-Ilmi competitions", "Enter results: 1st, 2nd, 3rd.", h("button", { class: "o", onclick: () => go("comps") }, "Open")),
    box("Security duty list", "Who is on Day / Night duty.", h("button", { class: "o", onclick: () => go("duty") }, "Open")),
    box("Jamia off-campus leave", "", h("button", { class: "o", onclick: () => go("leave") }, "Open"), h("button", { class: "o", onclick: () => go("leaveRules") }, "Leave rules")),
    box("Class list", "Load the 2026-2027 class list and the Jamia Classes / Study Time activities.", h("button", { class: "o", disabled: v.syncing, onclick: () => confirmBox("Update class list?",
      "This loads the 2026-2027 class list: it adds new students, corrects names and countries, archives students who left (their records are kept) and adds Jamia Classes and Study Time if they are missing. AIMS numbers you typed are not touched.", "Update",
      async () => { v.syncing = true; v.syncMsg = ""; render(); try { v.syncMsg = await syncSeed(); } catch (e) { v.syncMsg = friendly(e); } v.syncing = false; render(); }) }, v.syncing ? "Updating..." : "Update class list"),
      v.syncMsg ? h("div", { class: "b" }, v.syncMsg) : null),
    box("Academic year", `Yearly reports follow these dates. Now: ${C.ayText(S.academicYear)}.`, h("button", { class: "o", onclick: academicYearDialog }, "Set academic year")),
    box("Housemaster signature", S.signature ? "Your uploaded signature appears on every PDF report." : "The default signature appears on every PDF report.", h("button", { class: "o", onclick: signatureDialog }, "Upload / change signature")),
    box("Admin code", "Needed to correct or delete a submitted sheet.", h("button", { class: "o", onclick: changeCodeDialog }, "Change admin code")),
    box("Duty exemptions", "Which activities security duty excuses (Day duty, Night duty, and the morning after Night duty).", h("button", { class: "o", onclick: dutyRulesDialog }, "Edit duty exemptions")),
    h("div", { class: "row" }, h("div", { class: "b grow" }, "Activities"), h("button", { class: "o", onclick: () => activityDialog(null) }, "Add activity")),
    S.activities.map((a) => h("div", { class: "card tap", onclick: () => activityDialog(a) }, h("div", { class: "b" }, a.name + (a.active ? "" : "   [hidden]")), h("div", { class: "muted" }, a.group + " - " + (C.isInspection(a) ? "Pass / Needs improvement" : "Present / Late / Absent")))),
    h("button", { class: "o", onclick: switchAccount }, "Switch account"), h("button", { onclick: logout }, "Sign out"),
    );
}
async function syncSeed() {
  const seed = await (await fetch("seed.json", { cache: "no-store" })).json();
  const have = Object.fromEntries((await getDocs(collection(db, "students"))).docs.map((d) => [d.id, d.data()]));
  const ops = []; let added = 0, changed = 0, archived = 0, newActs = 0;
  for (const st of seed.students) {
    const d = have[st.id];
    if (!d) { added++; ops.push((b) => b.set(doc(db, "students", st.id), { name: st.name, country: st.country, aims: st.aims, classId: st.classId, active: true })); }
    else if (d.name !== st.name || d.country !== st.country || d.classId !== st.classId) { changed++; ops.push((b) => b.update(doc(db, "students", st.id), { name: st.name, country: st.country, classId: st.classId })); }
  }
  for (const id of seed.removed || []) { const d = have[id]; if (d && d.active !== false) { archived++; ops.push((b) => b.update(doc(db, "students", id), { active: false })); } }
  const acts = Object.fromEntries((await getDocs(collection(db, "activities"))).docs.map((d) => [d.id, d.data()]));
  for (const a of C.DEFAULT_ACTIVITIES) {
    if (acts[a.id] && acts[a.id].order !== a.order) ops.push((b) => b.update(doc(db, "activities", a.id), { order: a.order }));
    if (a.multi && acts[a.id] && acts[a.id].multi !== true) ops.push((b) => b.update(doc(db, "activities", a.id), { multi: true }));
    if (!acts[a.id]) { newActs++; ops.push((b) => b.set(doc(db, "activities", a.id), { name: a.name, group: a.group, type: a.type, order: a.order, active: true, multi: a.multi })); }
  }
  for (let i = 0; i < ops.length; i += 400) { const b = writeBatch(db); ops.slice(i, i + 400).forEach((f) => f(b)); await b.commit(); }
  return `Done: ${added} students added, ${changed} corrected, ${archived} archived, ${newActs} activities added.`;
}
function academicYearDialog() {
  modal((close) => {
    const M = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"], ay = S.academicYear;
    const mk = (v) => { const el = h("select", {}, M.map((m, i) => h("option", { value: i + 1 }, m))); el.value = String(v); return el; };
    const dk = (v) => h("input", { type: "number", min: 1, max: 31, value: v, style: "width:70px" });
    const sm = mk(ay.sm), sd = dk(ay.sd), em = mk(ay.em), ed = dk(ay.ed), err = h("div", { class: "err" });
    return [h("h3", {}, "Academic year"), h("div", { class: "muted" }, "Starts on"), h("div", { class: "row" }, sm, sd), h("div", { class: "muted" }, "Ends on"), h("div", { class: "row" }, em, ed), err,
      h("div", { class: "row" }, h("button", { class: "o", onclick: close }, "Cancel"), h("div", { class: "grow" }),
        h("button", { onclick: async () => {
          const v = { sm: +sm.value, sd: +sd.value, em: +em.value, ed: +ed.value };
          if (![v.sd, v.ed].every((d) => d >= 1 && d <= 31)) { err.textContent = "Days must be 1 to 31."; return; }
          await setDoc(doc(db, "config", "academicYear"), v); toast("Saved."); close();
        } }, "Save"))];
  });
}
// Turns a photo of a signature into a small transparent PNG (white paper becomes see-through).
async function signaturePng(file) {
  const bmp = await createImageBitmap(file), k = Math.min(1, 500 / bmp.width), w = Math.round(bmp.width * k), hh = Math.round(bmp.height * k);
  const cv = document.createElement("canvas"); cv.width = w; cv.height = hh;
  const cx = cv.getContext("2d", { willReadFrequently: true }); cx.drawImage(bmp, 0, 0, w, hh);
  const im = cx.getImageData(0, 0, w, hh), d = im.data; let x0 = w, y0 = hh, x1 = 0, y1 = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] + d[i + 1] + d[i + 2]) / 3, a = Math.max(0, Math.min(1, (235 - g) / 150)) * 255;
    d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = a;
    if (a > 40) { const p = i / 4, x = p % w, y = (p / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 <= x0 || y1 <= y0) throw new Error("No signature found in that picture.");
  cx.putImageData(im, 0, 0);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, P = 12;
  const tint = (col) => { const t = document.createElement("canvas"); t.width = cw; t.height = ch; const c = t.getContext("2d"); c.drawImage(cv, x0, y0, cw, ch, 0, 0, cw, ch); c.globalCompositeOperation = "source-in"; c.fillStyle = col; c.fillRect(0, 0, cw, ch); return t; };
  const o = document.createElement("canvas"); o.width = cw + 2 * P; o.height = ch + 2 * P; const c = o.getContext("2d");
  c.shadowColor = "rgba(0,0,0,0.4)"; c.shadowBlur = 6; c.shadowOffsetX = 3; c.shadowOffsetY = 4; c.drawImage(tint("#000"), P, P);   // soft shadow
  c.shadowColor = "transparent"; c.shadowBlur = 0; c.shadowOffsetX = 0; c.shadowOffsetY = 0;
  c.globalAlpha = 0.85; c.drawImage(tint("#fff"), P - 1, P - 1); c.globalAlpha = 1;                                                   // raised edge highlight
  c.drawImage(tint("#121426"), P, P);                                                                                                  // blue-black ink
  return o.toDataURL("image/png");
}
function signatureDialog() {
  modal((close) => {
    const err = h("div", { class: "err" }), prev = h("img", { src: S.signature || DEFAULT_SIG, style: "max-width:100%;max-height:90px;background:#f5f0e6;padding:8px;border-radius:8px" });
    const file = h("input", { type: "file", accept: "image/*", style: "display:none", onchange: async () => {
      const f = file.files[0]; if (!f) return; err.textContent = "";
      try { const data = await signaturePng(f); await setDoc(doc(db, "config", "signature"), { data }); toast("Signature saved."); close(); } catch (e) { err.textContent = e.message || "Could not use that picture."; }
    } });
    return [h("h3", {}, "Housemaster signature"), h("div", { class: "muted" }, "Sign on plain white paper, take a clear photo and upload it. The white background is removed automatically. It appears above the Housemaster line on every PDF, with the print date beside it."), prev, file, err,
      h("div", { class: "row" }, h("button", { class: "o", onclick: close }, "Cancel"),
        h("button", { class: "o", onclick: async () => { await deleteDoc(doc(db, "config", "signature")); toast("Default signature restored."); close(); } }, "Use default"),
        h("div", { class: "grow" }), h("button", { onclick: () => file.click() }, "Choose picture"))];
  });
}
function changeCodeDialog() {
  modal((close) => {
    const a = h("input", { type: "password", inputmode: "numeric", placeholder: "Current code" }), b = h("input", { type: "password", inputmode: "numeric", placeholder: "New code (4+ digits)" }), c = h("input", { type: "password", inputmode: "numeric", placeholder: "Repeat new code" });
    const err = h("div", { class: "err" }), ok = h("button", { onclick: async () => {
      if (a.value.length < 4 || b.value.length < 4 || b.value !== c.value) { err.textContent = "Check the codes (4+ digits, new codes must match)."; return; }
      if (Lock.left() > 0) { err.textContent = "Too many wrong attempts. Try again later."; return; }
      ok.disabled = true;
      try { await commitWithProof(a.value, (bt) => bt.set(doc(db, "settings", "admin"), { code: b.value })); Lock.reset(); toast("Admin code changed."); close(); }
      catch (e) { if (String(e.code).includes("permission-denied")) { Lock.fail(); err.textContent = "Wrong current code."; } else err.textContent = "Could not change it. You need internet for this."; ok.disabled = false; }
    } }, "Change");
    return [h("h3", {}, "Change admin code"), a, b, c, err, h("div", { class: "row" }, h("button", { class: "o", onclick: close }, "Cancel"), h("div", { class: "grow" }), ok)];
  });
}
function activityDialog(init) {
  modal((close) => {
    const f = { name: init ? init.name : "", group: init ? init.group : "Programs", type: init ? init.type : "attendance", active: init ? init.active : true, multi: init ? init.multi : false };
    const tp = h("div", {}), drawT = () => tp.replaceChildren(chips([["attendance", "Present / Late / Absent"], ["inspection", "Pass / Needs improvement"]], f.type, (t) => { f.type = t; drawT(); })); drawT();
    return [h("h3", {}, init ? "Edit activity" : "Add activity"), h("input", { type: "text", placeholder: "Name", value: f.name, oninput: (e) => (f.name = e.target.value) }),
      h("input", { type: "text", placeholder: "Group (e.g. Prayers, Programs)", value: f.group, oninput: (e) => (f.group = e.target.value) }),
      init ? null : [h("div", { class: "muted" }, "Marking"), tp],
      check("Allow several sheets a day (like Study Time)", f.multi, (on) => (f.multi = on)), check("Visible (untick to hide; old records are kept)", f.active, (on) => (f.active = on)),
      h("div", { class: "row" }, h("button", { class: "o", onclick: close }, "Cancel"), h("div", { class: "grow" }), h("button", { onclick: async () => {
        if (!f.name.trim() || !f.group.trim()) return;
        if (!init) {
          let id = f.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "activity";
          if (S.activities.some((a) => a.id === id)) id += "_" + (Date.now() % 10000);
          await setDoc(doc(db, "activities", id), { name: f.name.trim(), group: f.group.trim(), type: f.type, order: Math.max(0, ...S.activities.map((a) => a.order)) + 1, active: f.active, multi: f.multi });
        } else await updateDoc(doc(db, "activities", init.id), { name: f.name.trim(), group: f.group.trim(), active: f.active, multi: f.multi });
        close();
      } }, "Save"))];
  });
}
function ruleSection(title, acts, set) {
  return [h("div", { class: "b" }, title), acts.map((a) => check(a.name, set.has(a.id), (on) => (on ? set.add(a.id) : set.delete(a.id))))];
}
function dutyRulesDialog() {
  modal((close) => {
    const r = S.dutyRules, day = new Set(r.day), night = new Set(r.night), next = new Set(r.nightNext), acts = S.activities.filter((a) => a.active);
    return [h("h3", {}, "Duty exemptions"), ruleSection("Day duty excuses, on the same day:", acts, day), ruleSection("Night duty excuses, the same evening:", acts, night), ruleSection("Night duty excuses, the NEXT day:", acts, next),
      h("div", { class: "row" }, h("button", { class: "o", onclick: () => { day.clear(); night.clear(); next.clear(); C.DEFAULT_DUTY_RULES.day.forEach((x) => day.add(x)); C.DEFAULT_DUTY_RULES.night.forEach((x) => night.add(x)); C.DEFAULT_DUTY_RULES.nightNext.forEach((x) => next.add(x)); close(); dutyRulesDialogWith(day, night, next); } }, "Reset to default"),
        h("div", { class: "grow" }), h("button", { class: "o", onclick: close }, "Cancel"),
        h("button", { onclick: async () => { await setDoc(doc(db, "config", "dutyRules"), { day: [...day], night: [...night], nightNext: [...next] }); close(); } }, "Save"))];
  });
}
function dutyRulesDialogWith(day, night, next) {
  modal((close) => { const acts = S.activities.filter((a) => a.active);
    return [h("h3", {}, "Duty exemptions (defaults loaded)"), ruleSection("Day duty excuses, on the same day:", acts, day), ruleSection("Night duty excuses, the same evening:", acts, night), ruleSection("Night duty excuses, the NEXT day:", acts, next),
      h("div", { class: "row" }, h("button", { class: "o", onclick: close }, "Cancel"), h("div", { class: "grow" }), h("button", { onclick: async () => { await setDoc(doc(db, "config", "dutyRules"), { day: [...day], night: [...night], nightNext: [...next] }); close(); } }, "Save"))]; });
}
function leaveRulesScreen(back) {
  const v = view, r = S.leaveRules, acts = S.activities.filter((a) => a.active), all = acts.map((a) => a.id);
  v.thu ||= new Set(r.thu); v.fri ||= new Set(r.fri ?? all); v.sat ||= new Set(r.sat);
  return h("div", {}, appBar("Leave rules", "Which activities Last Saturday Leave covers", { back }), h("div", { class: "pad" },
    ruleSection("First day (Thursday), from Zuhr onwards:", acts, v.thu), ruleSection("Days in between:", acts, v.fri), ruleSection("Last day (Saturday), until Asr:", acts, v.sat),
    h("div", { class: "row" }, h("button", { class: "o", onclick: () => { v.thu = new Set(C.DEFAULT_LEAVE_RULES.thu); v.fri = new Set(all); v.sat = new Set(C.DEFAULT_LEAVE_RULES.sat); render(); } }, "Reset to default"), h("div", { class: "grow" }),
      h("button", { onclick: async () => { await setDoc(doc(db, "config", "leaveRules"), { thu: [...v.thu], fri: [...v.fri], sat: [...v.sat] }); toast("Saved."); back(); } }, "Save"))));
}

// ---------- Security duty ----------
function dutyScreen(back) {
  const v = view; v.date ||= C.todayStr();
  const d = S.dutyDays[v.date] || { day: [], night: [] }, B = byId();
  const rm = (type, id) => setDoc(doc(db, "duty", v.date), { [type]: arrayRemove(id) }, { merge: true });
  const list = (type, ids) => ids.map((i) => B[i]).filter(Boolean).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())).map((s) =>
    h("div", { class: "card" }, h("div", { class: "row" }, h("div", { class: "grow" }, h("div", { class: "b" }, s.name), h("div", { class: "muted" }, clsName(s.classId))), h("button", { class: "t", onclick: () => rm(type, s.id) }, "Remove"))));
  return h("div", {}, appBar("Security duty", "Enter who is on Day and Night duty", { back }), h("div", { class: "pad" },
    dateRow(v.date, (x) => { v.date = x; render(); }), h("button", { onclick: () => addDutyDialog(v.date) }, "Add duty"), h("button", { class: "o", onclick: dutyRulesDialog }, "Duty exemption rules"),
    h("div", { class: "muted" }, "Students on duty are excused automatically on the taker's list, using the exemption rules."),
    h("div", { class: "b" }, `Day duty on ${C.pretty(v.date)} (${d.day.length})`), d.day.length ? null : h("div", { class: "muted" }, "Nobody."), list("day", d.day),
    h("div", { class: "b" }, `Night duty on ${C.pretty(v.date)} (${d.night.length})`), d.night.length ? null : h("div", { class: "muted" }, "Nobody."), list("night", d.night)));
}
function addDutyDialog(defDate) {
  modal((close) => {
    const f = { type: "day", from: defDate, to: defDate, picked: new Set(), cid: null, q: "" };
    const body = h("div", { class: "pad", style: { padding: 0 } }), err = h("div", { class: "err" });
    const days = () => C.daysBetween(f.from, f.to) + 1;
    const draw = () => {
      body.replaceChildren(h("div", { class: "b" }, "Type"), chips([["day", "Day duty"], ["night", "Night duty"]], f.type, (t) => { f.type = t; draw(); }),
        h("div", { class: "b" }, "From"), dateRow(f.from, (x) => { f.from = x; if (f.to < x) f.to = x; draw(); }),
        h("div", { class: "b" }, "To (same day = one day only)"), dateRow(f.to, (x) => { f.to = x; draw(); }),
        days() > 31 ? h("div", { class: "err" }, "Choose at most 31 days at a time.") : null,
        h("div", { class: "b" }, `Students (${f.picked.size} picked)`), pickStudents(f, "picked", { redraw: draw }));
    };
    draw();
    const save = h("button", { onclick: async () => {
      if (!f.picked.size || days() < 1 || days() > 31) return;
      save.disabled = true;
      try {
        const b = writeBatch(db);
        for (let i = 0; i < days(); i++) b.set(doc(db, "duty", C.addDays(f.from, i)), { [f.type]: arrayUnion(...f.picked) }, { merge: true });
        await b.commit(); close();
      } catch (e) { err.textContent = friendly(e); save.disabled = false; }
    } }, "Save");
    return [h("h3", {}, "Add duty"), body, err, h("div", { class: "row" }, h("button", { class: "o", onclick: close }, "Cancel"), h("div", { class: "grow" }), save)];
  });
}

// ---------- Leave ----------
function leaveScreen(back) {
  const v = view, today = C.todayStr(), sat0 = C.lastSaturdayFor(today), B = byId();
  if (!v.reason) { v.reason = C.LEAVE_LAST_SATURDAY; v.from = C.addDays(sat0, -2); v.to = sat0; v.picked = new Set(); v.cid = null; v.q = ""; }
  const setReason = (r) => { v.reason = r; if (r === C.LEAVE_LAST_SATURDAY) { v.from = C.addDays(sat0, -2); v.to = sat0; } else { v.from = today; v.to = today; } render(); };
  const valid = v.picked.size && v.to >= v.from;
  const current = S.leaves.filter((l) => l.to >= today).sort((a, b) => a.from.localeCompare(b.from) || ((B[a.studentId] || {}).name || "").toLowerCase().localeCompare(((B[b.studentId] || {}).name || "").toLowerCase()));
  const canDelete = (l) => isHM() || l.byUid === S.me.uid;
  return h("div", {}, appBar("Jamia off-campus leave", S.me.name, { back }), h("div", { class: "pad" },
    h("div", { class: "b" }, "Reason"), chips([[C.LEAVE_LAST_SATURDAY, "Last Saturday Leave"], [C.LEAVE_PERSONAL, "Personal leave"], [C.LEAVE_SICK, "Sick leave"], [C.LEAVE_DUTY, "Duty leave"], [C.LEAVE_SUMMER, "Summer Holidays"]], v.reason, setReason),
    h("div", { class: "b" }, "From"), dateRow(v.from, (d) => { v.from = d; if (v.to < d) v.to = d; render(); }), h("div", { class: "b" }, "To"), dateRow(v.to, (d) => { v.to = d; render(); }),
    v.to < v.from ? h("div", { class: "err" }, "The last day must not be before the first day.") : null,
    h("div", { class: "b" }, `Students (${v.picked.size} picked)`), pickStudents(v, "picked"),
    v.msg ? h("div", { class: "b" }, v.msg) : null,
    h("button", { disabled: !valid, onclick: async () => {
      try {
        const b = writeBatch(db);
        for (const id of v.picked) { const st = B[id]; b.set(doc(collection(db, "leaves")), { studentId: id, classId: st ? st.classId : "", reason: v.reason, from: v.from, to: v.to, by: S.me.name, byUid: S.me.uid, createdAt: serverTimestamp() }); }
        await b.commit(); v.msg = `Saved for ${v.picked.size} student(s).`; v.picked = new Set();
      } catch (e) { v.msg = friendly(e); }
      render();
    } }, "Save leave"),
    h("h3", {}, `Away now or coming up (${current.length})`), current.length ? null : h("div", { class: "muted" }, "Nobody."),
    current.map((l) => { const st = B[l.studentId]; return h("div", { class: "card" }, h("div", { class: "row" }, h("div", { class: "grow" }, h("div", { class: "b" }, st ? st.name : "?"),
      h("div", { class: "muted" }, `${C.leaveReasonLabel(l.reason)}  |  ${C.pretty(l.from)} to ${C.pretty(l.to)}  (${C.leaveDays(l)} days)  |  ${clsName(l.classId)}`)),
      canDelete(l) ? h("button", { class: "t", onclick: () => confirmBox("Remove this leave?", "The student will count normally again for these days.", "Remove", () => deleteDoc(doc(db, "leaves", l.id)), true) }, "Remove") : null)); })));
}

// ---------- Sick leave (Jamia Clinic) ----------
const COMMON_AILMENTS = ["Headache", "Flu", "Fever", "Fatigue", "Injury", "Malaria", "Running stomach", "Ulcer"];
function clinicScreen(back) {
  const v = view, B = byId();
  if (!v.init) { v.init = true; v.date = C.todayStr(); v.picked = new Set(); v.cid = null; v.q = ""; v.ail = new Set(); v.other = ""; v.place = null; }
  const valid = v.picked.size === 1 && (v.ail.size || v.other.trim()) && v.place;
  const today = S.clinic.filter((x) => x.date === v.date).sort((a, b) => ((B[a.studentId] || {}).name || "").toLowerCase().localeCompare(((B[b.studentId] || {}).name || "").toLowerCase()));
  return h("div", {}, appBar("Sick Leave", S.me.name, { back }), h("div", { class: "pad" },
    h("div", { class: "b" }, "Date"), dateRow(v.date, (d) => { v.date = d; render(); }),
    h("div", { class: "b" }, "Student"), pickStudents(v, "picked", { single: true }),
    h("div", { class: "b" }, "What is wrong?"), COMMON_AILMENTS.map((a) => check(a, v.ail.has(a), (on) => { on ? v.ail.add(a) : v.ail.delete(a); })),
    input("ot", { type: "text", placeholder: "Other (optional)", value: v.other, oninput: (e) => { v.other = e.target.value; } }),
    h("div", { class: "b" }, "Where did he go?"), chips([["hospital", "Hospital"], ["hostel", "Rest in the hostel"]], v.place, (p) => { v.place = p; render(); }),
    v.msg ? h("div", { class: "b" }, v.msg) : null,
    h("button", { disabled: !valid, onclick: async () => {
      const id = [...v.picked][0], st = B[id], ail = [...v.ail]; if (v.other.trim()) ail.push(v.other.trim());
      try {
        await setDoc(doc(collection(db, "clinic")), { studentId: id, classId: st.classId, date: v.date, ailments: ail, place: v.place, by: S.me.name, byUid: S.me.uid, createdAt: serverTimestamp() });
        v.msg = "Saved for " + st.name + "."; v.picked = new Set(); v.ail = new Set(); v.other = ""; v.place = null;
      } catch (e) { v.msg = friendly(e); }
      render();
    } }, "Save"),
    h("h3", {}, `Sick on ${C.pretty(v.date)} (${today.length})`), today.length ? null : h("div", { class: "muted" }, "Nobody."),
    today.map((x) => { const st = B[x.studentId]; return h("div", { class: "card" }, h("div", { class: "row" }, h("div", { class: "grow" }, h("div", { class: "b" }, st ? st.name : "?"),
      h("div", { class: "muted" }, `${x.ailments.join(", ")}  |  ${x.place === "hospital" ? "Hospital" : "Hostel rest"}  |  ${clsName(x.classId)}`)),
      isHM() || x.byUid === S.me.uid ? h("button", { class: "t", onclick: () => confirmBox("Remove this record?", "", "Remove", () => deleteDoc(doc(db, "clinic", x.id)), true) }, "Remove") : null)); })));
}

// ---------- Sports duty & special permissions ----------
function sportsScreen(back) {
  const v = view, B = byId(), today = C.todayStr();
  v.tab ||= "duty";
  const list = S.sportsEx.filter((e) => e.kind === v.tab).sort((a, b) => (a.to < today) - (b.to < today) || ((B[a.studentId] || {}).name || "").toLowerCase().localeCompare(((B[b.studentId] || {}).name || "").toLowerCase()));
  return h("div", {}, appBar("Sports", "Duty and special permissions", { back }), h("div", { class: "pad" },
    chips([["duty", "Duty"], ["perm", "Permissions"]], v.tab, (t) => { v.tab = t; render(); }),
    h("button", { onclick: () => addSportsDialog(v.tab) }, v.tab === "duty" ? "Add duty" : "Add permission"),
    list.length ? null : h("div", { class: "muted" }, "Nobody yet."),
    list.map((e) => { const st = B[e.studentId]; return h("div", { class: "card", style: e.to < today ? { opacity: 0.55 } : {} }, h("div", { class: "row" }, h("div", { class: "grow" },
      h("div", { class: "b" }, st ? st.name : "?"), h("div", { class: "muted" }, `${C.pretty(e.from)} to ${C.pretty(e.to)}` + (e.note ? `  |  ${e.note}` : "") + (st ? `  |  ${clsName(st.classId)}` : ""))),
      h("button", { class: "t", onclick: () => confirmBox("Remove this entry?", "", "Remove", () => deleteDoc(doc(db, "sports_exempt", e.id)), true) }, "Remove"))); })));
}
function addSportsDialog(kind) {
  modal((close) => {
    const f = { from: C.todayStr(), to: C.todayStr(), note: "", picked: new Set(), cid: null, q: "" };
    const body = h("div", { class: "pad", style: { padding: 0 } }), err = h("div", { class: "err" });
    const draw = () => body.replaceChildren(h("div", { class: "b" }, "From"), dateRow(f.from, (x) => { f.from = x; if (f.to < x) f.to = x; draw(); }), h("div", { class: "b" }, "To"), dateRow(f.to, (x) => { f.to = x; draw(); }),
      h("input", { type: "text", placeholder: "Note (optional)", value: f.note, oninput: (e) => (f.note = e.target.value) }),
      h("div", { class: "b" }, `Students (${f.picked.size} picked)`), pickStudents(f, "picked", { redraw: draw }));
    draw();
    const save = h("button", { onclick: async () => {
      if (!f.picked.size || f.to < f.from) return; save.disabled = true;
      try { const b = writeBatch(db); for (const sid of f.picked) b.set(doc(collection(db, "sports_exempt")), { studentId: sid, kind, from: f.from, to: f.to, note: f.note.trim(), by: S.me.name }); await b.commit(); close(); }
      catch (e) { err.textContent = friendly(e); save.disabled = false; }
    } }, "Save");
    return [h("h3", {}, kind === "duty" ? "Add duty" : "Add permission"), body, err, h("div", { class: "row" }, h("button", { class: "o", onclick: close }, "Cancel"), h("div", { class: "grow" }), save)];
  });
}

// ---------- start ----------
(async () => {
  phase = "loading"; render();
  await new Promise((res) => { const un = auth.onAuthStateChanged ? auth.onAuthStateChanged((u) => { un(); res(u); }) : res(null); }).then(async (u) => {
    if (!u) { phase = "login"; render(); return; }
    try { await enter(u.uid); } catch (e) { loginMsg = friendly(e); phase = "login"; }
    render();
  });
})();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

// ---------- Majlis-e-Ilmi competitions ----------
function compsScreen(back) {
  const v = view, B = byId();
  if (!v.init) { v.init = true; v.date = C.todayStr(); v.compId = ""; v.p = { 1: [], 2: [], 3: [] }; v.editing = null; }
  const comps = S.competitions.filter((c) => c.active);
  const names = (ids) => ids.map((i) => (B[i] || {}).name).filter(Boolean).join(", ");
  const todays = S.compResults.filter((r) => r.date === v.date).sort((a, b) => a.name.localeCompare(b.name));
  if (!S.competitions.length && (isHM() || S.me.canCompetitions) && !v.seeded) {
    v.seeded = true;
    const b = writeBatch(db); C.DEFAULT_COMPETITIONS.forEach((n, i) => b.set(doc(db, "competitions", "c" + (i + 1)), { name: n, active: true, order: i + 1 })); b.commit();
  }
  const clear = () => { v.compId = ""; v.p = { 1: [], 2: [], 3: [] }; v.editing = null; };
  const comp = comps.find((c) => c.id === v.compId);
  const taken = [...v.p[1], ...v.p[2], ...v.p[3]];
  const place = (n) => h("div", { class: "card" }, h("div", { class: "b" }, C.placeLabel(n) + " position"),
    v.p[n].length ? null : h("div", { class: "muted" }, "Nobody added yet."),
    v.p[n].map((id) => h("div", { class: "row" }, h("div", { class: "grow" }, h("div", { class: "b" }, (B[id] || {}).name || id), h("div", { class: "muted" }, clsName((B[id] || {}).classId))),
      h("button", { class: "t", onclick: () => { v.p[n] = v.p[n].filter((x) => x !== id); render(); } }, "Remove"))),
    h("button", { class: "o", onclick: () => pickCompStudent(n) }, "Add student"));
  const pickCompStudent = (n) => modal((close) => {
    const f = { cid: null, q: "" }, info = h("div", { class: "b" });
    // tapping a student adds him straight away
    const add = (id) => { for (const k of [1, 2, 3]) v.p[k] = v.p[k].filter((x) => x !== id); v.p[n].push(id); info.textContent = "Added: " + (B[id] || {}).name; render(); };
    const wrap = h("div", {});
    const redraw = () => {
      wrap.replaceChildren(info);
      const ae = document.activeElement, k = ae && ae.dataset && ae.dataset.k, pos = ae && ae.selectionStart;
      const cid = f.cid || (S.classes[0] || {}).id, q = (f.q || "").trim().toLowerCase();
      const list = (q ? S.students.filter((s) => s.name.toLowerCase().includes(q)) : S.students.filter((s) => s.classId === cid)).filter((s) => s.active).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())).slice(0, 60);
      wrap.append(h("div", { class: "pad", style: { padding: 0 } }, input("cq", { placeholder: "Search by name", value: f.q, oninput: (e) => { f.q = e.target.value; redraw(); } }),
        q ? null : chips(S.classes.map((c) => [c.id, c.name]), cid, (id) => { f.cid = id; redraw(); }),
        list.map((s) => h("div", { class: "stu", onclick: () => add(s.id) }, h("div", { class: "grow" }, h("div", { class: "b" }, s.name), q ? h("div", { class: "muted" }, clsName(s.classId)) : null), h("span", { class: "pill", style: { background: "#EDE8DB" } }, "Add")))));
      if (k) { const el = document.querySelector(`#overlay [data-k="${k}"]`); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch {} } }
    };
    redraw();
    return [h("h3", {}, "Add student - " + C.placeLabel(n)), wrap, h("div", { class: "row" }, h("div", { class: "grow" }), h("button", { onclick: close }, "Done"))];
  });
  return h("div", {}, appBar("Majlis-e-Ilmi results", S.me.name, { back }), h("div", { class: "pad" },
    h("div", { class: "b" }, "Date"), dateRow(v.date, (d) => { v.date = d; render(); }),
    h("div", { class: "row" }, h("div", { class: "b grow" }, "Competition"), h("button", { class: "t", onclick: manageComps }, "Add / remove competitions")),
    h("select", { onchange: (e) => { v.compId = e.target.value; } }, h("option", { value: "" }, "Choose a competition"), comps.map((c) => h("option", { value: c.id, selected: c.id === v.compId }, c.name))),
    place(1), place(2), place(3),
    v.msg ? h("div", { class: "b" }, v.msg) : null,
    h("button", { disabled: !(comp && taken.length), onclick: async () => {
      const id = v.editing || doc(collection(db, "competition_results")).id;
      try {
        await setDoc(doc(db, "competition_results", id), { date: v.date, competitionId: comp.id, name: comp.name, p1: v.p[1], p2: v.p[2], p3: v.p[3], by: S.me.name, byUid: S.me.uid, at: serverTimestamp() });
        v.msg = "Saved: " + comp.name; clear();
      } catch (e) { v.msg = friendly(e); }
      render();
    } }, v.editing ? "Save changes" : "Save results"),
    v.editing ? h("button", { class: "o", onclick: () => { clear(); render(); } }, "Cancel editing") : null,
    h("h3", {}, `Results entered for ${C.pretty(v.date)} (${todays.length})`), todays.length ? null : h("div", { class: "muted" }, "None yet."),
    todays.map((r) => h("div", { class: "card" }, h("div", { class: "row" }, h("div", { class: "grow" }, h("div", { class: "b" }, r.name),
      [[1, r.p1], [2, r.p2], [3, r.p3]].filter((x) => x[1].length).map(([n, ids]) => h("div", { class: "muted" }, C.placeLabel(n) + ": " + names(ids)))),
      isHM() || r.byUid === S.me.uid ? h("div", { class: "row" },
        h("button", { class: "t", onclick: () => { v.editing = r.id; v.compId = r.competitionId; v.p = { 1: [...r.p1], 2: [...r.p2], 3: [...r.p3] }; v.msg = ""; render(); } }, "Edit"),
        h("button", { class: "t", onclick: () => confirmBox("Remove these results?", r.name, "Remove", () => deleteDoc(doc(db, "competition_results", r.id)), true) }, "Remove")) : null))),
  ));
}
function manageComps() {
  modal((close) => {
    const name = h("input", { type: "text", placeholder: "New competition name" });
    const list = h("div", {});
    const draw = () => {
      const on = S.competitions.filter((c) => c.active), off = S.competitions.filter((c) => !c.active);
      list.replaceChildren(on.map((c) => h("div", { class: "row" }, h("div", { class: "grow" }, c.name), h("button", { class: "t", onclick: async () => { await updateDoc(doc(db, "competitions", c.id), { active: false }); setTimeout(draw, 300); } }, "Remove"))),
        off.length ? [h("div", { class: "b" }, "Removed (tap to bring back)"), off.map((c) => h("div", { class: "row" }, h("div", { class: "grow muted" }, c.name), h("button", { class: "t", onclick: async () => { await updateDoc(doc(db, "competitions", c.id), { active: true }); setTimeout(draw, 300); } }, "Restore")))] : null);
    };
    draw();
    return [h("h3", {}, "Competitions"), name, h("button", { onclick: async () => {
      if (!name.value.trim()) return;
      await setDoc(doc(collection(db, "competitions")), { name: name.value.trim(), active: true, order: Math.max(0, ...S.competitions.map((c) => c.order)) + 1 }); name.value = ""; setTimeout(draw, 300);
    } }, "Add"), h("div", { class: "muted" }, "Removing hides a competition from the list. Old results are kept."), list, h("div", { class: "row" }, h("div", { class: "grow" }), h("button", { onclick: close }, "Done"))];
  });
}
