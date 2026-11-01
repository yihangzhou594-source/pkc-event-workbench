/**
 * 审查项的静态合同：快捷键、页名、状态反馈、图标和延迟加载。
 * 不启动浏览器。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const consoleHtml = read("director/console.html");
const shellJs = read("assets/shell.js");
const shellCss = read("assets/shell.css");
const heroJs = read("assets/pkc-herostats-manual.js");
const heroHtml = read("director/herostats.html");
const remoteHtml = read("director/remote.html");
const appJs = read("assets/pkc-app.js");
const manual = read("使用说明.md");

function fail(message) {
  console.error(message);
  process.exit(1);
}

const hotkeyStart = consoleHtml.indexOf("function hotkeyBlocked");
const hotkeyEnd = consoleHtml.indexOf("document.addEventListener(\"keydown\"", hotkeyStart);
const hotkeyFn = hotkeyStart >= 0 ? consoleHtml.slice(hotkeyStart, hotkeyEnd) : "";
if (!hotkeyFn.includes("BUTTON") || !hotkeyFn.includes("SUMMARY")) {
  fail("空格和字母快捷键在按钮、链接上不应触发");
}
if (!consoleHtml.includes("function opsScrollsOnSpace")) {
  fail("操作栏还能滚动时，空格应滚动操作栏，而不是推送");
}
const spaceArm = consoleHtml.slice(consoleHtml.indexOf("if (e.key === \" \")"), consoleHtml.indexOf("if (e.key === \"b\""));
if (!spaceArm.includes("opsScrollsOnSpace") || !spaceArm.includes("hotkeyBlocked")) {
  fail("空格推送前应先避开控件，并优先滚动操作栏");
}
if (!consoleHtml.includes(">推送到直播端 · 空格<")) {
  fail("推送按钮应标出空格");
}

const blankArm = consoleHtml.slice(consoleHtml.indexOf("if (e.key === \"b\""), consoleHtml.indexOf("if (e.key === \"u\""));
if (!blankArm.includes("confirm(") || blankArm.indexOf("confirm(") > blankArm.indexOf("post(\"scene\"")) {
  fail("B 应先确认，再切到空白并推送");
}
if (!consoleHtml.includes("scene-key") || !consoleHtml.includes("class=\"hotkey-legend\"")) {
  fail("场景按钮应标出 1–6，快捷键说明不能再用会被藏起的 cap");
}
if (shellCss.includes(".hotkey-legend{display:none") || consoleHtml.includes(".hotkey-legend{display:none")) {
  fail("窄窗口不应隐藏快捷键说明");
}

if (consoleHtml.includes("① 对局数据") || consoleHtml.includes("⑤ 淘汰赛赛程图")) {
  fail("导播提示仍在使用旧的编号页名");
}
const directorPane = consoleHtml.slice(consoleHtml.indexOf('id="pane-director"'), consoleHtml.indexOf('id="pane-engine"'));
if (!directorPane.includes("data-go=\"bracket\"") || !directorPane.includes("data-go=\"data\"")) {
  fail("过时页名应改成能跳到当前侧栏页面的按钮");
}
if (!directorPane.includes("打开淘汰赛赛程") || !directorPane.includes("打开对局数据")) {
  fail("导播提示应使用侧栏现用页面名");
}

if (/\balert\(/.test(heroJs)) fail("英雄胜率不应再用 alert");
if (!heroHtml.includes('id="heroNotice"') || !heroHtml.includes('aria-live="polite"')) {
  fail("英雄胜率缺少可重试的页内状态区");
}
if (/\balert\(/.test(consoleHtml.slice(consoleHtml.indexOf("async function cmLookupHeroRate")))) {
  fail("导播台查胜率失败不应再用 alert");
}

const bannerAt = consoleHtml.indexOf("底部横幅");
const bannerDetails = consoleHtml.lastIndexOf("<details", bannerAt);
if (bannerDetails < 0 || bannerAt - bannerDetails > 400) {
  fail("解说底部横幅和成就应默认折叠");
}
const obsAt = consoleHtml.indexOf(">OBS 浏览器源<");
const obsDetails = consoleHtml.lastIndexOf("<details", obsAt);
if (obsDetails < 0 || obsAt - obsDetails > 200) {
  fail("导播台里的 OBS 地址应默认折叠，避免挤走比分");
}

function iconBody(name) {
  const match = shellJs.match(new RegExp(name + ": '<svg[\\s\\S]*?</svg>'"));
  return match ? match[0] : "";
}
if (!iconBody("season") || iconBody("season") === iconBody("data")) fail("赛季仪表盘应有单独图标");
if (!iconBody("spotlight") || iconBody("spotlight") === iconBody("promo")) fail("宣传轮播应有单独图标");
if (!consoleHtml.includes('data-view="season" data-icon="season"')) fail("赛季入口仍共用数据图标");
if (!consoleHtml.includes('data-view="spotlight" data-icon="spotlight"')) fail("宣传轮播入口仍共用宣传图图标");

if (!consoleHtml.includes('id="wkServiceFoot"') || !shellJs.includes("wkServiceFoot")) {
  fail("收起侧栏后服务状态应仍可通过焦点和提示读到");
}
if (shellCss.includes(".wk-rail-foot > span:not(.wk-dot){display:none}")) {
  fail("收起侧栏时不应把服务状态文字从页面里拿掉");
}

for (const id of ["herostatsFrame", "seasonFrame", "promoFrame"]) {
  const tag = consoleHtml.match(new RegExp(`<iframe id="${id}"[^>]*>`));
  if (!tag || !tag[0].includes("data-src=") || /\ssrc=/.test(tag[0])) {
    fail(id + " 应在第一次进入时再加载");
  }
}
if (!shellJs.includes("dataset.src")) fail("外壳应在进入页面时才给内嵌页设置地址");

const btnRule = consoleHtml.slice(consoleHtml.indexOf(".pk .btn{"), consoleHtml.indexOf(".pk .btn:hover"));
if (!btnRule.includes("min-height:36px")) fail("导播按钮应与外壳按钮同高");
const primaryHover = consoleHtml.slice(consoleHtml.indexOf(".pk .btn.primary:hover"), consoleHtml.indexOf(".pk .btn.ghost"));
if (!primaryHover.includes("var(--color-primary-hover)")) fail("导播主按钮悬停应使用同一主色令牌");

if (!remoteHtml.includes('href="/assets/design-tokens.css"')) fail("手机导播应引用工作台颜色令牌");
if (remoteHtml.includes("linear-gradient(180deg,#3474ff")) fail("手机导播主按钮不应再用另一套渐变");
if (remoteHtml.includes("--ink:#172033") || remoteHtml.includes("linear-gradient(180deg,#e14f64")) {
  fail("手机导播仍在样式里写死另一套颜色");
}
if (appJs.includes("先在⑤赛程图") || appJs.includes("先在①里选")) {
  fail("数据页提示仍在使用旧编号");
}
if (appJs.includes("panic") || manual.includes("可直接执行的事故切空键") || manual.includes("立刻推送（出事故时的 panic 键）")) {
  fail("说明仍把 B 写成不经确认的紧急键");
}

console.log("ux audit fixes: ok");
