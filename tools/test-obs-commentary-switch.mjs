import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../director/obs.html", import.meta.url), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function element() {
  const children = [];
  return {
    children,
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    append: (...nodes) => children.push(...nodes),
    replaceChildren: (...nodes) => children.splice(0, children.length, ...nodes),
    querySelector: (selector) => children.find((node) => "." + node.className === selector) || null,
  };
}

const stage = element();
const events = new EventTarget();
vm.runInNewContext(script, {
  document: {
    getElementById: (id) => id === "stage" ? stage : element(),
    documentElement: element(),
    createElement: element,
  },
  window: { addEventListener() {} },
  location: { pathname: "/obs/commentary", search: "?transparent=1" },
  URLSearchParams,
  fetch: async () => ({ json: async () => ({}) }),
  EventSource: class { constructor() { return events; } },
});

function show(scene) {
  events.dispatchEvent(new MessageEvent("onAir", {
    data: JSON.stringify({ onAir: { scene, settings: {} }, live: {}, scenes: [] }),
  }));
  return stage.querySelector(".st");
}

const initial = show("commentary");
assert.ok(initial, "initial commentary");
assert.equal(show("commentary"), initial, "unchanged commentary keeps its DOM");
assert.equal(show("blank"), null, "blank replaces commentary");
assert.ok(show("commentary"), "commentary returns directly from blank");
