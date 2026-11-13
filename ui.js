// Tiny UI helpers.
export function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(e.style, v);
    else if (k.startsWith("on")) e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "value") e.value = v;
    else if (k === "checked") e.checked = !!v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return e;
}
export const $ = (s) => document.querySelector(s);

export function toast(msg) {
  const t = h("div", { class: "toast" }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}

let overlayCount = 0;
export function modalOpen() { return overlayCount > 0; }
/** body(close) -> element. Returns close(). */
export function modal(body) {
  const host = $("#overlay");
  const box = h("div", { class: "overlay", onclick: (e) => { if (e.target === box) close(); } });
  const close = () => { box.remove(); overlayCount--; };
  box.append(h("div", { class: "modal" }, body(close)));
  host.append(box); overlayCount++;
  return close;
}
export function confirmBox(title, text, okLabel, onOk, danger = false) {
  modal((close) => [h("h3", {}, title), h("div", {}, text),
    h("div", { class: "row" }, h("button", { class: "o", onclick: close }, "Cancel"), h("div", { class: "grow" }),
      h("button", { class: danger ? "danger" : "", onclick: () => { close(); onOk(); } }, okLabel))]);
}

export function chips(items, selected, onPick) {
  return h("div", { class: "hscroll" }, items.map(([id, label]) =>
    h("button", { class: "chip" + (id === selected ? " on" : ""), onclick: () => onPick(id) }, label)));
}
export function check(label, on, onChange, disabled = false) {
  return h("label", { class: "chk" }, h("input", { type: "checkbox", checked: on, disabled, onchange: (e) => onChange(e.target.checked) }), h("span", {}, label));
}
export function dateRow(value, onChange) {
  return h("div", { class: "row" },
    h("button", { class: "o", onclick: () => onChange(shift(value, -1)) }, "<"),
    h("input", { type: "date", value, onchange: (e) => e.target.value && onChange(e.target.value) }),
    h("button", { class: "o", onclick: () => onChange(shift(value, 1)) }, ">"));
}
function shift(s, n) { const [y, m, d] = s.split("-").map(Number); const x = new Date(y, m - 1, d + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; }

export function appBar(title, sub, { back, actions = [] } = {}) {
  return h("div", { class: "bar" },
    back ? h("button", { class: "t", onclick: back }, "< Back") : null,
    h("div", { class: "grow" }, h("h1", {}, title), sub ? h("small", {}, sub) : null),
    actions.map(([label, fn]) => h("button", { class: "t", onclick: fn }, label)));
}

export const pillColors = { D: "#D9E4F5", S: "#E6DCF3", V: "#FBE3CC", A: "#F8D4D4", L: "#FFEFC2", N: "#FFE0B8" };
export function pill(code, label) {
  return h("span", { class: "pill", style: { background: pillColors[code] || "#D5DCC4" } }, label);
}

const ICONS = {
  today: "M12 3 2 12h3v8h5v-5h4v5h5v-8h3z",
  students: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5z",
  people: "M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13zm8 0c-.3 0-.6 0-1 .1 1.2.9 2 2 2 3.4V19h6v-2.5c0-2.3-4.700-3.500-7-3.500z",
  reports: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2 11v4h2v-4zm4-6v10h2V8zm4 3v7h2v-7z",
  more: "M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z",
};
export function navBar(tabs, current, onPick) {
  return h("div", { class: "nav" }, h("div", {}, tabs.map(([id, label]) =>
    h("button", { class: id === current ? "on" : "", onclick: () => onPick(id) },
      h("span", { html: `<svg viewBox="0 0 24 24"><path d="${ICONS[id]}"/></svg>` }), label))));
}
