"""改了 engine/presenter.css 以后跑一遍：把它的内容更新进 engine/deck.js 里那一段。
演讲者视图的样式是写在引擎里的，不单独请求一个文件：这样演讲者视图一打开就是排好版的，网慢的时候也不用等。
用法：python3 scripts/inline_presenter_css.py            更新技能自己的 engine/
      python3 scripts/inline_presenter_css.py 项目文件夹   更新某个项目里的 assets/engine/"""
import os, sys, json
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
eng = os.path.join(sys.argv[1], 'assets', 'engine') if len(sys.argv) > 1 else os.path.join(root, 'engine')
css = open(os.path.join(eng, 'presenter.css'), encoding='utf-8').read()
f = os.path.join(eng, 'deck.js'); s = open(f, encoding='utf-8').read()
a, b = s.index('/*PV_CSS_BEGIN*/'), s.index('/*PV_CSS_END*/')
open(f, 'w', encoding='utf-8').write(s[:a] + '/*PV_CSS_BEGIN*/' + json.dumps(css, ensure_ascii=False) + s[b:])
print('已更新', f)
