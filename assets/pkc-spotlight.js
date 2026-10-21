(function () {
  const LANES = ['上单', '打野', '中路', '发育路', '游走'];
  let catalogPromise;
  const imageCache = new Map();
  const drawRevisions = new WeakMap();
  let activeHeroList = null;
  function attachHeroSearch(input, heroes) {
    if (!input || input.dataset.heroSearchAttached === 'true') return;
    input.dataset.heroSearchAttached = 'true';
    input.setAttribute('autocomplete', 'off'); input.setAttribute('aria-autocomplete', 'list');
    const list = document.createElement('div');
    list.setAttribute('role', 'listbox');
    list.style.cssText = 'position:fixed;z-index:99999;display:none;max-height:240px;overflow:auto;background:#fff;border:1px solid #cbd5e1;border-radius:8px;box-shadow:0 12px 30px rgba(15,23,42,.2);padding:4px;font:13px/1.4 Microsoft YaHei,sans-serif;color:#1e293b';
    document.body.append(list);
    let selected = -1;
    const hide = () => { list.style.display = 'none'; if (activeHeroList === list) activeHeroList = null; };
    const place = () => { if (list.style.display === 'none') return; const r = input.getBoundingClientRect(); list.style.left = `${Math.max(6, r.left)}px`; list.style.top = `${r.bottom + 4}px`; list.style.width = `${Math.max(150, r.width)}px`; };
    const choose = (name) => { input.value = name; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); hide(); input.focus(); };
    const render = () => {
      if (activeHeroList && activeHeroList !== list) activeHeroList.style.display = 'none';
      const query = input.value.trim().toLocaleLowerCase();
      const matches = (heroes || []).filter(h => !query || h.name.toLocaleLowerCase().includes(query)).slice(0, 10);
      list.replaceChildren(); selected = -1;
      if (!matches.length) {
        const empty = document.createElement('div'); empty.textContent = heroes?.length ? '没有匹配项，可继续手动输入' : '英雄目录不可用，可继续手动输入';
        empty.style.cssText = 'padding:8px 10px;color:#64748b'; list.append(empty);
      } else matches.forEach((hero, index) => {
        const option = document.createElement('button'); option.type = 'button'; option.setAttribute('role', 'option'); option.textContent = hero.name;
        option.style.cssText = 'display:block;width:100%;border:0;border-radius:5px;background:transparent;padding:7px 9px;text-align:left;color:inherit;cursor:pointer';
        option.addEventListener('mouseenter', () => { selected = index; paintSelection(); });
        option.addEventListener('mousedown', event => event.preventDefault());
        option.addEventListener('click', () => choose(hero.name)); list.append(option);
      });
      list.style.display = 'block'; activeHeroList = list; place();
    };
    const paintSelection = () => Array.from(list.children).forEach((option, i) => { option.style.background = i === selected ? '#e8efff' : 'transparent'; });
    input.addEventListener('input', render); input.addEventListener('focus', render);
    input.addEventListener('keydown', event => {
      if (list.style.display === 'none') return;
      const options = list.querySelectorAll('[role="option"]');
      if (event.key === 'ArrowDown') { event.preventDefault(); selected = Math.min(options.length - 1, selected + 1); paintSelection(); options[selected]?.scrollIntoView({ block: 'nearest' }); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); selected = Math.max(0, selected - 1); paintSelection(); options[selected]?.scrollIntoView({ block: 'nearest' }); }
      else if (event.key === 'Enter' && selected >= 0) { event.preventDefault(); choose(options[selected].textContent); }
      else if (event.key === 'Escape') hide();
    });
    input.addEventListener('blur', () => setTimeout(hide, 120));
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
  }
  function loadHeroCatalog() {
    if (!catalogPromise) catalogPromise = fetch('/api/tencent-heroes', { signal: AbortSignal.timeout(6000) }).then(r => { if (!r.ok) throw new Error('英雄目录不可用'); return r.json(); }).then(d => d.heroes || []).catch(() => { catalogPromise = null; return []; });
    return catalogPromise;
  }
  function loadImage(id) {
    if (imageCache.has(id)) return imageCache.get(id);
    const promise = new Promise(resolve => { const image = new Image(); const timer = setTimeout(() => resolve(null), 6000); image.onload = () => { clearTimeout(timer); resolve(image); }; image.onerror = () => { clearTimeout(timer); resolve(null); }; image.src = '/tencent-hero/' + encodeURIComponent(id); });
    imageCache.set(id, promise); return promise;
  }
  async function draw(canvas, playlist, options = {}) {
    const revision = (drawRevisions.get(canvas) || 0) + 1; drawRevisions.set(canvas, revision);
    const W = 1920, H = 1080; canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const index = Math.max(0, Math.min(4, Number(playlist?.index) || 0));
    const item = playlist?.items?.[index] || {};
    const catalog = await loadHeroCatalog();
    const players = ['blue', 'red'].map(side => {
      const data = item[side] || {};
      const match = catalog.find(h => h.name === String(data.heroName || '').trim());
      return { side, data, id: match?.id || data.heroId };
    });
    const images = await Promise.all(players.map(p => p.id ? loadImage(p.id) : null));
    if (drawRevisions.get(canvas) !== revision) return;
    const bg = ctx.createLinearGradient(0, 0, 1920, 1080); bg.addColorStop(0, '#101b31'); bg.addColorStop(.5, '#25334c'); bg.addColorStop(1, '#121a2b'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(207,169,99,.08)'; for (let x = -300; x < W; x += 150) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 500, 1080); ctx.lineTo(x + 560, 1080); ctx.lineTo(x + 60, 0); ctx.fill(); }
    const glow = ctx.createRadialGradient(960, 490, 30, 960, 490, 560); glow.addColorStop(0, 'rgba(236,196,115,.27)'); glow.addColorStop(1, 'rgba(236,196,115,0)'); ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.fillStyle = '#f4e1b5'; ctx.font = '700 30px Microsoft YaHei'; ctx.fillText('PKC  ·  2026 SEASON', 960, 72);
    ctx.font = '900 58px Microsoft YaHei'; ctx.fillStyle = '#fff5db'; ctx.fillText('2026 PKC 淘汰赛 · 16进8', 960, 157);
    ctx.fillStyle = '#dfc07c'; ctx.fillRect(500, 190, 920, 2);
    ctx.font = '800 32px Microsoft YaHei'; ctx.fillText(item.lane || LANES[index], 960, 247);
    players.forEach((p, i) => {
      const left = i === 0, x = left ? 120 : 1120, w = 680, color = left ? '#68b8ff' : '#ff7a83';
      const panel = ctx.createLinearGradient(x, 280, x + w, 850); panel.addColorStop(0, 'rgba(8,17,31,.88)'); panel.addColorStop(1, 'rgba(16,25,39,.76)');
      ctx.fillStyle = panel; ctx.beginPath(); ctx.roundRect(x, 300, w, 560, 28); ctx.fill(); ctx.strokeStyle = color + '88'; ctx.lineWidth = 2; ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.roundRect(x + 20, 320, w - 40, 410, 18); ctx.clip();
      const img = images[i]; if (img) { const s = Math.max(640 / img.width, 430 / img.height); const dw = img.width * s, dh = img.height * s; ctx.globalAlpha = .92; ctx.drawImage(img, x + (w - dw) / 2, 315 + (430 - dh) / 2, dw, dh); }
      else { ctx.fillStyle = 'rgba(255,255,255,.035)'; ctx.fillRect(x + 20, 320, w - 40, 410); ctx.fillStyle = '#ead9b2'; ctx.font = '700 34px Microsoft YaHei'; ctx.textAlign = 'center'; ctx.fillText(p.data.heroName || '待填写代表英雄', x + w / 2, 545); }
      const shade = ctx.createLinearGradient(0, 540, 0, 735); shade.addColorStop(0, 'rgba(6,10,18,0)'); shade.addColorStop(1, 'rgba(6,10,18,.92)'); ctx.fillStyle = shade; ctx.fillRect(x + 20, 530, w - 40, 200); ctx.restore();
      ctx.textAlign = left ? 'left' : 'right'; ctx.fillStyle = '#fff6df'; ctx.font = '900 52px Microsoft YaHei'; ctx.fillText(p.data.player || '待定选手', left ? x + 54 : x + w - 54, 685);
      ctx.fillStyle = color; ctx.font = '700 26px Microsoft YaHei'; ctx.fillText(p.data.heroName || '代表英雄待填写', left ? x + 56 : x + w - 56, 735);
      ctx.textAlign = left ? 'left' : 'right'; ctx.fillStyle = '#f3deb0'; ctx.font = '800 38px Microsoft YaHei'; ctx.fillText(playlist?.teams?.[p.side]?.name || (left ? '蓝方战队' : '红方战队'), left ? x + 54 : x + w - 54, 820);
    });
    ctx.textAlign = 'center'; ctx.fillStyle = '#f4d78f'; ctx.font = '900 52px Arial'; ctx.fillText('VS', 960, 555);
    ctx.fillStyle = '#dec995'; ctx.font = '600 18px Microsoft YaHei'; ctx.fillText(`${index + 1} / 5   ·   上单  /  打野  /  中路  /  发育路  /  游走`, 960, 950);
    if (options.label) ctx.fillText(options.label, 960, 1010);
  }
  window.PKCSpotlight = { draw, loadHeroCatalog, attachHeroSearch };
})();
