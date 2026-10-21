# -*- coding: utf-8 -*-
"""
构件台上的六片小甲骨 —— 每个构件格子的外形。

和 dev/_slab_cardpath.py（选关页三张 400×640 竖卡）同一套算法，
只是把参考尺寸换成近方形的 112×126：构件格是并排六格，
每格装一个字形 + 一个注音，竖卡那种 0.62 的瘦长比例套上去会把字形挤扁。

骨骼要装得下 78px 的字形：内容安全区 x 12~100、y 12~114，
磕口最深处不超过 14px（圆心一律推到盒子外面，磕出来是**宽而浅**的弧，
不是往里挖一个洞 —— 里挖的那种像渲染缺口，不像断骨）。

六片各磕各的口子。一模一样的话并排就是"同一个形状复制六遍"，
一眼就露；而且甲骨本来就找不到两片一样边。

用法：
    python dev/_slab_chippath.py            打印六条路径
    python dev/_slab_chippath.py --write    写 js/core/slab-chip-shape.js
    python dev/_slab_chippath.py --png      预览到 _check/chippath.png
"""
import math
import os
import random
import sys

from shapely.geometry import Polygon, Point

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

W, H = 150.0, 120.0     # 参考片尺寸（实测构件格 151×118，按这个比例写）
M = 4.0                 # 骨片离盒边距离（给投影留位）
R = 6.0                 # 圆角半径 —— 再大就是圆角按钮了
KEEP = 96               # 输出点数

# (cx, cy, r) —— 圆心全在盒子外面，磕出来是宽而浅的一道弧
# 左右两侧可以磕得深（片宽 151，字形只占中间 74，左右余量各 38px）；
# 上下两侧要克制 —— 垂直余量只有 24px，磕过去就啃到字形了。
BITES = [
    [(162, -10, 36), (-6, 60, 20)],                      # 一：右上缺一大角、左腰崩一块
    [(-10, 132, 34), (160, 18, 22)],                     # 二：左下缺一大角、右上浅口
    [(160, 44, 32), (-10, -10, 28)],                     # 三：右腰崩一大块、左上缺角
    [(74, 130, 26), (160, 4, 24)],                       # 四：下沿中段断、右上缺角
    [(160, 64, 30), (50, -8, 18), (-8, 114, 22)],        # 五：右腰崩、上沿小口、左下浅
    [(-12, 132, 34), (158, 128, 30), (160, 40, 20)],     # 六：下沿两角都断，一截断骨
]


def rounded_rect_poly(seed=0):
    """四条边不是直线，是"削出来"的边。

    纯圆角矩形压上磕口，看着还是"一个圆角方块被啃了几口"；
    真骨片的边是削的，会有 1~3px 的起伏。所以先给四个边加一点沿法向的
    正弦扰动（两端收敛到 0，角上不抖），再 buffer 出圆角、平滑拐点。
    amp 2.6 是上限 —— 再大就会啃到中间 74px 的字形活动区。
    """
    x0, x1, y0, y1 = M, W - M, M, H - M
    rnd = random.Random(seed * 97 + 13)
    amp = 2.6
    steps = 5
    pts = []

    def edge(ax, ay, bx, by, nx, ny):
        ph = rnd.random() * 6.283
        for i in range(steps):
            t = i / float(steps)
            k = math.sin(math.pi * t)              # 两端收敛，角上不抖
            off = amp * k * math.sin(t * 6.283 + ph)
            pts.append((ax + (bx - ax) * t + nx * off,
                        ay + (by - ay) * t + ny * off))

    edge(x0, y0, x1, y0, 0, -1)
    edge(x1, y0, x1, y1, 1, 0)
    edge(x1, y1, x0, y1, 0, 1)
    edge(x0, y1, x0, y0, -1, 0)
    box = Polygon(pts)
    return box.buffer(-R, resolution=24).buffer(R, resolution=24)


def carve(base, bites):
    geo = base
    for cx, cy, cr in bites:
        geo = geo.difference(Point(cx, cy).buffer(cr, resolution=48))
    if geo.geom_type == 'MultiPolygon':
        geo = max(geo.geoms, key=lambda g: g.area)
    return geo


def resample(coords, n):
    ring = list(coords)
    if ring[0] == ring[-1]:
        ring = ring[:-1]
    seg = []
    total = 0.0
    for i in range(len(ring)):
        ax, ay = ring[i]
        bx, by = ring[(i + 1) % len(ring)]
        d = math.hypot(bx - ax, by - ay)
        seg.append((ax, ay, d))
        total += d
    out = []
    j = 0
    acc = 0.0
    for k in range(n):
        target = total * k / n
        while j < len(seg) - 1 and acc + seg[j][2] < target:
            acc += seg[j][2]
            j += 1
        ax, ay, d = seg[j]
        t = 0.0 if d == 0 else (target - acc) / d
        bx, by = seg[(j + 1) % len(seg)][:2]
        out.append((ax + (bx - ax) * t, ay + (by - ay) * t))
    return out


def to_smooth_path(pts):
    n = len(pts)
    mid = lambda a, b: ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    m0 = mid(pts[0], pts[1])
    d = ['M%.4f,%.4f' % (m0[0] / W, m0[1] / H)]
    for i in range(1, n + 1):
        p = pts[i % n]
        m = mid(pts[i % n], pts[(i + 1) % n])
        d.append('Q%.4f,%.4f %.4f,%.4f' % (p[0] / W, p[1] / H, m[0] / W, m[1] / H))
    return ''.join(d) + 'Z'


HEADER = """/* ============================================================
   字有骨气 · 构件台的六片小甲骨
   ------------------------------------------------------------
   本文件由 dev/_slab_chippath.py --write 生成，别手改。
   改形状去改那个脚本里的 BITES（磕口圆）和 M / R，重跑一次覆盖本文件。

   为什么构件要各占一片骨，而不是在大骨版上刮出六个浅池：
   甲骨文的常识是"字契在材料上"。材料连续的时候，六个字形与底板之间
   没有任何分界，读起来就是"六个字形飘在板上"，看不出它们是**六件可拿的东西**；
   而一旦给每个字配一片自己的骨，每个格子才成了一件物件 ——
   先看到片，再看到片上的字，这才是"从构件台里拾起一个构件"。

   六片各磕各的口子：并排的六片如果轮廓一致，
   就退回"同一个形状复制六遍"，比不做还假。

   坐标是 objectBoundingBox 的 0~1，元素怎么缩放都贴合。
   ============================================================ */
(function (App) {
  'use strict';

  var CHIP = [
"""

TAIL = """  ];

  App.slabChipPaths = CHIP;

  /* 六条 clipPath 一次塞进文档。
     必须内联 —— CSS 的 clip-path 引用**外部** SVG 里的 clipPath 不生效，
     只认同文档内的 fragment（见 slab-shape.js 头注释）。 */
  App.slabChipSvg = function () {
    var defs = CHIP.map(function (d, i) {
      return '<clipPath id="slabChip' + (i + 1) + '" clipPathUnits="objectBoundingBox">'
        + '<path d="' + d + '"/></clipPath>';
    }).join('');
    return '<svg class="slab-defs" width="0" height="0" aria-hidden="true" focusable="false">'
      + '<defs>' + defs + '</defs></svg>';
  };

  function inject() {
    if (!document.body || document.querySelector('.slab-chip-defs')) { return; }
    var host = document.createElement('div');
    host.className = 'slab-chip-defs';
    host.setAttribute('aria-hidden', 'true');
    host.innerHTML = App.slabChipSvg();
    document.body.appendChild(host);
  }
  if (document.body) { inject(); }
  else if (document) { document.addEventListener('DOMContentLoaded', inject); }
})(window.App = window.App || {});
"""


def build(i):
    return resample(list(carve(rounded_rect_poly(i + 1), BITES[i]).exterior.coords), KEEP)


def main():
    paths = [to_smooth_path(build(i)) for i in range(len(BITES))]
    for i, p in enumerate(paths):
        print('/* 骨片 %d */ %s' % (i + 1, p))

    if '--write' in sys.argv:
        js = HEADER + ''.join(
            "    '%s'" % p + (',\n' if i < len(paths) - 1 else '\n')
            for i, p in enumerate(paths))
        js += TAIL
        out = os.path.join(ROOT, 'js', 'core', 'slab-chip-shape.js')
        open(out, 'w', encoding='utf-8', newline='\n').write(js)
        print('written -> %s  (%d 字节)' % (out, len(js)), file=sys.stderr)

    if '--png' in sys.argv:
        from PIL import Image, ImageDraw
        sc = 1.6
        cw, ch = int(W * sc), int(H * sc)
        sheet = Image.new('RGB', (cw * 3 + 40, ch * 2 + 30), (233, 223, 203))
        for i in range(len(BITES)):
            pts = build(i)
            img = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
            d = ImageDraw.Draw(img)
            d.polygon([(p[0] * sc, p[1] * sc) for p in pts],
                      fill=(248, 241, 222, 255), outline=(120, 96, 64, 255))
            d.rectangle([12 * sc, 12 * sc, (W - 12) * sc, (H - 12) * sc],
                        outline=(190, 62, 42, 120))
            sheet.paste(img, (10 + (i % 3) * (cw + 10), 10 + (i // 3) * (ch + 10)), img)
        out = os.path.join(ROOT, '_check', 'chippath.png')
        os.makedirs(os.path.dirname(out), exist_ok=True)
        sheet.save(out)
        print('preview ->', out, file=sys.stderr)
        for i in range(len(BITES)):
            x0, y0, x1, y1 = carve(rounded_rect_poly(i + 1), BITES[i]).bounds
            print('  骨片%d bounds %.1f,%.1f — %.1f,%.1f (最深 %.1f px)'
                  % (i + 1, x0, y0, x1, y1, max(M - x0, W - M - x1, M - y0, H - M - y1)))


if __name__ == '__main__':
    main()
