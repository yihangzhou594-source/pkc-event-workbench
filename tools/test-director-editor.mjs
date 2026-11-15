import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../director/console.html',import.meta.url),'utf8');
const hotkeyCode = html.slice(html.indexOf('document.addEventListener("keydown"'), html.indexOf('  if (e.key === "b"'));
let handleKey;
let hotkeyPushes = 0;
const body = { closest() { return null; } };
const hotkeys = {
  document: { body, addEventListener(type, handler) { handleKey = handler; } },
  window: { __wkView: "director" },
  pushCurrent() { hotkeyPushes++; },
  hotkeyBlocked() { return false; },
};
vm.createContext(hotkeys);
vm.runInContext(hotkeyCode + "});", hotkeys);
let prevented = 0;
const key = { target: body, preventDefault() { prevented++; } };
await handleKey({ ...key, code: "Space" });
assert.equal(prevented, 0);
await handleKey({ ...key, shiftKey: true, code: "KeyP", repeat: true });
assert.equal(hotkeyPushes, 0);
await handleKey({ ...key, shiftKey: true, code: "KeyP" });
assert.equal(prevented, 1);
assert.equal(hotkeyPushes, 1);
const button={disabled:false,setAttribute(){},textContent:''}, status={textContent:''};
let resolvePush, calls=0;
const pending=new Promise(resolve=>resolvePush=resolve);
const context={$(id){return id==='btnPush'?button:status},postPush(){calls++;return pending},paint(){},syncFrame(){},window:{},state:{preview:{}}};
vm.createContext(context);
const pushCode=html.slice(html.indexOf('let pushBusy = false;'),html.indexOf('function paintScenes()'));
vm.runInContext(pushCode,context);
const first=context.pushCurrent();assert.equal(button.disabled,true);
assert.equal(await context.pushCurrent(),false);assert.equal(calls,1);
resolvePush({preview:{}});assert.equal(await first,true);assert.equal(button.disabled,false);
context.postPush=async()=>{throw new Error('offline')};
assert.equal(await context.pushCurrent(),false);assert.match(status.textContent,/offline/);assert.equal(button.disabled,false);
const scenes = ['blank', 'bracket', 'spotlight'].map(id => ({ id }));
let preview = { scene: 'blank' };
const onAir = { scene: 'blank' };
const saved = new Map();
const fields = new Map();
const timer = { minutes: '12', seconds: '15' };
const editor = {
  state: null,
  $(id) {
    if (!fields.has(id)) fields.set(id, { dataset: {} });
    return fields.get(id);
  },
  localStorage: {
    getItem: key => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value),
  },
  async fetch(url, options) {
    if (url.endsWith('/scene')) preview = { scene: JSON.parse(options.body).id };
    return { ok: true, json: async () => ({ preview, onAir, scenes, directorDraft: { timer } }) };
  },
  window: {},
  paint() {},
  syncFrame() {},
  applyContextToInterval: async () => {},
  connectDirector() {},
};
vm.createContext(editor);
vm.runInContext(html.slice(html.indexOf('let framedMode = null;'), html.indexOf('async function postPush(')), editor);
await editor.post('scene', { id: 'bracket' });
await editor.post('scene', { id: 'spotlight' }, { rememberScene: false });
preview = { scene: 'blank' };
const startup = html.slice(html.indexOf('fetch("/api/director/state"'), html.lastIndexOf('loadTeams();'));
await vm.runInContext(startup, editor);
assert.equal(editor.state.preview.scene, 'bracket', 'refresh restores the last manual scene');
assert.equal(editor.state.onAir.scene, 'blank', 'refresh only changes preview');
assert.equal(editor.$('mm').value, '12', 'refresh restores typed countdown minutes');
assert.equal(editor.$('ss').value, '15', 'refresh restores typed countdown seconds');
console.log('test-director-editor: push shortcut, duplicate push, recovery and scene restore passed');
