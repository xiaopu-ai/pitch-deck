/* 共用演讲引擎
   观众屏：→ / 空格 / 点击 下一步（步骤走完自动翻页）  ← 上一步   O 全部页面   F 全屏   S 打开演讲者视图   B 黑屏
   三种身份：
     默认           观众屏（投到大屏）
     ?presenter=1   演讲者视图（放在自己电脑上）
     ?preview=1     演讲者视图里的小预览（只显示，不同步、不响应按键）
   同步：postMessage（主窗口 ⇄ 演讲者窗口 ⇄ 预览 iframe）+ BroadcastChannel 兜底，file:// 直接双击也能用 */
(function () {
  // 引擎所在目录（presenter.css 跟 deck.js 放一起）；存储按项目分开，几个 deck 同时开也不串
  const BASE = ((document.currentScript && document.currentScript.src) || '').replace(/[^/]*$/, '');
  const NS = 'td:' + (document.documentElement.dataset.deck || location.pathname) + ':';
  const q = new URLSearchParams(location.search);
  const MODE = q.get('presenter') === '1' ? 'presenter' : q.get('preview') === '1' ? 'preview' : 'audience';
  // 演讲者视图、预览小窗的地址。放在网上时（页面带了内容指纹 data-v）写成 ?v=指纹&presenter=1#s=..&t=..：
  // 带 ?v= 的地址，服务器让浏览器缓存一年；观众屏一打开就先把它取好，之后开演讲者视图不用再连服务器。第几页放在 # 后面，不影响缓存。
  const VER = document.documentElement.dataset.v || '', ONLINE = /^https?:$/.test(location.protocol);
  const hq = new URLSearchParams(location.hash.slice(1)), arg = k => (q.get(k) !== null ? q.get(k) : hq.get(k));
  const modeURL = (mode, st) => location.pathname + (VER && ONLINE ? `?v=${VER}&` : '?') + `${mode}=1` + (st ? `#s=${st[0]}&t=${st[1]}` : '');
  const stage = document.getElementById('stage');
  const slides = [...document.querySelectorAll('.slide')];
  const maxStep = s => Math.max(0, ...[...s.querySelectorAll('[data-s]')].map(e => +e.dataset.s));
  slides.forEach(s => (s._max = maxStep(s)));

  const clampState = (i, t) => {
    i = Math.max(0, Math.min(+i || 0, slides.length - 1));
    return [i, Math.max(0, Math.min(+t || 0, slides[i]._max))];
  };
  const nextState = (i, t) => t < slides[i]._max ? [i, t + 1] : i < slides.length - 1 ? [i + 1, 0] : [i, t];
  const prevState = (i, t) => t > 0 ? [i, t - 1] : i > 0 ? [i - 1, slides[i - 1]._max] : [i, t];

  /* ---------- 跨窗口消息 ---------- */
  let bc = null;
  try { if (MODE !== 'preview') bc = new BroadcastChannel(NS + 'sync'); } catch (e) {}
  let peer = null;                                   // 观众屏持有演讲者窗口；演讲者窗口持有 opener
  function send(msg) {
    msg.from = MODE;
    try { bc && bc.postMessage(msg); } catch (e) {}
    const w = MODE === 'presenter' ? window.opener : peer;
    try { w && !w.closed && w.postMessage(msg, '*'); } catch (e) {}
  }
  function listen(fn) {
    addEventListener('message', e => e.data && e.data.af && fn(e.data));
    if (bc) bc.onmessage = e => e.data && e.data.af && fn(e.data);
  }

  /* ---------- 总览（O 键）：所有页的缩略图，点一下跳过去 ---------- */
  const pad2 = n => String(n).padStart(2, '0');
  function makeOverview(getCur, pick) {
    let box = null, sel = 0, open = false;
    const css = `#ov{position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.94);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
        display:none;flex-direction:column;font-family:-apple-system,"PingFang SC",sans-serif;color:#f5f5f7;cursor:auto}
      #ov.open{display:flex}
      #ov .ov-top{display:flex;justify-content:space-between;align-items:baseline;padding:22px 34px 14px;font-size:20px;font-weight:700}
      #ov .ov-top span{font-size:13px;color:#86868b;font-weight:500}
      #ov .ov-grid{flex:1;overflow-y:auto;padding:6px 34px 40px;display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:22px 18px;align-content:start}
      #ov .ov-t{cursor:pointer}
      #ov .ov-box{position:relative;aspect-ratio:16/9;border-radius:10px;overflow:hidden;background:#000;box-shadow:0 0 0 1px #2c2c2e;transition:box-shadow .2s,transform .2s}
      #ov .ov-t:hover .ov-box{transform:translateY(-3px)}
      #ov .ov-t.sel .ov-box{box-shadow:0 0 0 3px #ff7a1a}
      #ov .ov-t.cur .ov-lab b{color:#ff7a1a}
      #ov .ov-in{position:absolute;left:0;top:0;width:1920px;height:1080px;transform-origin:0 0;pointer-events:none;background:#000;overflow:hidden}
      #ov .ov-in *{transition:none!important;animation:none!important}
      #ov .ov-lab{margin-top:8px;font-size:13px;color:#a1a1a6;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #ov .ov-lab b{color:#f5f5f7;margin-right:6px;font-variant-numeric:tabular-nums}
      #ov .ov-t.ch .ov-lab{color:#ff7a1a}`;
    function build() {
      const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
      box = document.createElement('div'); box.id = 'ov';
      box.innerHTML = `<div class="ov-top">全部页面<span>点一下跳过去 · ←→↑↓ 选择 · Enter 跳转 · O 或 Esc 关闭</span></div><div class="ov-grid"></div>`;
      const grid = box.querySelector('.ov-grid');
      slides.forEach((s, k) => {
        const t = document.createElement('div');
        const id = s.dataset.id || '', title = s.dataset.title || '';
        t.className = 'ov-t' + (/^§|封面/.test(id) ? ' ch' : '');
        t.innerHTML = `<div class="ov-box"><div class="ov-in"></div></div><div class="ov-lab"><b>${pad2(k + 1)}</b>${/^〔/.test(id) ? id + ' ' : ''}${title}</div>`;
        const c = s.cloneNode(true);                       // 克隆这一页，摆成讲完时的样子
        c._sp = s._sp; c.classList.add('active'); c.classList.remove('past', 'far'); c.querySelectorAll('video,canvas').forEach(v => v.remove());
        for (let n = 0; n <= s._max; n++) c.classList.add('st' + n);
        c.querySelectorAll('[data-s]').forEach(e => e.classList.add('on'));
        t.querySelector('.ov-in').appendChild(c);
        try { window.onStep && window.onStep(k, s._max, c); } catch (e) {}
        c.classList.remove('shake');
        t.onclick = ev => { ev.stopPropagation(); close(); pick(k); };
        grid.appendChild(t);
      });
      box.addEventListener('click', e => e.stopPropagation());
      document.body.appendChild(box);
      addEventListener('resize', () => open && scale());
    }
    const items = () => [...box.querySelectorAll('.ov-t')];
    function scale() { items().forEach(t => { const b = t.querySelector('.ov-box'); t.querySelector('.ov-in').style.transform = `scale(${b.clientWidth / 1920})`; }); }
    function mark() {
      items().forEach((t, k) => { t.classList.toggle('sel', k === sel); t.classList.toggle('cur', k === getCur()); });
      const el = items()[sel]; el && el.scrollIntoView({ block: 'nearest' });
    }
    function show() { if (!box) build(); open = true; box.classList.add('open'); sel = getCur(); scale(); mark(); }
    function close() { open = false; box && box.classList.remove('open'); }
    const cols = () => { const it = items(); if (it.length < 2) return 1; const y = it[0].offsetTop; return Math.max(1, it.findIndex(t => t.offsetTop !== y)); };
    addEventListener('keydown', e => {
      if (e.target && (e.target.isContentEditable || /INPUT|TEXTAREA/.test(e.target.tagName))) return;
      if (e.key === 'o' || e.key === 'O') { e.preventDefault(); e.stopImmediatePropagation(); open ? close() : show(); return; }
      if (!open) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const n = slides.length, c = cols();
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') sel = Math.min(n - 1, sel + 1);
      else if (e.key === 'ArrowLeft') sel = Math.max(0, sel - 1);
      else if (e.key === 'ArrowDown') sel = Math.min(n - 1, sel + c);
      else if (e.key === 'ArrowUp') sel = Math.max(0, sel - c);
      else if (e.key === 'Enter' || e.key === ' ') { close(); pick(sel); return; }
      mark();
    }, true);
    return { get open() { return open; } };
  }

  if (MODE === 'presenter') return presenter();

  /* ================= 观众屏 / 预览 ================= */
  let i = 0, step = 0;
  const bar = document.getElementById('bar');
  function fit() {
    const k = Math.min(innerWidth / 1920, innerHeight / 1080);
    stage.style.transform = `translate(-50%,-50%) scale(${k})`;
  }
  addEventListener('resize', fit); fit();
  // 页码：右下角
  const pgno = document.createElement('div');
  pgno.id = 'pgno';
  pgno.style.cssText = 'position:absolute;right:44px;bottom:26px;z-index:70;font:600 22px -apple-system,"PingFang SC",sans-serif;color:#48484a;font-variant-numeric:tabular-nums;letter-spacing:.04em;pointer-events:none';
  stage.appendChild(pgno);

  let lastI = -1;
  function apply(silent) {
    slides.forEach((s, k) => {
      s.classList.toggle('active', k === i);
      s.classList.toggle('past', k < i);
      s.classList.toggle('far', MODE === 'preview' ? k !== i : Math.abs(k - i) > 2);   // 离当前页远的页不渲染，它们的图也就不下载；预览小窗只渲染当前这一页
      // 离开的那页先保留它的 stN（淡出时保持最后的样子），900ms 后再清掉
      if (k === lastI && lastI !== i) return;
      for (let n = 0; n <= 12; n++) s.classList.toggle('st' + n, k === i && n <= step);
    });
    const s = slides[i];
    // 离开的那页：等它淡出后把「已出现」清零，回退进来时从头按顺序播，不会两组叠在一起
    if (lastI !== i && slides[lastI]) { const old = slides[lastI]; setTimeout(() => { if (old === slides[i]) return; old.classList.add('rst'); for (let n = 0; n <= 12; n++) old.classList.remove('st' + n); old.querySelectorAll('[data-s].on').forEach(e => e.classList.remove('on')); void old.offsetWidth; old.classList.remove('rst'); }, 900); }
    lastI = i;
    s.querySelectorAll('[data-s]').forEach(e => e.classList.toggle('on', +e.dataset.s <= step));
    if (bar) bar.innerHTML = slides.map((_, k) => `<i class="${k === i ? 'cur' : ''}"></i>`).join('');
    pgno.textContent = `${pad2(i + 1)} / ${slides.length}`;
    if (window.onStep) window.onStep(i, step, s);
    if (!silent && MODE === 'audience') send({ af: 1, type: 'state', i, step });
    document.documentElement.classList.add('deck-on');      // 标好了，可以渲染了（样式里：没有 deck-on 时一页都不渲染）
  }
  function go(st, silent) {
    const [ni, nt] = clampState(st[0], st[1]);
    if (ni === i && nt === step) return;
    i = ni; step = nt; apply(silent);
  }

  [i, step] = clampState(arg('s'), arg('t'));
  window.DECK = { go: (a, b) => go([a, b]), get i() { return i; }, get step() { return step; }, n: slides.length, meta: k => ({ id: slides[k].dataset.id || '', title: slides[k].dataset.title || '' }) };

  if (MODE === 'preview') {
    document.documentElement.classList.add('is-preview');
    if (bar) bar.style.display = 'none';
    listen(m => m.type === 'state' && go([m.i, m.step], true));
    apply(true);
    return;
  }

  // 黑屏遮罩
  const black = document.createElement('div');
  black.style.cssText = 'position:fixed;inset:0;background:#000;z-index:999;opacity:0;pointer-events:none;transition:opacity .4s';
  document.body.appendChild(black);
  let isBlack = false;
  function setBlack(on, silent) {
    isBlack = on; black.style.opacity = on ? 1 : 0;
    if (!silent) send({ af: 1, type: 'black', on });
  }

  function openPresenter() {
    if (peer && !peer.closed) { peer.focus(); return; }
    warmHold = Date.now() + 5000;
    peer = window.open(modeURL('presenter', [i, step]), 'td-presenter', 'width=1440,height=900');
    if (!peer) alert('浏览器拦截了弹窗。请允许本页弹出窗口，再按 S。');
  }

  listen(m => {
    if (m.type === 'state' && m.from === 'presenter') go([m.i, m.step], true);
    else if (m.type === 'black') setBlack(m.on, true);
    else if (m.type === 'hello') send({ af: 1, type: 'state', i, step, black: isBlack });
  });

  addEventListener('keydown', e => {
    if (['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter'].includes(e.key)) { e.preventDefault(); go(nextState(i, step)); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); go(prevState(i, step)); }
    else if (e.key === 'Home') go([0, 0]);
    else if (e.key === 'f' || e.key === 'F') document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    else if (e.key === 's' || e.key === 'S') openPresenter();
    else if (e.key === 'b' || e.key === 'B' || e.key === '.') setBlack(!isBlack);
  });
  addEventListener('click', e => { if (!e.target.closest('a') && !ov.open) go(nextState(i, step)); });
  const ov = makeOverview(() => i, k => go([k, 0]));
  apply();

  /* 当前要用的图下完以后（load 事件），把后面各页的图一张一张在后台下好。之后翻页、开演讲者视图，图都从缓存里拿。
     一次只下一张，不和眼前要用的东西抢网速。下完发一个 deck:warm 事件，页面自己的脚本可以接着预备别的（比如音乐）。 */
  let warmHold = 0;                                  // 开演讲者视图的那几秒，后台下载先停一停，把网速让出来
  function warm() {
    const urls = [...new Set([...document.querySelectorAll('.slide [style*="url("]')].map(e => (e.getAttribute('style').match(/url\(["']?([^"')]+)/) || [])[1]).filter(Boolean))];
    let k = 0;
    const next = () => {
      if (k >= urls.length) { try { window.dispatchEvent(new Event('deck:warm')); } catch (e) {} return; }
      const im = new Image(); im.onload = im.onerror = () => setTimeout(next, Math.max(20, warmHold - Date.now())); im.src = urls[k++];
    };
    next();
  }
  if (document.readyState === 'complete') setTimeout(warm, 600); else addEventListener('load', () => setTimeout(warm, 600));

  /* 放在网上时：先把演讲者视图和预览小窗的页面取好（地址带指纹，缓存一年）。之后按 S，这两个页面直接从缓存里出来。
     预览小窗是嵌在页面里的窗口，浏览器给它单独记一份缓存，所以用一个看不见的小窗口去取。 */
  if (VER && ONLINE) {
    try { fetch(modeURL('presenter'), { credentials: 'same-origin' }).catch(() => {}); } catch (e) {}
    const pre = () => {
      const f = document.createElement('iframe'); f.tabIndex = -1; f.setAttribute('aria-hidden', 'true');
      f.style.cssText = 'position:fixed;left:-9999px;top:0;width:10px;height:10px;border:0;visibility:hidden';
      f.onload = () => setTimeout(() => f.remove(), 2000); f.src = modeURL('preview', [i, step]); document.body.appendChild(f);
    };
    pre();
  }

  /* ================= 演讲者视图 ================= */
  function presenter() {
    const NOTES = window.NOTES || [];
    const title = document.title;
    const L = slides.map((s, k) => {
      const n = { ...(NOTES.find(x => x.id === s.dataset.id) || { id: '', title: s.dataset.title || ('第 ' + (k + 1) + ' 页'), paras: [] }) };
      const cues = {};
      s.querySelectorAll('[data-s][data-cue]').forEach(e => (cues[e.dataset.s] = cues[e.dataset.s] || e.dataset.cue));
      s.querySelectorAll('[data-s]').forEach(e => {               // 没写提示的步骤：取那一步出现的文字
        const t = (e.textContent || '').replace(/\s+/g, ' ').trim();
        if (!cues[e.dataset.s] && t) cues[e.dataset.s] = t.length > 30 ? t.slice(0, 30) + '…' : t;
      });
      if (s.dataset.pr) {                                          // 一段稿子拆成几页：pr = 这页负责第几段到第几段（从 0 数）
        const [a, b] = s.dataset.pr.split('-').map(Number);
        n.paras = n.paras.slice(a, (isNaN(b) ? a : b) + 1);
      }
      const ps = (s.dataset.ps || '').split(',').filter(x => x !== '').map(Number);
      if (ps.length) n.paras = n.paras.map((p, k) => [ps[Math.min(k, ps.length - 1)], p[1]]);
      const chars = n.paras.reduce((a, p) => a + p[1].replace(/（[^）]*）|\*\*/g, '').length, 0);
      return { ...n, cues, max: s._max, plan: Math.round(chars / 220 * 60) + n.paras.filter(p => /（停/.test(p[1])).length * 3 };
    });
    const PLAN_TOTAL = L.reduce((a, s) => a + s.plan, 0);

    document.title = '演讲者视图 · ' + title;
    document.body.innerHTML = '';
    document.body.className = 'pv-body';
    // 样式直接写在这里（内容和 presenter.css 一样，改了 presenter.css 以后跑 tools/inline_presenter_css.py 更新）：
    // 不用再等一个文件，演讲者视图一出来就是排好版的。
    const css = document.createElement('style');
    css.textContent = /*PV_CSS_BEGIN*/"/* 演讲者视图 · 暗色苹果风。放在笔记本屏上看，字要大、扫一眼就能找到 */\nhtml,body.pv-body{cursor:auto;overflow:hidden;background:#000}\n.pv-body{--nfs:30px;--acc:#2997ff;--ok:#30d158;--warn:#ffd60a;--bad:#ff453a;\n  height:100vh;display:grid;grid-template-rows:auto 1fr auto;gap:14px;padding:16px 20px 10px;color:#f5f5f7;\n  font-family:-apple-system,\"SF Pro Text\",\"PingFang SC\",\"Helvetica Neue\",sans-serif;-webkit-font-smoothing:antialiased}\n.pv-body.is-black{box-shadow:inset 0 0 0 4px var(--bad)}\n\n/* 顶栏 */\n.pv-top{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:20px}\n.pv-deck{font-size:15px;color:#86868b;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.pv-deck span{margin-left:10px;padding:3px 10px;border-radius:99px;background:#1d1d1f;color:#d1d1d6;font-size:12px}\n.pv-where{display:flex;align-items:center;gap:14px;font-size:22px;font-weight:700}\n.pv-where b{font-variant-numeric:tabular-nums;color:#86868b;font-weight:600}\n.pv-where i{display:flex;gap:6px}\n.pv-where s{width:10px;height:10px;border-radius:50%;background:#3a3a3c;text-decoration:none}\n.pv-where s.done{background:#636366}.pv-where s.cur{background:var(--acc);box-shadow:0 0 0 4px rgba(41,151,255,.25)}\n.pv-clock{display:flex;justify-content:flex-end;align-items:center;gap:16px;font-variant-numeric:tabular-nums}\n.pv-clock span{color:#86868b;font-size:18px}\n.pv-clock b{font-size:34px;font-weight:700;letter-spacing:-.01em}\n.pv-clock em{font-style:normal;font-size:15px;font-weight:700;padding:6px 14px;border-radius:99px;background:#1d1d1f;color:#86868b}\n.pv-clock em.ok{background:rgba(48,209,88,.16);color:var(--ok)}\n.pv-clock em.fast{background:rgba(41,151,255,.16);color:var(--acc)}\n.pv-clock em.slow{background:rgba(255,69,58,.18);color:var(--bad)}\n\n/* 主体：左逐字稿，右预览 */\n.pv-main{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(0,1fr);gap:16px;min-height:0}\n.pv-notes,.pv-card{background:#161617;border-radius:22px;display:flex;flex-direction:column;min-height:0}\n.pv-notes{padding:18px 6px 0 30px}\n.pv-lab{display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:600;color:#86868b;letter-spacing:.04em;margin-bottom:12px;padding-right:24px}\n.pv-scroll{position:relative;flex:1;overflow-y:auto;padding:0 24px 45vh 0;scroll-behavior:smooth}\n.pv-scroll::-webkit-scrollbar{width:6px}.pv-scroll::-webkit-scrollbar-thumb{background:#3a3a3c;border-radius:6px}\n.pv-scroll h2{font-size:15px;color:#636366;font-weight:600;margin:4px 0 18px}\n.pv-scroll p{font-size:var(--nfs);line-height:1.62;margin:0 0 .7em;color:#a1a1a6;padding-left:18px;border-left:4px solid transparent;transition:color .35s,border-color .35s,opacity .35s}\n.pv-scroll p.past{color:#48484a}\n.pv-scroll p.now{color:#f5f5f7;border-left-color:var(--acc)}\n.pv-scroll p strong{color:#fff;font-weight:700;background:linear-gradient(transparent 62%,rgba(41,151,255,.38) 0)}\n.pv-scroll p.past strong{color:#636366;background:none}\n.pv-scroll .dir{display:inline-block;font-size:.62em;font-weight:700;color:#000;background:var(--warn);padding:2px 12px;border-radius:99px;vertical-align:.15em;letter-spacing:.04em}\n.pv-scroll p.past .dir{background:#3a3a3c;color:#86868b}\n.pv-scroll p.warn{color:#ff9f0a;font-size:calc(var(--nfs)*.72)}\n.pv-scroll p.edited::after{content:\"已改\";font-size:12px;color:var(--acc);margin-left:10px;vertical-align:middle}\n.pv-scroll p.empty{color:#48484a}\n.is-edit .pv-scroll p{color:#f5f5f7;outline:1px dashed #3a3a3c;outline-offset:6px;border-radius:4px}\n.is-edit .pv-scroll p:focus{outline-color:var(--acc)}\n\n.pv-side{display:grid;grid-template-rows:auto auto 1fr;gap:16px;min-height:0}\n.pv-card{padding:14px 16px 16px}\n.pv-frame{position:relative;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#000;box-shadow:0 0 0 1px #2c2c2e}\n.pv-frame.small{width:72%}\n.pv-frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:none}\n.pv-end{position:absolute;inset:0;display:none;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#86868b}\n.pv-cue{color:#f5f5f7;font-size:15px;letter-spacing:0;text-align:right;max-width:70%}\n.pv-black{display:none;background:var(--bad);color:#fff;padding:2px 10px;border-radius:99px;letter-spacing:0}\n\n.pv-time{justify-content:flex-start}\n.pv-time .pv-lab span:last-child{color:#f5f5f7;font-size:18px;font-variant-numeric:tabular-nums;letter-spacing:0}\n.pv-meter{height:8px;border-radius:9px;background:#2c2c2e;overflow:hidden}\n.pv-meter i{display:block;height:100%;width:0;background:var(--ok);border-radius:9px;transition:width .8s,background .4s}\n.pv-meter i.warn{background:var(--warn)}.pv-meter i.over{background:var(--bad)}\n.pv-btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}\n.pv-btns button{font:600 14px -apple-system,\"PingFang SC\",sans-serif;color:#f5f5f7;background:#2c2c2e;border:0;border-radius:99px;padding:9px 16px;cursor:pointer}\n.pv-btns button:hover{background:#3a3a3c}\n.pv-foot{font-size:12px;color:#48484a;text-align:center}\n/* 整场 100 多分钟：数字更长，别折行 */\n.pv-clock b{font-size:30px;white-space:nowrap}\n.pv-clock em{white-space:nowrap}\n.pv-where{white-space:nowrap;overflow:hidden}\n.pv-side{grid-template-rows:auto auto minmax(0,1fr)}\n.pv-frame.small{width:58%}\n.pv-btns{margin-top:12px}\n.pv-btns button{padding:7px 13px;font-size:13px}\n\n/* 批注 215 / 222：按当前步骤分段呈现，备注原文不变。 */\n.pv-body{--acc:#ff7a1a}\n.pv-scroll{padding-bottom:18px;overflow:hidden}\n.pv-scroll p[hidden]{display:none!important}\n.pv-scroll p{line-height:1.5}\n.pv-scroll p strong{background:linear-gradient(transparent 62%,rgba(255,122,26,.28) 0)}\n.pv-where s.cur{box-shadow:0 0 0 4px rgba(255,122,26,.2)}\n.pv-body.is-edit .pv-scroll,.pv-scroll.notes-overflow{overflow-y:auto}\n.pv-scroll p.gist{color:#8e8e93;font-size:calc(var(--nfs)*.6);line-height:1.45;border-left:3px solid #3a3a3c;padding-left:14px}\n"/*PV_CSS_END*/;
    document.head.appendChild(css);

    const base = location.pathname;
    document.body.innerHTML = `
      <header class="pv-top">
        <div class="pv-deck">${title.replace(/</g, '&lt;')}<span>演讲者视图</span></div>
        <div class="pv-where"><b id="pvPage"></b><span id="pvTitle"></span><i id="pvDots"></i></div>
        <div class="pv-clock"><span id="pvNow"></span><b id="pvTotal">00:00</b><em id="pvPace">未开始</em></div>
      </header>
      <main class="pv-main">
        <section class="pv-notes">
          <div class="pv-lab"><span>讲稿</span><span id="pvEditTip">E 修改 · +/− 字号</span></div>
          <div class="pv-scroll" id="pvScroll"></div>
        </section>
        <aside class="pv-side">
          <div class="pv-card"><div class="pv-lab"><span>观众正在看</span><span id="pvBlackTag" class="pv-black">黑屏中</span></div>
            <div class="pv-frame"><iframe id="fCur" tabindex="-1"></iframe></div></div>
          <div class="pv-card"><div class="pv-lab"><span>下一下</span><span id="pvCue" class="pv-cue"></span></div>
            <div class="pv-frame small"><iframe id="fNext" tabindex="-1"></iframe><div class="pv-end" id="pvEnd">讲完了 🎉</div></div></div>
          <div class="pv-card pv-time">
            <div class="pv-lab"><span>本页用时</span><span id="pvSlideT">0:00 / 建议 0:00</span></div>
            <div class="pv-meter"><i id="pvMeter"></i></div>
            <div class="pv-btns">
              <button id="bStart">▶ 开始计时</button><button id="bReset">↺ 归零</button>
              <button id="bBlack">黑屏 B</button><button id="bExport">导出修改</button>
            </div>
          </div>
        </aside>
      </main>
      <footer class="pv-foot">→ / 空格 下一下　← 上一下　O 全部页面　B 黑屏　E 修改备注　A 写批注　L 批注清单　+/− 字号　P 暂停计时　R 计时归零　Esc 关闭</footer>`;

    const $ = id => document.getElementById(id);
    const fCur = $('fCur'), fNext = $('fNext'), scroll = $('pvScroll');
    let [ci, ct] = clampState(arg('s'), arg('t'));
    let editing = false, black = false;

    /* 预览：首次加载用 URL，之后只 postMessage，不重载、不闪 */
    function preview(frame, st) {
      if (!frame.dataset.ready) {
        frame.dataset.ready = '1';
        frame.onload = () => frame.contentWindow.postMessage({ af: 1, type: 'state', i: frame._st[0], step: frame._st[1] }, '*');
        const url = modeURL('preview', st);
        requestAnimationFrame(() => setTimeout(() => { frame.src = url; }, 30));     // 先让演讲者视图自己画出来，再去加载小窗
      } else {
        try { frame.contentWindow.postMessage({ af: 1, type: 'state', i: st[0], step: st[1] }, '*'); } catch (e) {}
      }
      frame._st = st;
    }

    /* 备注渲染：（…）舞台提示、**…** 重音、⚠️ 待核 */
    const KEY = (k, n) => `${NS}note:${window.NOTES_VERSION ? window.NOTES_VERSION + ':' : ''}${k}:${n}`;
    function fmt(t) {
      return t.replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/（([^）]*)）/g, '<span class="dir">$1</span>');
    }
    function textOf(k, n) {
      let v = null; try { v = localStorage.getItem(KEY(k, n)); } catch (e) {}
      return v !== null ? v : L[k].paras[n][1];
    }
    function renderNotes() {
      const s = L[ci];
      scroll.innerHTML = `<h2>${s.id} ${s.title}</h2>` + s.paras.map((p, n) => {
        const edited = (() => { try { return localStorage.getItem(KEY(ci, n)) !== null; } catch (e) { return false; } })();
        const t = textOf(ci, n);
        return `<p data-n="${n}" data-st="${p[0]}" class="${/^⚠️/.test(t) ? 'warn' : /^▸/.test(t) ? 'gist' : ''} ${edited ? 'edited' : ''}" ${editing ? 'contenteditable="true"' : ''}>${editing ? t.replace(/</g, '&lt;') : fmt(t)}</p>`;
      }).join('') + (s.paras.length ? '' : '<p class="empty">这一页没有备注</p>');
      scroll.querySelectorAll('p[data-n]').forEach(p => p.addEventListener('input', () => {
        try { localStorage.setItem(KEY(ci, +p.dataset.n), p.innerText.trim()); } catch (e) {}
        p.classList.add('edited');
      }));
      mark(true);
    }
    // 每一步只呈现对应的逐字稿；没有新段落的动画步沿用上一段。
    function mark(jump) {
      const rows = [...scroll.querySelectorAll('p[data-st]')];
      const assigned = rows.map(p => +p.dataset.st);
      const eligible = assigned.filter(st => st <= ct);
      const active = eligible.length ? Math.max(...eligible) : Math.min(...assigned);
      rows.forEach(p => {
        const current = +p.dataset.st === active;
        p.hidden = !editing && !current;
        p.classList.toggle('past', editing && +p.dataset.st < ct);
        p.classList.toggle('now', current);
      });
      scroll.scrollTop = 0;
      fitNotes();
    }
    function fitNotes() {
      if (editing) { scroll.style.removeProperty('--nfs'); return; }
      const preferred = +document.body.style.getPropertyValue('--nfs').replace('px', '') || 30;
      let size = preferred;
      scroll.style.setProperty('--nfs', size + 'px');
      // 用实际布局测量，保留完整文字；常规笔记本屏幕无需滚动。
      while (scroll.scrollHeight > scroll.clientHeight + 1 && size > 18) {
        scroll.style.setProperty('--nfs', --size + 'px');
      }
      scroll.classList.toggle('notes-overflow', scroll.scrollHeight > scroll.clientHeight + 1);
    }
    addEventListener('resize', fitNotes);
    document.fonts.ready.then(fitNotes);

    function cueFor(st) {
      if (st[0] === ci && st[1] === ct) return '';
      if (st[0] !== ci) return '翻页 → ' + L[st[0]].id + ' ' + L[st[0]].title;
      return L[ci].cues[st[1]] || ('第 ' + st[1] + ' 步');
    }

    let lastSlide = -1;
    function render(fromPeer) {
      $('pvPage').textContent = `${ci + 1} / ${slides.length}`;
      $('pvTitle').textContent = L[ci].id + ' ' + L[ci].title;
      $('pvDots').innerHTML = Array.from({ length: L[ci].max + 1 }, (_, n) => `<s class="${n < ct ? 'done' : n === ct ? 'cur' : ''}"></s>`).join('');
      preview(fCur, [ci, ct]);
      const nx = nextState(ci, ct), isEnd = nx[0] === ci && nx[1] === ct;
      $('pvEnd').style.display = isEnd ? 'flex' : 'none';
      if (!isEnd) preview(fNext, nx);
      $('pvCue').textContent = isEnd ? '' : cueFor(nx);
      if (ci !== lastSlide) { renderNotes(); lastSlide = ci; slideStart(); } else mark(false);
      if (!fromPeer) send({ af: 1, type: 'state', i: ci, step: ct });
    }
    function go(st, fromPeer) {
      const [a, b] = clampState(st[0], st[1]);
      if (a === ci && b === ct && fromPeer) return;
      if (!running && total === 0 && (a > 0 || b > 0)) startTimer();   // 第一次往前讲，自动开始计时（不管从哪边翻）
      ci = a; ct = b; render(fromPeer);
    }

    window.DECK = { go: (a, b) => go([a, b]), get i() { return ci; }, get step() { return ct; }, n: slides.length, meta: k => ({ id: L[k].id, title: L[k].title }) };

    /* ---------- 计时与节奏 ---------- */
    let running = false, total = 0, perSlide = L.map(() => 0), tick = null;
    const mmss = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    function slideStart() { /* 本页时间累计在 perSlide[ci] 里，回翻也继续累计 */ updTime(); }
    function startTimer() { if (running) return; running = true; $('bStart').textContent = '⏸ 暂停'; tick = setInterval(() => { total++; perSlide[ci]++; updTime(); }, 1000); }
    function pauseTimer() { running = false; clearInterval(tick); $('bStart').textContent = '▶ 继续'; updTime(); }
    function resetTimer() { pauseTimer(); total = 0; perSlide = L.map(() => 0); $('bStart').textContent = '▶ 开始计时'; updTime(); }
    function updTime() {
      $('pvNow').textContent = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      $('pvTotal').textContent = mmss(total).padStart(5, '0') + ' / ' + mmss(PLAN_TOTAL);
      const plan = L[ci].plan, used = perSlide[ci];
      $('pvSlideT').textContent = `${mmss(used)} / 建议 ${mmss(plan)}`;
      const r = plan ? used / plan : 0;
      $('pvMeter').style.width = Math.min(100, r * 100) + '%';
      $('pvMeter').className = r > 1.25 ? 'over' : r > 1 ? 'warn' : '';
      // 进度 = 前面各页的计划 + 本页计划（按已用时间封顶）
      const expect = L.slice(0, ci).reduce((a, s) => a + s.plan, 0) + Math.min(used, plan);
      const d = total - expect, pace = $('pvPace');
      if (!running && total === 0) { pace.textContent = '未开始'; pace.className = ''; }
      else if (Math.abs(d) < 15) { pace.textContent = '节奏刚好'; pace.className = 'ok'; }
      else if (d > 0) { pace.textContent = '慢了 ' + mmss(d); pace.className = 'slow'; }
      else { pace.textContent = '快了 ' + mmss(-d); pace.className = 'fast'; }
    }
    setInterval(updTime, 15000);

    function setBlack(on, fromPeer) {
      black = on; $('pvBlackTag').style.display = on ? 'inline-block' : 'none';
      document.body.classList.toggle('is-black', on);
      if (!fromPeer) send({ af: 1, type: 'black', on });
    }
    function toggleEdit() {
      editing = !editing; document.body.classList.toggle('is-edit', editing);
      $('pvEditTip').textContent = editing ? '修改中 · 自动保存在本机 · 再按 Esc 退出' : 'E 修改 · +/− 字号';
      renderNotes();
    }
    let fs = 30; try { fs = +localStorage.getItem('td-note-fs') || 30; } catch (e) {}
    const setFs = v => { fs = Math.max(18, Math.min(56, v)); document.body.style.setProperty('--nfs', fs + 'px'); fitNotes(); try { localStorage.setItem('td-note-fs', fs); } catch (e) {} };
    setFs(fs);

    function exportNotes() {
      const md = L.map((s, k) => `## ${s.id} ${s.title}\n\n` + s.paras.map((p, n) => textOf(k, n)).join('\n\n')).join('\n\n---\n\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
      a.download = '演讲备注-修改版.md'; a.click();
    }

    $('bStart').onclick = () => running ? pauseTimer() : startTimer();
    $('bReset').onclick = resetTimer;
    $('bBlack').onclick = () => setBlack(!black);
    $('bExport').onclick = exportNotes;

    addEventListener('keydown', e => {
      if (editing) { if (e.key === 'Escape') toggleEdit(); return; }
      if (['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter'].includes(e.key)) { e.preventDefault(); go(nextState(ci, ct)); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); go(prevState(ci, ct)); }
      else if (e.key === 'Home') go([0, 0]);
      else if (e.key === 'b' || e.key === 'B' || e.key === '.') setBlack(!black);
      else if (e.key === 'e' || e.key === 'E') { e.preventDefault(); toggleEdit(); }
      else if (e.key === '=' || e.key === '+') setFs(fs + 2);
      else if (e.key === '-' || e.key === '_') setFs(fs - 2);
      else if (e.key === 'p' || e.key === 'P') running ? pauseTimer() : startTimer();
      else if (e.key === 'r' || e.key === 'R') resetTimer();
      else if (e.key === 'Escape') window.close();
    });

    listen(m => {
      if (m.from === 'presenter') return;
      if (m.type === 'state') { go([m.i, m.step], true); if ('black' in m) setBlack(m.black, true); }
      else if (m.type === 'black') setBlack(m.on, true);
    });
    makeOverview(() => ci, k => go([k, 0]));
    render(true);
    updTime();
    send({ af: 1, type: 'hello' });
  }
})();
