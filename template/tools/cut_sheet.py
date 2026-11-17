"""把一张「几格拼在一起」的分镜总图切成一格一张。出图时让它一张图里画 2×2 四格，比一格一格出更省、风格也更统一。
用法：python3 tools/cut_sheet.py 总图.png 输出前缀 起始编号 [--grid 2x2] [--mode pencil|photo] [--inset 像素] [--boxes 另一张图的.boxes.json]
  --mode pencil  铅笔稿：格子有手画的黑边框，连边框一起切（默认）
  --mode photo   成图：格子之间是白边，把白边切掉
  --boxes        不自己找格子，照另一张图切出来的位置切（成图和铅笔稿要一格对一格时用）
  --inset        每格四边再往里收几个像素
切完会在总图旁边存一份「总图名.boxes.json」，记下每格的位置。
要装 Pillow 和 numpy（pip install pillow numpy）；装不了就让出图工具一格一格地出，不用这个脚本。
例：python3 tools/cut_sheet.py 出图/铅笔_01到04.png assets/img/pencil- 1
    python3 tools/cut_sheet.py 出图/成图_01到04.png assets/img/board- 1 --mode photo --inset 3"""
import sys, json, os
try:
    from PIL import Image
    import numpy as np
except ImportError:
    sys.exit('要先装 Pillow 和 numpy：pip install pillow numpy')
if len(sys.argv) < 4: sys.exit(__doc__)
src, prefix, start = sys.argv[1], sys.argv[2], int(sys.argv[3])
arg = lambda k, d=None: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
C, R = (int(v) for v in arg('--grid', '2x2').lower().split('x'))
mode, ins = arg('--mode', 'pencil'), int(arg('--inset', 0))
im = Image.open(src).convert('RGB'); W, H = im.size

def spans(empty, need):
    """empty：这一列（行）是不是格子之间的空白。返回 need 段不是空白的区间"""
    idx = np.where(~empty)[0]; out = []
    if len(idx) == 0: return out
    s = p = idx[0]
    for i in idx[1:]:
        if i - p > 4: out.append((int(s), int(p))); s = i
        p = i
    out.append((int(s), int(p)))
    out = [x for x in out if x[1] - x[0] > min(W, H) * .08]          # 太窄的不算一格
    return out

if arg('--boxes'):
    b = json.load(open(arg('--boxes'))); sx, sy = W / b['size'][0], H / b['size'][1]
    boxes = [[round(x0 * sx), round(y0 * sy), round(x1 * sx), round(y1 * sy)] for x0, y0, x1, y1 in b['boxes']]
else:
    g = np.asarray(im.convert('L')).astype(int)
    if mode == 'photo':       # 白边：这一列（行）几乎全是白的
        white = g > 244; cols = spans(white.mean(axis=0) > .985, C); rows = spans(white.mean(axis=1) > .985, R)
    else:                     # 铅笔稿：格子之间的纸上没有深色的线；格子里每一列（行）至少会碰到上下（左右）两条边框
        dark = g < 110; cols = spans(dark.mean(axis=0) < .006, C); rows = spans(dark.mean(axis=1) < .006, R)
    if len(cols) != C or len(rows) != R:
        sys.exit(f'想找 {C} 列 {R} 行，实际找到 {len(cols)} 列 {len(rows)} 行。换 --mode 试试，或者照另一张图的位置切（--boxes）。')
    boxes = [[c[0], r[0], c[1] + 1, r[1] + 1] for r in rows for c in cols]
    json.dump(dict(size=[W, H], boxes=boxes), open(os.path.splitext(src)[0] + '.boxes.json', 'w'))
os.makedirs(os.path.dirname(prefix) or '.', exist_ok=True)
for k, (x0, y0, x1, y1) in enumerate(boxes):
    p = im.crop((x0 + ins, y0 + ins, x1 - ins, y1 - ins)); n = f'{prefix}{start + k:02d}.jpg'
    p.save(n, quality=90, optimize=True); print(os.path.basename(n), p.size, round(p.size[0] / p.size[1], 3))
