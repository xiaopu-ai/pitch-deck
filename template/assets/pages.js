/* 页面脚本：每一下翻页时引擎会调 window.onStep(第几页, 第几下, 这页的 section)。
   这里只放所有页都要的东西（亮色页 / 大图页 logo / 标签滑块 / 桂冠）。某一页自己的脚本写在文件末尾，开头注释写清页号。 */
window.onStep = (i, step, s) => {
  if (s.closest('#stage')) {
    const st = document.getElementById('stage'), hero = (s.dataset.hero || '').split(',').includes(String(step));
    st.dataset.theme = s.classList.contains('light') ? 'light' : 'dark';
    st.dataset.logo = hero ? 'bottom' : 'top';
  }
  s.querySelectorAll('.tabs').forEach(t => {            // 标签滑块按实际文字宽度滑过去
    const bs = t.querySelectorAll('b'), b = bs[Math.min(Math.max(step - 1, 0), bs.length - 1)], ind = t.querySelector('i');
    if (!b || !ind) return;
    ind.style.width = b.offsetWidth + 'px'; ind.style.transform = `translateX(${b.offsetLeft}px)`;
  });
};

// 桂冠：两侧叶片沿圆弧从下往上长（每片错 45ms，同一页里第 k 枚再晚 250ms）
document.querySelectorAll('.lr svg').forEach((svg, n) => {
  const box = svg.closest('.lr'), k = [...box.parentElement.querySelectorAll('.lr')].indexOf(box);
  const W = 270, H = 240, cx = W / 2, cy = 112, r = 108, N = 15, NS = 'http://www.w3.org/2000/svg', base = 300;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const t0 = 28, dt = 10, id = 'lrg' + n;
  const P = t => [cx - r * Math.sin(t * Math.PI / 180), cy + r * Math.cos(t * Math.PI / 180)];
  const [sx, sy] = P(t0), [ex, ey] = P(t0 + dt * (N - 1));
  svg.innerHTML = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--lr1)"/><stop offset=".55" style="stop-color:var(--lr2)"/><stop offset="1" style="stop-color:var(--lr3)"/></linearGradient></defs>
    <path class="lf" style="--ld:${base + k * 250}ms" d="M${sx} ${sy}A${r} ${r} 0 0 1 ${ex} ${ey}" fill="none" stroke="url(#${id})" stroke-width="2" stroke-linecap="round"/>
    <path class="lf" style="--ld:${base + k * 250}ms" d="M${W - sx} ${sy}A${r} ${r} 0 0 0 ${W - ex} ${ey}" fill="none" stroke="url(#${id})" stroke-width="2" stroke-linecap="round"/>`;
  for (let j = 0; j < N; j++) {
    const t = t0 + j * dt, [x, y] = P(t), tr = t * Math.PI / 180;
    const dir = Math.atan2(-Math.sin(tr), -Math.cos(tr)) * 180 / Math.PI, size = 1 - j / N * .45;
    for (const side of [-1, 1]) for (const off of [-1, 1]) {
      const ang = dir + off * 52, rad = ang * Math.PI / 180;
      let lx = x + Math.cos(rad) * 13 * size, ly = y + Math.sin(rad) * 13 * size, la = ang;
      if (side > 0) { lx = W - lx; la = 180 - ang; }
      const e = document.createElementNS(NS, 'ellipse');
      e.setAttribute('cx', lx.toFixed(1)); e.setAttribute('cy', ly.toFixed(1));
      e.setAttribute('rx', (16 * size).toFixed(1)); e.setAttribute('ry', (5.4 * size).toFixed(1));
      e.setAttribute('transform', `rotate(${la.toFixed(1)} ${lx.toFixed(1)} ${ly.toFixed(1)})`);
      e.setAttribute('fill', `url(#${id})`);
      const g = document.createElementNS(NS, 'g');      // 动画挂在外层，免得盖掉叶片自己的旋转
      g.setAttribute('class', 'lf'); g.style.setProperty('--ld', (base + k * 250 + j * 45) + 'ms');
      g.appendChild(e); svg.appendChild(g);
    }
  }
});

/* ---------- 各页自己的脚本写在下面（开头注释写页号） ---------- */

/* ====== 能点的东西（观众屏才有；演讲者那一屏和它里面的小预览不加） ======
   约定：带 data-ui 的元素（和它里面的东西）是控件，点它不翻页；别的地方点一下还是「下一步」。
   1 工具条   鼠标一动，左下角出来：上一步、下一步、演讲者视图、全部页面、全屏
   2 点图放大 点任何一个图位（.im）看大图，再点一下收起
   3 试听     <button class="pl" data-ui data-audio="assets/audio/a.mp3"></button>，放在 .cd 卡片里会带进度条（.pg i）
   4 预演     <div class="ply" data-ui data-audio="assets/audio/a.mp3">…<ol class="shots"><li data-len="3.3" data-img="assets/img/sb_01.jpg" data-cam="航拍">这一格拍什么</li>…</ol></div>
              没写 data-audio 也能放，只是没声音。别处想「从第 k 个镜头放起」：给那个元素加 data-ui data-play-from="k"
   换页时声音自动停、大图自动收起。 */
(() => {
  // 预演那一屏先摆上第一格（演讲者那一屏里的小预览也看得到）
  document.querySelectorAll('.ply').forEach(p => { const li = p.querySelector('.shots li'), fr = p.querySelector('.fr'); if (li && fr && li.dataset.img) fr.style.backgroundImage = `url(${li.dataset.img})`; });
  const Q = new URLSearchParams(location.search);
  if (Q.get('presenter') === '1' || Q.get('preview') === '1') return;
  const stage = document.getElementById('stage'); if (!stage) return;
  const pad = n => String(n).padStart(2, '0');
  const players = [], stopAll = except => players.forEach(p => p !== except && p.stop());

  /* 试听 */
  document.querySelectorAll('button[data-audio]').forEach(btn => {
    const au = new Audio(btn.dataset.audio); au.preload = 'none';
    const card = btn.closest('.cd') || btn, bar = card.querySelector('.pg i');
    const me = { stop() { au.pause(); card.classList.remove('playing'); } };
    players.push(me);
    au.addEventListener('timeupdate', () => { if (bar && au.duration) bar.style.width = (au.currentTime / au.duration * 100) + '%'; });
    au.addEventListener('ended', () => { card.classList.remove('playing'); au.currentTime = 0; if (bar) bar.style.width = '0'; });
    btn.addEventListener('click', () => {
      if (!au.paused) return me.stop();
      stopAll(me); au.play().then(() => card.classList.add('playing')).catch(() => {});
    });
  });

  /* 预演：分镜图按每个镜头的长短切，配上音乐（没有音乐就按时钟走） */
  const plays = [];
  document.querySelectorAll('.ply').forEach(ply => {
    const scr = ply.querySelector('.scr'), fr = ply.querySelector('.fr'), strip = ply.querySelector('.strip');
    const items = [...ply.querySelectorAll('.shots li')]; if (!scr || !fr || !items.length) return;
    let t0 = 0; const T = items.map(li => { const o = { a: t0, d: parseFloat(li.dataset.len) || 2, img: li.dataset.img || '', cam: li.dataset.cam || '', mark: 'mark' in li.dataset, name: li.textContent.trim() }; t0 += o.d; return o; });
    const TOTAL = t0, au = ply.dataset.audio ? new Audio(ply.dataset.audio) : null; if (au) au.preload = 'auto';
    const set = (f, v) => ply.querySelectorAll(`[data-f="${f}"]`).forEach(e => e.textContent = v);
    let pos = 0, playing = false, raf = 0, base = 0, cur = -1, head = null, mute = !au;   // mute：没有声音（没写，或者放不出来），按时钟走
    if (strip) {
      T.forEach((s, k) => {
        if (s.img) new Image().src = s.img;
        const e = document.createElement('button'); e.style.flex = `${s.d} 0 0`; e.textContent = pad(k + 1); e.title = s.name; if (s.mark) e.className = 'road';
        e.addEventListener('click', () => play(s.a)); strip.appendChild(e);
      });
      head = document.createElement('i'); head.className = 'head'; strip.appendChild(head);
    }
    set('total', TOTAL.toFixed(1));
    function show(t) {
      let k = T.findIndex(s => t < s.a + s.d); if (k < 0) k = T.length - 1;
      const s = T[k];
      if (k !== cur) {
        cur = k; fr.style.backgroundImage = s.img ? `url(${s.img})` : 'none';
        set('no', pad(k + 1)); set('name', s.name); set('cam', (s.cam ? s.cam + ' · ' : '') + s.d.toFixed(1) + ' 秒');
        if (strip) strip.querySelectorAll('button').forEach((e, j) => e.classList.toggle('on', j === k));
      }
      const p = Math.min(1, Math.max(0, (t - s.a) / s.d));
      fr.style.transform = `scale(${(1.015 + .05 * p).toFixed(4)})`;
      if (head) head.style.left = (Math.min(t, TOTAL) / TOTAL * 100) + '%';
      set('t', Math.min(t, TOTAL).toFixed(1));
    }
    const now = () => !mute ? au.currentTime : (playing ? (performance.now() - base) / 1000 : pos);
    function loop() { const t = now(); show(t); if (t >= TOTAL) return me.stop(); if (playing) raf = requestAnimationFrame(loop); }
    const me = { stop() { pos = Math.min(now(), TOTAL); playing = false; if (au) au.pause(); scr.classList.remove('on'); cancelAnimationFrame(raf); } };
    players.push(me);
    function play(from) {
      if (from != null) pos = from; else if (pos >= TOTAL - .05) pos = 0;
      stopAll(me);
      const go = () => { playing = true; base = performance.now() - pos * 1000; scr.classList.add('on'); cancelAnimationFrame(raf); loop(); };
      if (!mute) { au.currentTime = pos; au.play().then(go).catch(() => { mute = true; go(); }); } else go();
    }
    scr.addEventListener('click', () => playing ? me.stop() : play());
    if (au) au.addEventListener('ended', () => me.stop());
    show(0);
    plays.push({ ply, play, T });
  });
  document.querySelectorAll('[data-play-from]').forEach(el => el.addEventListener('click', () => {
    const p = plays[0]; if (!p || !window.DECK) return;
    const sec = p.ply.closest('.slide'), k = [...document.querySelectorAll('.slide')].indexOf(sec), n = Math.max(1, parseInt(el.dataset.playFrom, 10) || 1);
    if (k >= 0) { DECK.go(k, 0); p.play(p.T[Math.min(n, p.T.length) - 1].a); }
  }));

  /* 点图放大 */
  const lb = document.createElement('div'); lb.id = 'lb'; stage.appendChild(lb);
  const closeLb = () => lb.classList.remove('on');
  stage.addEventListener('click', e => {
    if (lb.classList.contains('on')) { closeLb(); e.stopPropagation(); return; }
    if (e.target.closest('[data-ui]')) { e.stopPropagation(); return; }
    const im = e.target.closest('.im'); if (!im || im.classList.contains('todo')) return;
    const lay = [...im.querySelectorAll('.lay')].reverse().find(x => x.classList.contains('on'));
    const bg = getComputedStyle(lay || im).backgroundImage;
    if (!bg || bg === 'none') return;
    lb.style.backgroundImage = bg; lb.classList.add('on'); e.stopPropagation();
  });
  addEventListener('keydown', e => { if (lb.classList.contains('on')) { closeLb(); if (e.key === 'Escape') e.stopImmediatePropagation(); } }, true);

  /* 换页：声音停掉、大图收起 */
  const old = window.onStep; let last = null;
  window.onStep = (i, step, s) => { if (old) old(i, step, s); if (s !== last) { last = s; stopAll(); closeLb(); } };

  /* 工具条 */
  const tb = document.createElement('div'); tb.id = 'tb';
  tb.innerHTML = '<button data-k="ArrowLeft" title="上一步">←</button><button data-k="ArrowRight" title="下一步">→</button>' +
    '<button data-k="s" class="main">演讲者视图<kbd>S</kbd></button><button data-k="o">全部页面<kbd>O</kbd></button><button data-k="f">全屏<kbd>F</kbd></button>';
  document.body.appendChild(tb);
  tb.addEventListener('click', e => {
    e.stopPropagation(); const k = e.target.closest('button'); if (!k) return;
    dispatchEvent(new KeyboardEvent('keydown', { key: k.dataset.k, bubbles: true }));
  });
  let hideT = 0;
  const wake = ms => { tb.classList.add('on'); clearTimeout(hideT); hideT = setTimeout(() => tb.classList.remove('on'), ms); };
  addEventListener('mousemove', () => wake(3000)); wake(8000);
})();
