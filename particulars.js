// Student particulars: the form definition (used by the entry form, the viewer and the PDF) and the PDF itself.
// t = text | area | date | yn | choice.  when(d) hides a field that does not apply (e.g. date of Bai'at for an Ahmadi by birth).
const yes = (k) => (d) => d[k] === "yes", no = (k) => (d) => d[k] === "no";
export const SECTIONS = [
  { id: "personal", title: "1. Personal Information", fields: [
    { k: "regNo", l: "Jamia Registration Number", t: "text" },
    { k: "fullName", l: "Full name", t: "text" },
    { k: "dob", l: "Date of birth", t: "date" },
    { k: "pobCity", l: "Place of birth: town / city", t: "text" },
    { k: "pobRegion", l: "Place of birth: region / state", t: "text" },
    { k: "pobCountry", l: "Place of birth: country", t: "text" },
    { k: "nationality", l: "Nationality", t: "text" },
    { k: "resAddress", l: "Current residential address", t: "area" },
    { k: "permAddress", l: "Permanent address", t: "area" },
    { k: "phone", l: "Mobile / telephone number (with country code)", t: "text", mode: "tel" },
    { k: "email", l: "Email address", t: "text", mode: "email" }] },
  { id: "jamaat", title: "2. Jama'at Details", fields: [
    { k: "ahmadiByBirth", l: "Are you Ahmadi by birth?", t: "yn" },
    { k: "baiatDate", l: "Date of Bai'at / initiation", t: "date", when: no("ahmadiByBirth") },
    { k: "prevReligion", l: "Previous religion or denomination", t: "text", when: no("ahmadiByBirth") },
    { k: "localJamaat", l: "Name of local Jama'at", t: "text" },
    { k: "jamaatRegion", l: "Region and country of Jama'at", t: "text" },
    { k: "jamaatNo", l: "Jama'at membership number (if applicable)", t: "text" },
    { k: "waqfeNau", l: "Are you a member of the Waqf-e-Nau scheme?", t: "yn" },
    { k: "waqfeNauRef", l: "Waqf-e-Nau reference number", t: "text", when: yes("waqfeNau") },
    { k: "heldOffice", l: "Have you held any office or responsibility in the Jama'at?", t: "yn" },
    { k: "officeDetails", l: "Office, Jama'at, responsibilities and dates of service", t: "area", when: yes("heldOffice") },
    { k: "volunteer", l: "Jama'at volunteer work or service projects you have taken part in", t: "area" },
    { k: "relatives", l: "Relatives known for their service to the Jama'at, with their relationship to you (optional)", t: "area" }] },
  { id: "parents", title: "3. Parents and Guardian", fields: [
    { k: "fatherName", l: "Father's full name", t: "text" },
    { k: "fatherOcc", l: "Father's occupation", t: "text" },
    { k: "fatherContact", l: "Father's address and contact number", t: "area" },
    { k: "motherName", l: "Mother's full name", t: "text" },
    { k: "motherOcc", l: "Mother's occupation", t: "text" },
    { k: "motherContact", l: "Mother's address and contact number (if different)", t: "area" },
    { k: "guardianName", l: "Guardian's full name (if applicable)", t: "text" },
    { k: "guardianRel", l: "Relationship of guardian to student", t: "text" },
    { k: "guardianOcc", l: "Guardian's occupation", t: "text" },
    { k: "guardianContact", l: "Guardian's address, telephone number and email", t: "area" },
    { k: "preferredContact", l: "Preferred parent or guardian contact", t: "choice", opts: ["Father", "Mother", "Guardian"] }] },
  { id: "emergency", title: "4. Emergency Contact", fields: [
    { k: "emName", l: "Full name", t: "text" },
    { k: "emRel", l: "Relationship to student", t: "text" },
    { k: "emPhone1", l: "Primary telephone number", t: "text", mode: "tel" },
    { k: "emPhone2", l: "Alternative telephone number", t: "text", mode: "tel" },
    { k: "emAddress", l: "Address", t: "area" },
    { k: "emExtra", l: "Additional emergency contact (if available)", t: "area" }] },
  { id: "education", title: "5. Education and Qualifications", fields: [
    { k: "highestQual", l: "Highest educational qualification", t: "text" },
    { k: "training", l: "Other training, certificates or vocational qualifications", t: "area" }] },
  { id: "languages", title: "6. Languages and Religious Learning", fields: [
    { k: "motherTongue", l: "Mother tongue", t: "text" },
    { k: "otherLanguages", l: "Other languages, with speaking, reading and writing proficiency", t: "area" },
    { k: "quranReading", l: "Ability to read the Holy Qur'an", t: "choice", opts: ["Fluent", "With some difficulty", "Learning", "Cannot yet read"] },
    { k: "religiousEd", l: "Previous religious education or courses completed", t: "area" },
    { k: "arabicUrdu", l: "Familiarity with Arabic, Urdu or other languages relevant to the programme", t: "area" }] },
  { id: "family", title: "7. Marital and Family Information", fields: [
    { k: "marital", l: "Marital status", t: "choice", opts: ["Single", "Married", "Divorced", "Widowed"] },
    { k: "marriageDate", l: "Date of marriage", t: "date", when: (d) => d.marital === "Married" },
    { k: "spouseName", l: "Spouse's full name", t: "text", when: (d) => d.marital === "Married" },
    { k: "children", l: "Number of children and their ages", t: "text" },
    { k: "dependants", l: "Number of other dependants (if relevant)", t: "text" },
    { k: "familyResp", l: "Family responsibilities that may affect attendance or residential arrangements", t: "area" }] },
  { id: "health", title: "8. Health and Accessibility", confidential: true, fields: [
    { k: "healthCond", l: "Any health condition the institution should know about to support the student safely", t: "area" },
    { k: "allergies", l: "Allergies or emergency care instructions", t: "area" },
    { k: "medication", l: "Medication assistance or storage requirements (if applicable)", t: "area" },
    { k: "accessibility", l: "Accessibility requirements or learning accommodations", t: "area" },
    { k: "dietary", l: "Dietary requirements", t: "area" },
    { k: "otherSupport", l: "Any other support needs the student wishes to disclose", t: "area" }] },
  { id: "interests", title: "9. Interests, Skills and Experience", fields: [
    { k: "hobbies", l: "Hobbies and interests", t: "area" },
    { k: "sports", l: "Sports and extracurricular activities", t: "area" },
    { k: "computer", l: "Computer and digital skills", t: "area" },
    { k: "speaking", l: "Public speaking, writing, translation or teaching experience", t: "area" },
    { k: "leadership", l: "Leadership and volunteering experience", t: "area" },
    { k: "employment", l: "Employment or practical work experience", t: "area" },
    { k: "talents", l: "Other talents or achievements", t: "area" }] },
];

export const shown = (f, d) => !f.when || f.when(d);
/** Text shown for a value (dates as 12 Mar 2004, yes/no capitalised). "" when empty. */
export function show(f, v) {
  if (v == null || v === "") return "";
  if (f.t === "yn") return v === "yes" ? "Yes" : "No";
  if (f.t === "date") { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v); if (m) return `${+m[3]} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m[2] - 1]} ${m[1]}`; }
  return String(v).trim();
}
/** How many applicable fields are filled in: for the "x of y" hint. */
export function progress(d) {
  let n = 0, t = 0;
  for (const s of SECTIONS) for (const f of s.fields) if (shown(f, d)) { t++; if (show(f, d[f.k])) n++; }
  return [n, t];
}

// ---------- PDF ----------
const GREEN = [30, 59, 47], CREAM = [245, 240, 230], SAND = [200, 180, 138], LIGHT = [230, 220, 197], GREY = [102, 102, 102];
const W = 595.28, H = 841.89, X = 30, LW = 175, VX = X + LW + 8, VW = W - X - VX - 30 + 30;
const ascii = (s) => String(s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-");

/** opts: { includeHealth } ; meta: { className, updatedAt (Date|null), by } */
export function particularsPdf(student, d, meta = {}, opts = {}) {
  const includeHealth = opts.includeHealth !== false;
  const doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4" });
  try { doc.viewerPreferences({ PrintScaling: "None", FitWindow: true }); } catch (e) { /* ignore */ }
  const T = (s, x, y, o = {}) => { doc.setFont("helvetica", o.bold ? "bold" : o.italic ? "italic" : "normal"); doc.setFontSize(o.size || 9); doc.setTextColor(...(o.color || [0, 0, 0])); doc.text(ascii(s), x, y, { align: o.align || "left" }); };
  const R = (x, y, w, h, c) => { doc.setFillColor(...c); doc.rect(x, y, w, h, "F"); };
  const lines = (s, size, w) => { doc.setFont("helvetica", "normal"); doc.setFontSize(size); return doc.splitTextToSize(ascii(s), w); };
  let y = 0;
  const page = (first) => {
    R(0, 0, W, H, [255, 255, 255]);
    if (first) {
      R(0, 0, W, 92, GREEN);
      T("In the name of Allah, the Gracious, the Merciful", W / 2, 16, { size: 9.5, italic: true, color: CREAM, align: "center" });
      T("JAMIA AHMADIYYA INTERNATIONAL GHANA", X, 38, { size: 13, bold: true, color: CREAM });
      T("STUDENT PARTICULARS", X, 53, { size: 9, bold: true, color: SAND });
      T((d.fullName || student.name).slice(0, 44), X, 78, { size: 19, bold: true, color: CREAM });
      T(`${meta.className || ""}${d.regNo ? "   |   Reg. No. " + d.regNo : ""}`, W - X, 78, { size: 9.5, color: SAND, align: "right" });
      y = 108;
    } else y = 40;
  };
  const room = (h) => { if (y + h > H - 44) { doc.addPage(); page(false); } };
  // Only answered fields are printed (a section with no answers is left out). Sections flow onto as many pages as they need,
  // and the spacing / type size shrinks if more than three pages would be needed.
  const SCALES = [1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6];
  // k = how much of the normal row padding is kept (1 = normal, smaller = tighter)
  const rowsOf = (sec, sc, k) => sec.fields.filter((f) => shown(f, d) && f.k !== "regNo").map((f) => { // the registration number is already in the page header
    const v = show(f, d[f.k]), vl = lines(v, 10 * sc, W - X - VX), ll = lines(f.l, 8.5 * sc, LW), pad = 6 * sc * k;
    return { v, vl, ll, pad, h: Math.max(vl.length * 12.5 * sc, ll.length * 11 * sc) + pad };
  }).filter((r) => r.v);
  const layout = (sc, k, maxY = H - 44) => {
    const ops = []; let pg = 0, y = 108; const hp = 6 * sc * k, hh = hp + 24 * sc;
    for (const sec of SECTIONS) {
      if (sec.confidential && !includeHealth) continue;
      const rows = rowsOf(sec, sc, k); if (!rows.length) continue;
      if (y + hh + rows[0].h > maxY) { pg++; y = 40; }
      ops.push({ pg, sec, y: y + hp }); y += hh;
      for (const r of rows) { if (y + r.h > maxY) { pg++; y = 40; } ops.push({ pg, r, y }); y += r.h; }
    }
    return { ops, pages: pg + 1, endY: y };
  };
  // the signature block needs 60pt at the bottom of the last page: if the content runs into it, keep that room on every page
  const plan = (c, k = 1) => { const a = layout(c, k); return a.endY <= H - 104 ? a : layout(c, k, H - 104); };
  let sc = SCALES.find((c) => plan(c).pages <= 3) || SCALES[SCALES.length - 1], kk = 1;
  // Only a little spills onto page 2 (30% of a page or less)? Squeeze everything onto one page instead, as long as the text stays readable.
  const base = plan(1);
  if (base.pages === 2 && base.endY - 40 <= 0.3 * (H - 104 - 40)) {
    outer: for (const c of [1, 0.975, 0.95, 0.925, 0.9, 0.875, 0.85, 0.825, 0.8, 0.775, 0.75, 0.725, 0.7]) for (const k of [1, 0.5, 0.25]) if (plan(c, k).pages === 1) { sc = c; kk = k; break outer; }
  }
  const { ops, pages } = plan(sc, kk);
  for (let pg = 0; pg < pages; pg++) {
    if (pg) doc.addPage();
    page(pg === 0);
    for (const o of ops.filter((x) => x.pg === pg)) {
      if (o.sec) {
        R(X, o.y, W - 2 * X, 18 * sc, GREEN);
        T(o.sec.title, X + 6, o.y + 12.5 * sc, { size: 10.5 * sc, bold: true, color: CREAM });
      } else {
        const r = o.r, y0 = o.y;
        r.ll.forEach((ln, k) => T(ln, X + 4, y0 + 9 * sc + k * 11 * sc, { size: 8.5 * sc, color: GREY }));
        r.vl.forEach((ln, k) => T(ln, VX, y0 + 10 * sc + k * 12.5 * sc, { size: 10 * sc, bold: true }));
        doc.setDrawColor(...LIGHT); doc.setLineWidth(0.5); doc.line(X, y0 + r.h - r.pad / 3, W - X, y0 + r.h - r.pad / 3);
      }
    }
    if (pg === pages - 1) { // signature block: Registry signature and date
      const ly = H - 72;
      doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.7);
      doc.line(X, ly, X + 150, ly); doc.line(W - X - 210, ly, W - X, ly);
      T("Date", X, ly + 12, { size: 9, color: GREY });
      T("Registry", W - X - 210, ly + 12, { size: 9, bold: true });
    }
  }
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    T(`Page ${i} of ${n}`, W - X, H - 22, { size: 7.5, color: GREY, align: "right" });
  }
  return doc;
}
