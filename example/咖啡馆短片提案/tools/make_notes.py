"""讲稿 → 演讲者那一屏的备注。tools/稿子.md 是唯一的来源，assets/notes.js 由本脚本生成，别手改。

稿子格式：
  # 章节名                    ← 一级标题 = 章节（可选）
  **【屏】这一屏的标题**       ← 每一屏单独一行，前后加粗；要和 index.html 里那一页的 data-title 一字不差
  要说的话，一段一行           ← 口语、短。一段对画面的一下
  ▸ 要点                      ← 手卡：忘词时瞥一眼。跟在哪段话后面，就和那段话一起出现
  > 开头的行是写给自己看的说明，不进备注

页 id 按【屏】出现的顺序编号：P01、P02……
另外两个小文件（按屏标题写，不按编号，改稿后编号变了也不怕）：
  tools/分拍.txt   要说的话每段从第几下开始讲：  屏标题 | 0,1,1,2   （只数要说的话，▸ 不用写）
  tools/待核.txt   要核实的事实：              屏标题 | 说明     （备注顶上显示成 ⚠️ 待核）

用法：python3 tools/make_notes.py
只用 Python 自带的库，哪里都能跑。
"""
import re, json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *a: os.path.join(ROOT, *a)
HTML = 'index.html'
text = open(P('tools/稿子.md'), encoding='utf-8').read()

pages, chap, cur = [], '', None
for line in text.splitlines():
    s = line.strip()
    m = re.match(r'^\*\*【屏】(.+?)\*\*$', s)
    if m:
        cur = {'chapter': chap, 'title': m.group(1).strip(), 'paras': []}; pages.append(cur); continue
    if re.match(r'^# ', s):
        chap = s[2:].strip(); cur = None; continue
    if cur is not None and s and s != '---' and not s.startswith(('#', '>')):
        cur['paras'].append(s)
if not pages: sys.exit('稿子里没找到 **【屏】标题** 行。每一屏要单独一行，写成 **【屏】标题**')

def table(name):
    d, f = {}, P('tools', name)
    if os.path.exists(f):
        for n, line in enumerate(open(f, encoding='utf-8'), 1):
            line = line.strip()
            if not line or line.startswith('#'): continue
            if '|' not in line: sys.exit(f'{name} 第 {n} 行少了「|」：{line}')
            k, v = line.rsplit('|', 1); d[k.strip()] = v.strip()
    return d
PS, CHECK = table('分拍.txt'), table('待核.txt')
titles = [p['title'] for p in pages]
errs = [f'分拍.txt / 待核.txt 里的标题在稿子里找不到：{k}' for k in list(PS) + list(CHECK) if k not in titles]
tips = []

is_cue = lambda t: t.startswith('▸')
half = lambda x: x.replace('（', '(').replace('）', ')')   # 全角括号在备注里显示成黄色提示，待核那行换半角
out = []
for n, p in enumerate(pages, 1):
    pid, said = f'P{n:02d}', [t for t in p['paras'] if not is_cue(t)]
    if p['title'] in PS:
        ps = [int(x) for x in re.split(r'[,，\s]+', PS[p['title']]) if x]
        if len(ps) != len(said):
            errs.append(f'{pid}「{p["title"]}」要说的话有 {len(said)} 段，分拍.txt 写了 {len(ps)} 个数（▸ 要点不用写）')
            ps = (ps + [ps[-1] if ps else 0] * len(said))[:len(said)]
    else:
        ps = [0] * len(said)
    note = [[0, half('⚠️ 待核：' + CHECK[p['title']])]] if p['title'] in CHECK else []
    k, step = 0, (ps[0] if ps else 0)
    for t in p['paras']:                      # ▸ 要点跟着它前面那段话走；写在最前面的跟第一段
        if not is_cue(t): step = ps[k]; k += 1
        note.append([step, t])
    out.append({'id': pid, 'chapter': p['chapter'], 'title': p['title'], 'paras': note})
    if not said: tips.append(f'{pid}「{p["title"]}」没有要说的话')
    if len(said) == len(p['paras']): tips.append(f'{pid}「{p["title"]}」没有 ▸ 要点（手卡）')
    tips += [f'{pid} 这条要点超过 30 个字，手卡要一眼看完：{t[:16]}…' for t in p['paras'] if is_cue(t) and len(t) > 32]
    tips += [f'{pid} 这段话超过 120 个字，拆成两段好讲：{t[:16]}…' for t in said if len(re.sub(r'（[^）]*）', '', t)) > 120]

open(P('assets/notes.js'), 'w', encoding='utf-8').write(
    '/* 自动生成：python3 tools/make_notes.py ← tools/稿子.md。别手改。 */\nwindow.NOTES = '
    + json.dumps(out, ensure_ascii=False, indent=1) + ';\n')
said_n = sum(1 for x in out for _, t in x['paras'] if not is_cue(t) and not t.startswith('⚠️'))
print(f'notes.js：{len(out)} 屏，要说的话 {said_n} 段，要点 {sum(1 for x in out for _, t in x["paras"] if is_cue(t))} 条')

# 顺手核对 index.html：data-id / data-title 要和稿子对得上
H = P(HTML)
if os.path.exists(H):
    h = open(H, encoding='utf-8').read()
    secs = re.findall(r'<section\b[^>]*?data-id="([^"]+)"[^>]*?data-title="([^"]*)"', h)
    want = {x['id']: x['title'] for x in out}
    for i, t in secs:
        if i in want and t != want[i]: errs.append(f'{HTML} 的 {i} 标题是「{t}」，稿子里是「{want[i]}」')
        if i not in want and not re.match(r'^P\d+[a-z]$', i): errs.append(f'{HTML} 里的 {i}「{t}」在稿子里没有对应的屏')
    have = {i for i, _ in secs}
    miss = [i for i in want if i not in have]
    print(f'{HTML}：{len(secs)} 页；稿子里还没做的屏：{len(miss)} 个' + (f'（{miss[0]}…{miss[-1]}）' if miss else ''))
for t in tips: print('提醒 ', t)
for e in errs: print('⚠️ ', e)
sys.exit(1 if errs else 0)
