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
      s.classList.toggle('far', Math.abs(k - i) > 2);   // 离当前页远的页：不渲染、动画暂停，省显卡内存（不然后面会出白块）
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
  }
  function go(st, silent) {
    const [ni, nt] = clampState(st[0], st[1]);
    if (ni === i && nt === step) return;
    i = ni; step = nt; apply(silent);
  }

  [i, step] = clampState(q.get('s'), q.get('t'));
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
    peer = window.open(location.pathname + `?presenter=1&s=${i}&t=${step}`, 'td-presenter', 'width=1440,height=900');
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
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = BASE + 'presenter.css';
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
    let [ci, ct] = clampState(q.get('s'), q.get('t'));
    let editing = false, black = false;

    /* 预览：首次加载用 URL，之后只 postMessage，不重载、不闪 */
    function preview(frame, st) {
      if (!frame.dataset.ready) {
        frame.src = `${base}?preview=1&s=${st[0]}&t=${st[1]}`;
        frame.dataset.ready = '1';
        frame.onload = () => frame.contentWindow.postMessage({ af: 1, type: 'state', i: frame._st[0], step: frame._st[1] }, '*');
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
    css.addEventListener('load', fitNotes);
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
