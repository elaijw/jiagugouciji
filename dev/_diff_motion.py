# 比两张截图，证明"确实在动"（并说明动在哪些区域）。
# 用法：python dev/_diff_motion.py <a.png> <b.png>
import sys
from PIL import Image, ImageChops
import numpy as np

a = Image.open(sys.argv[1]).convert('RGB')
b = Image.open(sys.argv[2]).convert('RGB')
if a.size != b.size:
    print('尺寸不同', a.size, b.size)
n = min(a.size[0], b.size[0]), min(a.size[1], b.size[1])
a = a.crop((0, 0, *n)); b = b.crop((0, 0, *n))
d = np.abs(np.asarray(a).astype(int) - np.asarray(b).astype(int)).sum(2)
changed = int((d > 6).sum())
print('size', n, 'changed px', changed, 'ratio %.4f%%' % (changed * 100.0 / (n[0] * n[1])))
ys, xs = np.where(d > 6)
if len(xs):
    print('bbox', xs.min(), ys.min(), xs.max(), ys.max())
# 按 8x8 网格报"哪几格在动"，方便判断是不是只有某一块在动
gh, gw = 8, 8
cell = d[: n[1] // gh * gh, : n[0] // gw * gw]
cell = cell.reshape(gh, cell.shape[0] // gh, gw, cell.shape[1] // gw)
grid = (cell > 6).mean(axis=(1, 3)) * 100
for r in range(gh):
    print(' '.join(('%4.1f' % grid[r][c]) for c in range(gw)))
