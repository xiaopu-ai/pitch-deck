"""不开浏览器的自查：只读文件，哪里都能跑（沙盒里也能）。交付前必跑。
查什么：
  1 每一页都有讲稿：要说的话、▸ 要点，一样都不能少
  2 每一页的步骤连着：有第 2 下就得有第 1 下（不然中间那一下画面不变）
  3 页面和样式里引用的图，文件都在；图太大的提醒压一下
  4 还没换掉的占位：todo 图位、〔〕里的占位字
  5 出图生成的图（tools/配图提示词.md 里来源写「出图」的）页面上有没有带「效果预览」角标
  6 写死的小字号（小于 22px）
用法：python3 tools/check.py        有问题退出码是 1，没问题是 0
"""
import re, os, sys, json
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *a: os.path.join(ROOT, *a)
rd = lambda f: open(f, encoding='utf-8').read() if os.path.exists(f) else ''
html = re.sub(r'<!--.*?-->', '', rd(P('index.html')), flags=re.S)      # 注释里的不算
if not html: sys.exit('没找到 index.html')
bad, tip = [], []

# 讲稿
nj = rd(P('assets/notes.js'))
notes = {x['id']: x for x in json.loads(nj[nj.index('['):nj.rindex(']') + 1])} if '[' in nj else {}
if not notes: bad.append('assets/notes.js 是空的：先跑 python3 tools/make_notes.py')
secs = re.findall(r'<section\b([^>]*)>(.*?)</section>', html, re.S)
for k, (attr, body) in enumerate(secs):
    pid = (re.search(r'data-id="([^"]+)"', attr) or [0, f'第 {k + 1} 页'])[1]
    title = (re.search(r'data-title="([^"]*)"', attr) or [0, ''])[1]
    name = f'{pid}「{title}」'
    paras = [t for _, t in notes.get(pid, {}).get('paras', []) if not t.startswith('⚠️')]
    if notes and not [t for t in paras if not t.startswith('▸')]: bad.append(f'{name} 没有要说的话')
    if notes and not [t for t in paras if t.startswith('▸')]: bad.append(f'{name} 没有 ▸ 要点')
    steps = sorted({int(x) for x in re.findall(r'data-s="(\d+)"', body)})
    gaps = [n for n in range(max(steps) + 1) if n not in steps] if steps else []
    if not steps: bad.append(f'{name} 一个 data-s 都没有，这一页会是空的')
    if gaps: bad.append(f'{name} 步骤不连着：缺第 {gaps} 下（只有整页状态变化的那一下要放 <b class="mk" data-s="n">）')
    classes = ' '.join(re.findall(r'class="([^"]*)"', body)).split()
    if 'todo' in classes: tip.append(f'{name} 还有没出的图（todo 图位）')
    seen = re.sub(r'<[^>]+>', '', re.sub(r'<!--.*?-->', '', body, flags=re.S)) + title + ''.join(paras)
    if '〔' in seen or '〕' in seen: tip.append(f'{name} 还有〔〕占位字没换（页面上或讲稿里）')

# 图
css = ''.join(rd(P('assets', f)) for f in sorted(os.listdir(P('assets'))) if f.endswith('.css'))
used = set(re.findall(r'assets/(img/[^\s"\')]+)', html)) | set(re.findall(r'url\(["\']?(img/[^\s"\')]+)', css))
for u in sorted(used):
    f = P('assets', u)
    if not os.path.exists(f):
        if not u.endswith('logo.svg'): bad.append(f'图不在：assets/{u}')
    elif os.path.getsize(f) > 1.2e6: tip.append(f'assets/{u} 有 {os.path.getsize(f) / 1e6:.1f} MB，转成 jpg 或缩到 1920 宽再用')

# 出图的图要带角标
for row in rd(P('tools/配图提示词.md')).splitlines():
    c = [x.strip() for x in row.strip().strip('|').split('|')]
    if len(c) >= 5 and '出图' in c[2] and re.match(r'^[\w.-]+\.(png|jpe?g|webp)$', c[0]):
        for tag in re.findall(r'<[^<>]*assets/img/' + re.escape(c[0]) + r'[^<>]*>', html):
            cls = (re.search(r'class="([^"]*)"', tag) or [0, ''])[1].split()
            if 'gen' not in cls and 'data-tag' not in tag and 'pic' not in cls:
                bad.append(f'{c[0]} 是出图生成的，页面上没带角标：图位加 class="gen"')
        if re.search(r'class="pic"[^>]*' + re.escape(c[0]), html) and 'class="tg"' not in html:
            bad.append(f'{c[0]} 是出图生成的整屏图，那一页要放 <i class="tg">效果预览</i>')

# 小字号
for src, name in ((html, 'index.html'), (rd(P('assets/pages.css')), 'assets/pages.css')):
    small = sorted({float(x) for x in re.findall(r'font(?:-size)?:[^;"}]*?(\d+(?:\.\d+)?)px', src) if float(x) < 22})
    if small: bad.append(f'{name} 里有小于 22px 的字号：{small}')

print(f'{len(secs)} 页；问题 {len(bad)} 个，提醒 {len(tip)} 个')
for x in bad: print('✗', x)
for x in tip: print('·', x)
if not bad and not tip: print('✓ 都过了。这只是文件层面的检查，版面好不好看还要打开看（或跑 tools/states.py 截图）。')
sys.exit(1 if bad else 0)
