"""（可选）截指定页、指定第几下的样子，拼成一张联系表，用来看版面。
用法：python3 tools/states.py "0:0:3,0:1:3,2:2:4" [index.html] [宽 640] [输出目录 tools/out]
  每一项 = 页（从 0 数，就是网址里 ?s= 的数）:第几下:等几秒
输出：输出目录/states.png（联系表，蓝线 = 3/4 高度 810px，主要内容要在线以上）和 st_XX.png（每张原图）

要装 playwright、pillow 和 Chrome。很多 AI 工具的沙盒不让起浏览器：起不来时本脚本只说一句「视觉自查没做」，
正常退出（退出码 0），不算出错。这时改成请用户自己打开 index.html 看，或者请用户在终端里跑同一行。"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
if len(sys.argv) < 2: sys.exit(__doc__)
specs = [x.split(':') for x in sys.argv[1].split(',') if x.strip()]
F = sys.argv[2] if len(sys.argv) > 2 else 'index.html'
W = int(sys.argv[3]) if len(sys.argv) > 3 else 640
O = sys.argv[4] if len(sys.argv) > 4 else os.path.join(HERE, 'out')
D = 'file://' + os.path.join(ROOT, F)

def skip(why):
    print(f'视觉自查没做：{why}\n不算出错。改成：请用户打开 {F} 自己翻一遍，或者请用户在终端里跑同一行命令。回复里要照实说「截图没看」。')
    sys.exit(0)

try:
    from playwright.sync_api import sync_playwright
    from PIL import Image, ImageDraw
except ImportError:
    skip('没装 playwright / pillow（要用的话：pip3 install playwright pillow）')

def launch(p):
    last = None
    for kw in ({'channel': 'chrome'}, {}):
        try: return p.chromium.launch(args=['--allow-file-access-from-files'], **kw)
        except Exception as e: last = e
    skip('浏览器起不来（' + str(last).splitlines()[0][:80] + '），多半是沙盒拦了')

os.makedirs(O, exist_ok=True)
shots, errs = [], []
try:
    with sync_playwright() as p:
        b = launch(p); pg = b.new_page(viewport={'width': 1920, 'height': 1080})
        pg.on('pageerror', lambda e: errs.append(str(e)))
        for k, (i, t, w) in enumerate(specs):
            # 先停在前一下等 3 秒（让前面的动画走完），再按一下，看这一下真实的进场过程
            t = int(t)
            pg.goto(D + f'?s={i}&t={max(t - 1, 0)}'); pg.wait_for_timeout(3000 if t else 300)
            if t: pg.keyboard.press('ArrowRight')
            pg.wait_for_timeout(int(float(w) * 1000))
            f = os.path.join(O, f'st_{k:02d}.png'); pg.screenshot(path=f)
            shots.append((f, f'{int(i)}:{t} +{w}s'))
        b.close()
except SystemExit: raise
except Exception as e:
    skip('截图中途断了（' + str(e).splitlines()[0][:80] + '）')
H = W * 9 // 16; cols = 3 if len(shots) > 2 else len(shots); rows = (len(shots) + cols - 1) // cols
c = Image.new('RGB', (cols * (W + 10), rows * (H + 10)), (50, 50, 50))
for j, (f, lab) in enumerate(shots):
    im = Image.open(f).convert('RGB').resize((W, H)); d = ImageDraw.Draw(im)
    d.line([(0, int(H * .75)), (W, int(H * .75))], fill=(0, 90, 255)); d.rectangle([0, 0, 120, 22], fill=(0, 0, 0)); d.text((6, 5), lab, fill=(255, 140, 0))
    c.paste(im, ((j % cols) * (W + 10), (j // cols) * (H + 10)))
c.save(os.path.join(O, 'states.png'))
print(len(shots), '张 →', os.path.join(O, 'states.png'), '；页面报错：', errs or '无')
