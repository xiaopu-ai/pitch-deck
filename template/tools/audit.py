"""（可选）开浏览器逐页逐下量一遍：小于 22px 的字、出界的字、整组内容偏上 / 太低 / 偏一侧、页面脚本报错。
用法：python3 tools/audit.py [起页 止页]（页从 0 数；不写就查全部） [--wait 秒，默认 2.5] [--file index.html]

要装 playwright 和 Chrome。沙盒里浏览器起不来时只说一句「视觉自查没做」，正常退出（退出码 0），不算出错。"""
import sys, os
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
args = sys.argv[1:]; opt = lambda k, d: args[args.index(k) + 1] if k in args else d
WAIT = float(opt('--wait', 2.5)); F = opt('--file', 'index.html')
nums = [int(a) for a in args if a.isdigit()]
D = 'file://' + os.path.join(R, F)

def skip(why):
    print(f'视觉自查没做：{why}\n不算出错。改成：请用户打开 {F} 自己翻一遍，或者请用户在终端里跑同一行命令。回复里要照实说「没量过」。')
    sys.exit(0)

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    skip('没装 playwright（要用的话：pip3 install playwright）')

JS = """() => { const s=document.querySelector('.slide.active'); const out={id:s.dataset.id,small:[],box:null};
 let T=1e9,B=0,L=1e9,Rr=0;
 const vis=e=>{for(let x=e;x&&x!==s;x=x.parentElement){const c=getComputedStyle(x);if(+c.opacity<.3||c.visibility=='hidden'||c.display=='none')return false}return true};
 s.querySelectorAll('*').forEach(e=>{ if(e.classList.contains('mk'))return; const t=[...e.childNodes].filter(n=>n.nodeType==3&&n.textContent.trim()).map(n=>n.textContent.trim()).join('');
   if(!t||!vis(e))return; const r=e.getBoundingClientRect(); if(r.width<2)return; const fs=parseFloat(getComputedStyle(e).fontSize);
   if(fs<22)out.small.push(fs+'px「'+t.slice(0,12)+'」'); T=Math.min(T,r.top);B=Math.max(B,r.bottom);L=Math.min(L,r.left);Rr=Math.max(Rr,r.right);
   if(r.right>1925||r.left<-5||r.bottom>1085||r.top<-5)out.small.push('出界「'+t.slice(0,12)+'」'); });
 out.box=[Math.round(L),Math.round(T),Math.round(Rr),Math.round(B)]; return out }"""
errs, bad = [], 0
try:
    with sync_playwright() as p:
        br = None
        for kw in ({'channel': 'chrome'}, {}):
            try: br = p.chromium.launch(args=['--allow-file-access-from-files'], **kw); break
            except Exception as e: last = e
        if br is None: skip('浏览器起不来（' + str(last).splitlines()[0][:80] + '），多半是沙盒拦了')
        pg = br.new_page(viewport={'width': 1920, 'height': 1080}); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(D); pg.wait_for_timeout(500); n = pg.evaluate('DECK.n')
        a, b = (nums + [0, n - 1])[:2] if nums else (0, n - 1)
        for i in range(a, min(b, n - 1) + 1):
            pg.goto(D + f'?s={i}&t=0'); pg.wait_for_timeout(300)
            mx = pg.evaluate("Math.max(0,...[...document.querySelector('.slide.active').querySelectorAll('[data-s]')].map(e=>+e.dataset.s))")
            for t in range(mx + 1):
                if t: pg.keyboard.press('ArrowRight')
                pg.wait_for_timeout(int(WAIT * 1000)); o = pg.evaluate(JS); L, T, Rr, B = o['box']
                flag = []
                last_step = t == mx       # 版面平衡只看每页最后一下（中间几下本来就还没出全）
                if last_step and B and B < 560: flag.append(f'偏上(内容底边 {B})')
                if B > 900: flag.append(f'太低(内容底边 {B}，主要内容要在 810 以上)')
                if T < 140 and T < 1e8: flag.append(f'压到顶栏(顶边 {T})')
                if last_step and Rr - L < 900 and abs((L + Rr) / 2 - 960) > 200: flag.append(f'偏一侧({L}–{Rr})')
                issues = flag + sorted(set(o['small']))[:6]
                if issues: bad += 1
                print(f"{i:>3} {o['id']} 第{t}下  {'✓' if not issues else '  '.join(issues)}")
        br.close()
except SystemExit: raise
except Exception as e:
    skip('检查中途断了（' + str(e).splitlines()[0][:80] + '）')
print(f'\n有问题的状态：{bad} 个；页面脚本报错：{errs or "无"}')
