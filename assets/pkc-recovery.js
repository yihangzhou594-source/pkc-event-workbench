/* ============================================================
   PKC · 数据恢复
   历史版本、完整 JSON 备份 / 导入与关键操作记录。
   ============================================================ */
(function () {
  const TYPES = {
    library: "队伍与系列赛",
    matches: "对局数据",
    bracket: "淘汰赛赛程",
    heroStats: "英雄胜率",
    prefs: "导出偏好",
    heroPick: "英雄配图",
    context: "当前场次",
  };
  const CORE_KEYS = Object.keys(TYPES);
  const CONFLICT_KEYS = new Set(["library", "matches", "bracket", "heroPick", "heroStats"]);
  let dialog = null;
  let activeKey = "matches";
  let versionsCache = new Map();

  const status = (message) => {
    const el = document.getElementById("dataRecoveryStatus");
    if (el) el.textContent = message;
  };

  const fmtTime = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value || "未知时间") : date.toLocaleString("zh-CN", { hour12: false });
  };
  const versionTime = (name) => {
    const match = String(name || "").match(/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})(?:-(\d{3}))?Z\.json$/);
    return match ? `${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5] || "000"}Z` : name;
  };
  const fmtSize = (bytes) => bytes >= 1024 ? (bytes / 1024).toFixed(1) + " KB" : bytes + " B";

  async function fetchJson(url, options) {
    const response = await fetch(url, options);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || result.error || ("HTTP " + response.status));
    return { result, response };
  }

  async function audit(action, detail = "", key = "") {
    try {
      await fetch("/api/store/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, detail, key }),
      });
    } catch { /* local service may be restarting; the data change must still proceed */ }
  }

  async function snapshotBeforeChange(action, keys = ["library", "matches", "bracket"], detail = "") {
    try {
      const response = await fetch("/api/store/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, keys, detail }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(result.snapshots) || !result.snapshots.length) {
        status("操作前快照未写入；本次修改仍会继续，自动备份仍可尝试恢复");
      }
    } catch {
      status("操作前快照未写入；本次修改仍会继续，自动备份仍可尝试恢复");
    }
  }

  async function collectBackup() {
    const data = {};
    for (const key of CORE_KEYS) {
      const { result } = await fetchJson("/api/store/" + key, { cache: "no-store" });
      data[key] = result;
    }
    return {
      format: "pkc-full-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      data,
    };
  }

  function downloadJson(payload) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    if (typeof downloadBlob === "function") {
      downloadBlob(blob, "PKC_完整备份_" + stamp + ".json");
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "PKC_完整备份_" + stamp + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function validateBackup(payload) {
    if (!payload || payload.format !== "pkc-full-backup" || payload.version !== 1) {
      throw new Error("不是受支持的 PKC 完整备份");
    }
    const data = payload.data;
    if (!data || typeof data !== "object") throw new Error("备份缺少 data");
    if (data.library && !Array.isArray(data.library.series)) throw new Error("队伍库结构不正确");
    if (data.matches && (!data.matches.games || typeof data.matches.games !== "object")) throw new Error("对局数据结构不正确");
    if (data.bracket && typeof data.bracket !== "object") throw new Error("赛程结构不正确");
    return CORE_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(data, key));
  }

  async function importBackup(payload) {
    const keys = validateBackup(payload);
    if (!keys.length) throw new Error("备份中没有可导入的数据");
    const counts = dataSummary(payload.data);
    if (!confirm("完整导入会覆盖当前 " + counts + "。\n每个文件都会先保留当前版本。继续吗？")) return false;

    const currentContext = payload.data.context;
    for (const key of keys) {
      if (key === "context") continue;
      const current = await fetchJson("/api/store/" + key, { cache: "no-store" });
      const headers = { "Content-Type": "application/json", "X-PKC-Force-Backup": "1" };
      if (CONFLICT_KEYS.has(key)) headers["X-PKC-Base-Rev"] = current.response.headers.get("X-PKC-Rev") || "";
      await fetchJson("/api/store/" + key, {
        method: "POST",
        headers,
        body: JSON.stringify(payload.data[key]),
      });
    }
    if (Object.prototype.hasOwnProperty.call(payload.data, "context")) {
      const current = await fetchJson("/api/competition/context", { cache: "no-store" });
      await fetchJson("/api/competition/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: currentContext, revision: current.result.revision }),
      });
    }
    await audit("import-json", "完整备份导入：" + keys.join("、"), "all");
    status("完整备份已导入，正在重新加载…");
    setTimeout(() => location.reload(), 700);
    return true;
  }

  function dataSummary(data) {
    const series = data?.library?.series || [];
    const games = series.reduce((sum, item) => sum + ((data?.matches?.games?.[item.id] || []).length), 0);
    return series.length + " 个系列赛、" + games + " 局、"
      + series.reduce((sum, item) => sum + ((item.teams || []).length), 0) + " 支队伍";
  }

  function closeDialog() {
    if (dialog) dialog.remove();
    dialog = null;
  }

  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement("div");
    dialog.className = "pkc-recovery-backdrop";
    dialog.innerHTML = `
      <section class="pkc-recovery-dialog" role="dialog" aria-modal="true" aria-labelledby="pkcRecoveryTitle">
        <div class="pkc-recovery-head">
          <div><h2 id="pkcRecoveryTitle">历史版本与操作记录</h2><p>恢复前会保留当前版本。恢复后可立即在当前页面继续修改。</p></div>
          <button class="pkc-recovery-close" type="button" data-recovery-close aria-label="关闭">×</button>
        </div>
        <div class="pkc-recovery-tabs"></div>
        <div class="pkc-backup-list"></div>
        <div class="pkc-recovery-msg" role="status" aria-live="polite"></div>
        <div class="pkc-audit-list"><h3>最近操作</h3><div class="pkc-audit-items"></div></div>
      </section>`;
    const tabs = dialog.querySelector(".pkc-recovery-tabs");
    for (const [key, label] of Object.entries(TYPES)) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.key = key;
      button.textContent = label;
      button.onclick = () => switchKey(key);
      tabs.append(button);
    }
    dialog.querySelector("[data-recovery-close]").onclick = closeDialog;
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeDialog();
    });
    document.body.append(dialog);
    return dialog;
  }

  async function loadVersions(key, force) {
    if (!force && versionsCache.has(key)) return versionsCache.get(key);
    const { result } = await fetchJson("/api/store/backups?key=" + encodeURIComponent(key), { cache: "no-store" });
    versionsCache.set(key, result.versions || []);
    return result.versions || [];
  }

  async function switchKey(key) {
    activeKey = key;
    if (!dialog) return;
    dialog.querySelectorAll(".pkc-recovery-tabs button").forEach((button) => {
      button.classList.toggle("on", button.dataset.key === key);
    });
    const list = dialog.querySelector(".pkc-backup-list");
    const message = dialog.querySelector(".pkc-recovery-msg");
    list.textContent = "正在读取版本…";
    try {
      const versions = await loadVersions(key, true);
      list.replaceChildren();
      if (!versions.length) {
        const empty = document.createElement("div");
        empty.className = "hint";
        empty.textContent = "这个数据项还没有历史版本。";
        list.append(empty);
        return;
      }
      versions.forEach((version) => {
        const row = document.createElement("div");
        row.className = "pkc-backup-row backup-option";
        const copy = document.createElement("div");
        const title = document.createElement("b");
        title.textContent = fmtTime(versionTime(version.name));
        const file = document.createElement("span");
        file.textContent = version.name;
        copy.append(title, file);
        const size = document.createElement("span");
        size.className = "size";
        size.textContent = fmtSize(version.size || 0);
        const restore = document.createElement("button");
        restore.type = "button";
        restore.textContent = "恢复此版";
        restore.onclick = () => restoreVersion(key, version, restore);
        row.append(copy, size, restore);
        list.append(row);
      });
    } catch (error) {
      list.textContent = "读取失败：" + error.message;
    }
    message.textContent = "";
  }

  async function restoreVersion(key, version, button) {
    if (!confirm("恢复「" + TYPES[key] + "」到 " + fmtTime(versionTime(version.name))
      + "？\n当前版本会先自动备份。")) return;
    const message = dialog.querySelector(".pkc-recovery-msg");
    button.disabled = true;
    message.textContent = "正在恢复…";
    try {
      const current = await fetchJson("/api/store/" + key, { cache: "no-store" });
      const baseRev = current.response.headers.get("X-PKC-Rev") || "";
      await fetchJson("/api/store/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, name: version.name, baseRev }),
      });
      if (key === "context") {
        const ctx = await fetchJson("/api/competition/context", { cache: "no-store" });
        await fetchJson("/api/competition/context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context: ctx.result.context, revision: ctx.result.revision }),
        });
      }
      versionsCache.delete(key);
      message.textContent = "已恢复，正在刷新页面…";
      setTimeout(() => location.reload(), 600);
    } catch (error) {
      message.textContent = "恢复失败：" + error.message;
      button.disabled = false;
    }
  }

  async function loadAudit() {
    if (!dialog) return;
    const host = dialog.querySelector(".pkc-audit-items");
    try {
      const { result } = await fetchJson("/api/store/audit?limit=40", { cache: "no-store" });
      const entries = result.entries || [];
      host.replaceChildren();
      if (!entries.length) {
        const empty = document.createElement("div");
        empty.className = "hint";
        empty.textContent = "还没有恢复、完整导入或清空记录。";
        host.append(empty);
        return;
      }
      entries.forEach((entry) => {
        const row = document.createElement("div");
        row.className = "pkc-audit-item";
        const time = document.createElement("span");
        time.textContent = fmtTime(entry.at);
        const detail = document.createElement("span");
        detail.textContent = entry.detail || entry.action;
        row.append(time, detail);
        host.append(row);
      });
    } catch (error) {
      host.textContent = "操作记录读取失败：" + error.message;
    }
  }

  async function open() {
    ensureDialog();
    await Promise.all([switchKey(activeKey), loadAudit()]);
    dialog.querySelector(".pkc-recovery-close")?.focus();
  }

  async function exportBackup() {
    status("正在整理完整备份…");
    try {
      const payload = await collectBackup();
      downloadJson(payload);
      await audit("export-json", dataSummary(payload.data), "all");
      status("完整备份已导出");
    } catch (error) {
      status("备份导出失败：" + error.message);
    }
  }

  async function handleImportFile(input) {
    const file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    status("正在校验备份…");
    try {
      const payload = JSON.parse(await file.text());
      await importBackup(payload);
    } catch (error) {
      status("备份导入失败：" + error.message);
    }
  }

  function init() {
    document.getElementById("btnDataHistory")?.addEventListener("click", open);
    document.getElementById("btnBackupJson")?.addEventListener("click", exportBackup);
    document.getElementById("fileDataImport")?.addEventListener("change", (event) => handleImportFile(event.target));
  }

  window.PKC_RECOVERY = {
    open,
    audit,
    snapshotBeforeChange,
    exportBackup,
    serialize: collectBackup,
    importPayload: importBackup,
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
