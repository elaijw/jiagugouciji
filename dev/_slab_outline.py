# 从 assets/oracle-bone.jpg 中分割出骨片轮廓，输出归一化(0~1)多边形。
#
# 判据：骨片**暖亮**（R 明显大于 B）；展柜背景与台面是中性灰（R≈G≈B）。
# 用暖度而不是亮度：照片下部台面也很亮，用亮度会把台面一起并进来。
#
# 用法：python dev/_slab_outline.py [点数] [暖度阈值]
import sys, math
from collections import deque
from PIL import Image

ROOT = __file__.rsplit('dev', 1)[0]
N = int(sys.argv[1]) if len(sys.argv) > 1 else 72
WARM = int(sys.argv[2]) if len(sys.argv) > 2 else 13
# 默认对原片分割；裁切后（dev/_crop_slab.py）可以对 assets/oracle-slab.jpg 再来一遍，
# 这样归一化坐标就是相对裁切图的，直接可用于 objectBoundingBox。
SRC = sys.argv[4] if len(sys.argv) > 4 else 'assets/oracle-bone.jpg'

img = Image.open(ROOT + SRC).convert('RGB')
IW, IH = img.size
W = 240
H = round(W * IH / IW)
small = img.resize((W, H), Image.LANCZOS)
px = list(small.getdata())

# ---- 1. 暖度分割 ----
mask = bytearray(W * H)
for i, (r, g, b) in enumerate(px):
    lum = r * 0.299 + g * 0.587 + b * 0.114
    if (r - b) >= WARM and lum >= 70:
        mask[i] = 1

# ---- 2. 从中心扩散，只留最大连通域 ----
cx, cy = W // 2, H // 2
start = None
for rad in range(max(W, H)):
    for dy in range(-rad, rad + 1):
        for dx in range(-rad, rad + 1):
            x, y = cx + dx, cy + dy
            if 0 <= x < W and 0 <= y < H and mask[y * W + x]:
                start = y * W + x
                break
        if start is not None:
            break
    if start is not None:
        break

if start is None:
    print('中心没落在骨片上，调低暖度阈值')
    sys.exit(1)

seen = bytearray(W * H)
seen[start] = 1
q = deque([start])
filled = 0
while q:
    p = q.popleft()
    filled += 1
    x, y = p % W, p // W
    for dxx, dyy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nx, ny = x + dxx, y + dyy
        if 0 <= nx < W and 0 <= ny < H:
            q2 = ny * W + nx
            if mask[q2] and not seen[q2]:
                seen[q2] = 1
                q.append(q2)

# ---- 3. 膨胀 DILATE 圈：让裁出来的边界比骨片本体大一点 ----
# 为什么必须外扩：骨片边缘是背光的暗影，分割会把它判成背景切掉，
# 结果骨片像被剪刀剪的。外扩后能保留一圈暗边，正好当"骨片的厚度"。
DILATE = int(sys.argv[3]) if len(sys.argv) > 3 else 4
for _ in range(DILATE):
    nxt = bytearray(seen)
    for y in range(H):
        for x in range(W):
            if seen[y * W + x]:
                continue
            for dxx, dyy in ((1, 0), (-1, 0), (0, 1), (0, -1),
                             (1, 1), (1, -1), (-1, 1), (-1, -1)):
                nx, ny = x + dxx, y + dyy
                if 0 <= nx < W and 0 <= ny < H and seen[ny * W + nx]:
                    nxt[y * W + x] = 1
                    break
    seen = nxt

# ---- 4. Moore 邻域边界追踪 ----
sx = sy = -1
for y in range(H):
    row = y * W
    for x in range(W):
        if seen[row + x]:
            sx, sy = x, y
            break
    if sx >= 0:
        break

DIRS = [(1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1)]
contour = []
cxp, cyp, d = sx, sy, 7
for _ in range(W * H * 4):
    contour.append((cxp, cyp))
    found = False
    for k in range(8):
        nd = (d + 6 + k) % 8
        nx, ny = cxp + DIRS[nd][0], cyp + DIRS[nd][1]
        if 0 <= nx < W and 0 <= ny < H and seen[ny * W + nx]:
            cxp, cyp, d = nx, ny, nd
            found = True
            break
    if not found or (cxp == sx and cyp == sy):
        break

# ---- 4. 按弧长均匀重采样 ----
segs = []
total = 0.0
for j in range(len(contour)):
    a = contour[j]
    b = contour[(j + 1) % len(contour)]
    L = math.hypot(b[0] - a[0], b[1] - a[1])
    segs.append((a, b, L))
    total += L

step = total / N
pts = []
si = 0
acc = 0.0
for t in range(N):
    target = t * step
    while si < len(segs) - 1 and acc + segs[si][2] < target:
        acc += segs[si][2]
        si += 1
    a, b, L = segs[si]
    k = (target - acc) / L if L else 0
    pts.append((a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k))

# ---- 5. 轻微平滑，去掉单像素锯齿 ----
sm = []
for i in range(N):
    p0 = pts[(i - 1) % N]
    p1 = pts[i]
    p2 = pts[(i + 1) % N]
    sm.append(((p0[0] + p1[0] * 2 + p2[0]) / 4, (p0[1] + p1[1] * 2 + p2[1]) / 4))

norm = [(x / W, y / H) for x, y in sm]
xs = [p[0] for p in norm]
ys = [p[1] for p in norm]

bx0, bx1 = min(xs), max(xs)
by0, by1 = min(ys), max(ys)


def fmt(v):
    s = f'{v:.4f}'.rstrip('0').rstrip('.')
    return s if s else '0'


# 输出用原图像素坐标，配合 viewBox="0 0 IW IH"，这样无论元素怎么缩放都按比例贴合。
# 0~1 的 norm 乘上原图尺寸即可。
d_px = ' '.join(('M' if i == 0 else 'L') + f'{p[0] * IW:.1f},{p[1] * IH:.1f}'
                for i, p in enumerate(norm)) + ' Z'
d_str = ' '.join(('M' if i == 0 else 'L') + fmt(p[0]) + ',' + fmt(p[1])
                 for i, p in enumerate(norm)) + ' Z'

svg = (
    '<!-- 骨片轮廓遮罩：由 dev/_slab_outline.py 从 assets/oracle-bone.jpg 分割而来。\n'
    '     白色 = 保留骨片，透明 = 剔掉展柜背景。\n'
    '     用法：mask-image: url("../assets/oracle-slab-mask.svg")，元素须保持 3:2。 -->\n'
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {IW} {IH}" '
    'preserveAspectRatio="none">\n'
    f'  <path fill="#fff" d="{d_px}"/>\n'
    '</svg>\n'
)
with open(ROOT + 'assets/oracle-slab-mask.svg', 'w', encoding='utf-8') as f:
    f.write(svg)

print(f'图像 {IW}x{IH}　采样 {W}x{H}　暖度阈值 {WARM}　外扩 {DILATE}px')
print(f'骨片占画面 {filled / (W * H) * 100:.1f}%　原始边界点 {len(contour)}')
print(f'骨片包围盒（归一化） x[{bx0:.3f}~{bx1:.3f}] y[{by0:.3f}~{by1:.3f}]')
print(f'骨片中心（归一化）   ({(bx0 + bx1) / 2:.3f}, {(by0 + by1) / 2:.3f})')
print(f'骨片尺寸占比         {bx1 - bx0:.3f} x {by1 - by0:.3f}')
print('\n已写入 assets/oracle-slab-mask.svg')

# ---- 6. 输出 objectBoundingBox 归一化路径 ----
# 供 js/core/slab-shape.js 使用：CSS 的 clip-path: url(#id) 只认**同文档内**的
# clipPath，所以路径必须内联。这里直接生成可粘贴的 JS 字符串。
ob = ''.join(('M' if i == 0 else 'L') + fmt(p[0]) + ',' + fmt(p[1])
             for i, p in enumerate(norm)) + 'Z'
print('\n--- objectBoundingBox path（粘进 js/core/slab-shape.js）---')
print(ob)
