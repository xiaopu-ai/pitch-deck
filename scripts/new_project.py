"""建一个新的提案 / 汇报项目。
用法：python3 scripts/new_project.py 目标文件夹 "标题" [--kind visual|report] [--corner "右上角小字"]
  --kind visual   视觉前期提案：开场、命题、调研、色调、调色方案、故事线、铅笔分镜、风格帧、分镜图、音乐、转场、预演、主体、封面、效果预览、下一步（默认）
  --kind report   一般汇报：开场、结论、过程、效果（数字、前后对比）、下一步
目标文件夹不存在会新建；里面已经有 index.html 就停下，不覆盖。
本脚本在哪，技能就在哪：路径都从脚本自己的位置算，不认固定的安装目录。只用 Python 自带的库。"""
import argparse, os, re, shutil, subprocess, sys

SKILL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KINDS = {'visual': 'visual', '视觉提案': 'visual', '提案': 'visual', 'report': 'report', '汇报': 'report'}

ap = argparse.ArgumentParser(description='建一个新的提案 / 汇报项目')
ap.add_argument('dst', help='目标文件夹'); ap.add_argument('title', help='标题')
ap.add_argument('--kind', default='visual', choices=sorted(KINDS), help='骨架：visual 视觉前期提案（默认）/ report 一般汇报')
ap.add_argument('--corner', default=None, help='右上角那行小字（比如「团队名 · 日期」），不写就用标题')
a = ap.parse_args()

dst = os.path.abspath(os.path.expanduser(a.dst)); kind = KINDS[a.kind]
if os.path.exists(os.path.join(dst, 'index.html')):
    sys.exit(f'{dst} 里已经有 index.html，不覆盖。要重来请换个文件夹。')

shutil.copytree(os.path.join(SKILL, 'template'), dst, dirs_exist_ok=True)
shutil.copytree(os.path.join(SKILL, 'engine'), os.path.join(dst, 'assets', 'engine'), dirs_exist_ok=True)
sk = os.path.join(SKILL, 'skeletons', kind)
for f in ('稿子.md', '分拍.txt'):
    shutil.copyfile(os.path.join(sk, f), os.path.join(dst, 'tools', f))

esc = lambda s: s.replace('&', '&amp;').replace('<', '&lt;')
deck_id = re.sub(r'[^\w一-鿿-]+', '-', a.title).strip('-') or 'deck'
rep = {'{{PAGES}}': open(os.path.join(sk, 'pages.html'), encoding='utf-8').read(), '{{TITLE}}': esc(a.title),
       '{{CORNER}}': esc(a.corner if a.corner is not None else a.title), '{{DECK_ID}}': deck_id}
for f in ('index.html', 'AGENTS.md', '进度.md', os.path.join('tools', '风格规范.md')):
    p = os.path.join(dst, f); s = open(p, encoding='utf-8').read()
    for k, v in rep.items(): s = s.replace(k, v)
    open(p, 'w', encoding='utf-8').write(s)
os.makedirs(os.path.join(dst, 'tools', 'out'), exist_ok=True)

r = subprocess.run([sys.executable, os.path.join('tools', 'make_notes.py')], cwd=dst, capture_output=True, text=True)
if r.returncode != 0:
    print('讲稿备注没生成成功，原因：\n' + (r.stdout + r.stderr).strip())

print(f'''建好了：{dst}
  骨架：{'视觉前期提案（16 页）' if kind == 'visual' else '一般汇报（6 页）'}，〔〕里的字和 todo 图位都是占位
  打开看：双击 index.html（鼠标动一下，左下角有工具条；→ 下一步，S 演讲者那一屏，A 批注）
  下一步：把骨架列给用户确认，再一页一页换内容；讲稿写在 tools/稿子.md，改完跑：
    cd "{dst}" && python3 tools/make_notes.py && python3 tools/check.py''')
