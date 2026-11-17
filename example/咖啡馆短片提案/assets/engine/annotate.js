/* 批注模式：排练时给「当前页 + 当前第几下」记一句修改意见，最后一键导出清单。
   A 写批注（Enter 保存，Shift+Enter 换行，Esc 取消）　L 批注清单（点一条跳过去，× 删除，复制 / 下载 / 清空）
   画框：按 A 后在画面上拖动，框出要改的位置（可画多个；单击放一个默认框；点框删除）。框的坐标按 1920×1080 记，跟着批注一起导出。
   观众屏和演讲者视图都能用，存在本机 localStorage，两边共用同一份。 */
(function () {
  if (new URLSearchParams(location.search).get('preview') === '1' || !window.DECK) return;
  const D = window.DECK, KEY = 'td:' + (document.documentElement.dataset.deck || location.pathname) + ':annotations';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } };
  const save = a => { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) {} };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const stepName = t => t === 0 ? '刚进页' : '第 ' + t + ' 下';
  const where = a => `第 ${a.i + 1} 页 ${a.id}${a.title}`;
  const boxText = a => a.boxes && a.boxes.length ? '〔框：' + a.boxes.map(b => `x${b[0]} y${b[1]} ${b[2]}×${b[3]}`).join('；') + '〕' : '';
  const stage = document.getElementById('stage');
  const canDraw = !!stage && new URLSearchParams(location.search).get('presenter') !== '1';

  const css = document.createElement('style');
  css.textContent = `
  .an-wrap{position:fixed;inset:0;z-index:2000;display:none;align-items:flex-start;justify-content:center;padding-top:9vh;background:rgba(0,0,0,.45);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);font-family:-apple-system,"SF Pro Text","PingFang SC",sans-serif}
  .an-wrap.open{display:flex}
  .an-card{width:min(760px,92vw);max-height:80vh;display:flex;flex-direction:column;background:rgba(28,28,30,.92);border:1px solid rgba(255,255,255,.12);border-radius:22px;box-shadow:0 30px 80px rgba(0,0,0,.6);padding:22px 24px;color:#f5f5f7}
  .an-hd{display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin-bottom:14px}
  .an-hd b{font-size:20px;font-weight:600}
  .an-hd span{font-size:14px;color:#8e8e93}
  .an-where{color:#ff7a1a!important;font-weight:600}
  .an-card textarea{width:100%;min-height:96px;resize:vertical;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:14px 16px;color:#f5f5f7;font:400 19px/1.55 -apple-system,"PingFang SC",sans-serif;outline:none}
  .an-card textarea:focus{border-color:#ff7a1a;box-shadow:0 0 0 3px rgba(255,122,26,.25)}
  .an-tip{margin-top:10px;font-size:13px;color:#8e8e93}
  .an-same{margin-top:12px;font-size:14px;color:#aeaeb2;line-height:1.6}
  .an-same div{padding:2px 0}
  .an-list{overflow:auto;margin:0 -8px;padding:0 8px}
  .an-item{display:flex;gap:12px;align-items:flex-start;padding:12px 12px;border-radius:12px;cursor:pointer}
  .an-item:hover{background:rgba(255,255,255,.06)}
  .an-item .w{flex:0 0 230px;font-size:14px;color:#ff7a1a;font-weight:600;line-height:1.5}
  .an-item .w em{display:block;font-style:normal;color:#8e8e93;font-weight:400}
  .an-item .t{flex:1;font-size:17px;line-height:1.5;white-space:pre-wrap}
  .an-item .x{flex:0 0 auto;border:0;background:none;color:#636366;font-size:20px;cursor:pointer;padding:0 4px}
  .an-item .x:hover{color:#ff453a}
  .an-empty{padding:30px 0;text-align:center;color:#8e8e93;font-size:16px}
  .an-btns{display:flex;gap:10px;margin-top:16px;flex-wrap:wrap}
  .an-btns button{border:0;border-radius:980px;padding:9px 18px;font:500 15px -apple-system,"PingFang SC",sans-serif;cursor:pointer;background:rgba(255,255,255,.1);color:#f5f5f7}
  .an-btns button.pri{background:linear-gradient(135deg,#ff9f0a,#ff7a1a);color:#000}
  .an-btns button.del{margin-left:auto;color:#ff453a}
  .an-toast{position:fixed;left:50%;bottom:6vh;transform:translateX(-50%) translateY(20px);z-index:2001;opacity:0;pointer-events:none;transition:.35s;background:rgba(28,28,30,.92);border:1px solid rgba(255,255,255,.12);color:#f5f5f7;border-radius:980px;padding:10px 22px;font:500 16px -apple-system,"PingFang SC",sans-serif}
  .an-toast.on{opacity:1;transform:translateX(-50%) translateY(0)}
  .an-wrap.draw{background:transparent;-webkit-backdrop-filter:none;backdrop-filter:none;align-items:flex-end;padding:0 0 3vh;cursor:crosshair}
  .an-wrap.draw .an-card{cursor:auto;max-height:42vh}
  .an-hint{position:fixed;left:50%;top:2.4vh;transform:translateX(-50%);z-index:2001;display:none;background:rgba(28,28,30,.88);border:1px solid rgba(255,255,255,.14);color:#f5f5f7;border-radius:980px;padding:8px 20px;font:500 15px -apple-system,"PingFang SC",sans-serif;pointer-events:none}
  .an-wrap.draw ~ .an-hint{display:block}
  .an-boxes{position:absolute;inset:0;z-index:1500;pointer-events:none}
  .an-box{position:absolute;border:5px solid #ff3b30;border-radius:14px;box-shadow:0 0 0 2px rgba(255,255,255,.7),0 0 30px rgba(255,59,48,.4)}
  .an-box::before{content:attr(data-n);position:absolute;left:-18px;top:-18px;width:36px;height:36px;border-radius:50%;background:#ff3b30;color:#fff;font:700 20px/36px -apple-system,sans-serif;text-align:center}
  .an-box.old{border-style:dashed;border-color:rgba(255,159,10,.9);box-shadow:none}
  .an-box.old::before{background:rgba(255,159,10,.9)}
  .an-item .t small{display:block;margin-top:4px;font-size:13px;color:#ff6961}`;
  document.head.appendChild(css);

  const wrap = document.createElement('div');
  wrap.className = 'an-wrap';
  wrap.innerHTML = '<div class="an-card"></div>';
  const card = wrap.firstChild;
  const toastEl = document.createElement('div');
  toastEl.className = 'an-toast';
  const hint = document.createElement('div');
  hint.className = 'an-hint';
  hint.textContent = '在画面上拖动，框出要改的位置 · 单击放一个框 · 点框删除';
  document.body.append(wrap, toastEl, hint);
  const layer = document.createElement('div');
  layer.className = 'an-boxes';
  if (stage) stage.appendChild(layer);
  // 面板里的点击不能触发观众屏的「点一下翻页」；画框时点空白处不关闭
  wrap.addEventListener('click', e => { e.stopPropagation(); if (e.target === wrap && !wrap.classList.contains('draw')) close(); });

  /* ---------- 画框 ---------- */
  let cur = [], drag = null, showTimer = 0;
  const toStage = e => { const r = stage.getBoundingClientRect(); return [Math.round((e.clientX - r.left) / r.width * 1920), Math.round((e.clientY - r.top) / r.height * 1080)]; };
  function paint(olds) {
    layer.innerHTML = (olds || []).map(b => `<div class="an-box old" style="left:${b[0]}px;top:${b[1]}px;width:${b[2]}px;height:${b[3]}px"></div>`).join('')
      + cur.map((b, n) => `<div class="an-box" data-n="${n + 1}" style="left:${b[0]}px;top:${b[1]}px;width:${b[2]}px;height:${b[3]}px"></div>`).join('');
  }
  let olds = [];
  wrap.addEventListener('mousedown', e => {
    if (!wrap.classList.contains('draw') || card.contains(e.target)) return;
    e.preventDefault();                                    // 焦点留在输入框里
    const [x, y] = toStage(e);
    const hit = cur.findIndex(b => x >= b[0] && x <= b[0] + b[2] && y >= b[1] && y <= b[1] + b[3]);
    if (hit > -1) { cur.splice(hit, 1); paint(olds); return; }
    drag = { x, y }; cur.push([x, y, 0, 0]); paint(olds);
  });
  addEventListener('mousemove', e => {
    if (!drag) return;
    const [x, y] = toStage(e), b = cur[cur.length - 1];
    b[0] = Math.min(x, drag.x); b[1] = Math.min(y, drag.y); b[2] = Math.abs(x - drag.x); b[3] = Math.abs(y - drag.y); paint(olds);
  });
  addEventListener('mouseup', () => {
    if (!drag) return;
    const b = cur[cur.length - 1];
    if (b[2] < 14 && b[3] < 14) { b[0] = drag.x - 90; b[1] = drag.y - 60; b[2] = 180; b[3] = 120; }   // 单击 = 默认框
    drag = null; paint(olds);
    const ta = card.querySelector('textarea'); ta && ta.focus();
  });
  function showBoxes(boxes) {                              // 从清单跳过去时，把当时画的框亮出来
    clearTimeout(showTimer); cur = (boxes || []).map(b => b.slice()); paint();
    showTimer = setTimeout(() => { cur = []; paint(); }, 6000);
  }

  let mode = null, at = null, tt = 0;
  function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => toastEl.classList.remove('on'), 1800); }
  function close() { mode = null; wrap.classList.remove('open', 'draw'); if (mode !== 'list') { cur = []; olds = []; paint(); } if (wrap.contains(document.activeElement)) document.activeElement.blur(); }

  /* ---------- A：写一条 ---------- */
  function openWrite() {
    at = { i: D.i, step: D.step, ...D.meta(D.i) };
    const same = load().filter(a => a.i === at.i);
    clearTimeout(showTimer); cur = [];
    olds = [].concat(...same.filter(a => a.step === at.step && a.boxes).map(a => a.boxes)); paint(olds);
    card.innerHTML = `
      <div class="an-hd"><b>批注</b><span><span class="an-where">${esc(where(at))}</span> · ${stepName(at.step)}</span></div>
      <textarea placeholder="这一下要怎么改？比如：三张卡片改成一张一张出"></textarea>
      <div class="an-tip">${canDraw ? '在画面上拖动可以框出位置　·　' : ''}Enter 保存　Shift+Enter 换行　Esc 取消　·　L 看全部批注</div>
      ${same.length ? `<div class="an-same">本页已有：${same.map(a => `<div>· ${stepName(a.step)}：${esc(a.text)}</div>`).join('')}</div>` : ''}`;
    mode = 'write'; wrap.classList.add('open'); if (canDraw) wrap.classList.add('draw');
    const ta = card.querySelector("textarea");
    // 打字时的按键只给输入框，不冒泡到翻页
    ta.addEventListener("keydown", e => {
      e.stopPropagation();
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); commit(); }
    });
    ta.focus();
  }
  function commit() {
    const text = card.querySelector('textarea').value.trim(), boxes = cur.filter(b => b[2] > 0 && b[3] > 0).map(b => b.slice());
    close();
    if (!text && !boxes.length) return;
    const all = load();
    all.push({ ...at, text: text || '（见框）', boxes, ts: Date.now() });
    save(all);
    toast(`已记下${boxes.length ? '（框 ' + boxes.length + ' 处）' : ''} · 共 ${all.length} 条`);
  }

  /* ---------- L：清单 ---------- */
  const sorted = () => load().map((a, k) => ({ ...a, k })).sort((a, b) => a.i - b.i || a.step - b.step || a.ts - b.ts);
  function toText() {
    return sorted().map(a => `${where(a)}：${stepName(a.step)}（?s=${a.i}&t=${a.step}），${a.text.replace(/\n+/g, ' / ')}${boxText(a)}`).join('\n');
  }
  function openList() {
    const all = sorted();
    card.innerHTML = `
      <div class="an-hd"><b>批注清单</b><span>${all.length} 条 · 按页码排序 · 点一条跳过去</span></div>
      <div class="an-list">${all.length ? all.map(a => `
        <div class="an-item" data-i="${a.i}" data-t="${a.step}">
          <div class="w">第 ${a.i + 1} 页 · ${stepName(a.step)}<em>${esc(a.id + a.title)}</em></div>
          <div class="t">${esc(a.text)}${a.boxes && a.boxes.length ? `<small>框了 ${a.boxes.length} 处</small>` : ''}</div>
          <button class="x" data-k="${a.k}" title="删除">×</button>
        </div>`).join('') : '<div class="an-empty">还没有批注。放映时按 A 写一条。</div>'}</div>
      <div class="an-btns">
        <button class="pri" data-act="copy">复制全部</button>
        <button data-act="dl">下载 .md</button>
        <button class="del" data-act="clear">清空</button>
      </div>`;
    mode = 'list'; wrap.classList.add('open');
  }
  card.addEventListener('click', e => {
    if (mode !== 'list') return;
    const x = e.target.closest('.x'), it = e.target.closest('.an-item'), act = e.target.dataset.act;
    if (x) { const all = load(); all.splice(+x.dataset.k, 1); save(all); openList(); }
    else if (it) { const a = load()[+it.querySelector('.x').dataset.k]; close(); D.go(+it.dataset.i, +it.dataset.t); a && a.boxes && a.boxes.length && setTimeout(() => showBoxes(a.boxes), 350); }
    else if (act === 'copy') copy(toText());
    else if (act === 'dl') download();
    else if (act === 'clear' && load().length && confirm('清空全部 ' + load().length + ' 条批注？建议先复制或下载。')) { save([]); openList(); }
  });
  function copy(text) {
    if (!text) return toast('没有批注可复制');
    const done = () => toast('已复制，粘贴给你的 AI 就行');
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('复制失败，请用下载'); }
      ta.remove();
    };
    navigator.clipboard ? navigator.clipboard.writeText(text).then(done, fallback) : fallback();
  }
  function download() {
    const text = toText();
    if (!text) return toast('没有批注可下载');
    const d = new Date(), stamp = `${d.getMonth() + 1}-${d.getDate()}_${d.getHours()}${String(d.getMinutes()).padStart(2, '0')}`;
    const a = document.createElement('a');
    const head = '# 演讲稿批注\n\n> 每条 = 第几页 + 页面 id/标题 + 第几下（括号里是跳到这一下的网址参数）+ 意见。〔框〕是在 1920×1080 画布上框的位置（左上角 x y，宽×高）。\n> 改之前先截这一下对照：python3 tools/states.py "页:第几下:3"（页从 0 数，就是 ?s= 的数）。\n\n';
    a.href = URL.createObjectURL(new Blob([head + text.split('\n').map(l => '- ' + l).join('\n') + '\n'], { type: 'text/markdown' }));
    a.download = `批注_${stamp}.md`; a.click();
  }

  /* 另一个窗口改了批注，清单开着就刷新 */
  addEventListener('storage', e => { if (e.key === KEY && mode === 'list') openList(); });

  /* 面板开着时（焦点不在输入框里）按键只给面板，不翻页 */
  addEventListener('keydown', e => {
    if (mode) {
      if (wrap.contains(e.target)) return;          // 输入框自己处理
      e.stopImmediatePropagation(); e.preventDefault();
      if (e.key === 'Escape' || (mode === 'list' && (e.key === 'l' || e.key === 'L'))) close();
      return;
    }
    const tg = e.target;
    if (e.metaKey || e.ctrlKey || e.altKey || (tg && (tg.isContentEditable || /INPUT|TEXTAREA/.test(tg.tagName)))) return;
    if (e.key === 'a' || e.key === 'A') { e.preventDefault(); e.stopImmediatePropagation(); openWrite(); }
    else if (e.key === 'l' || e.key === 'L') { e.preventDefault(); e.stopImmediatePropagation(); openList(); }
  }, true);
})();
