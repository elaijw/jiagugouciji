# -*- coding: utf-8 -*-
"""
选关页"骨板"轮廓 —— 三张玩法卡的外形。

为什么不直接用 slab-shape.js 里那 84 个点（错路都踩过，记在这）：
    那是照 assets/oracle-slab.jpg 一比一描的。它的左边缘长时间停在 x≈0.13、
    左下角还凹到 x≈0.147。卡片要把「编号 / 字形 / 玩法名 / 一句话 / 出处 /
    进入」全塞进去，这两处正好压在正文上，会被切掉半行。
    1) 按点序号混凸包 → 两条折线弧长参数化不同，混出来的点乱飞，形状扭成一团。
    2) 极坐标混凸包 → 能用了，但两肩被拉得不一样宽，左边缘仍收到 0.13。
    3) 圆角矩形 + 按半径调制的噪声 → 放得下字了，可"噪声"不是"破损"，
       边上的小毛刺看起来像渲染 bug，不像骨头。
    4) 把落在磕口圆内的点推到圆周上 → **方向反了**，那是"长出一块"不是"磕掉一块"，
       路径会冲出卡片框（实测 x 跑到 1.004）。

现在的做法 —— **骨板 − 磕口圆**：
    一块圆角矩形骨板，拿几个圆做真正的**布尔减**（shapely）。
    破陶片、断骨边就是这个形状语言：边是直的，缺口是圆的，
    缺口两侧留一点尖。做完再按弧长重采样，用"过中点的二次曲线"连起来 ——
    只写 L 会在拐角看出棱角。

参数全部在 400×640 的卡面坐标里写，最后按 400/640 归一化成 objectBoundingBox。
      内容安全区：x 34~366，y 34~606。磕口最深处不超过 28px，落在安全区外。

用法：
    python dev/_slab_cardpath.py           打印三片路径
    python dev/_slab_cardpath.py --png     输出预览图 _check/cardpath.png
"""
import math
import os
import sys

from shapely.geometry import Polygon, Point
from shapely.ops import unary_union

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

W, H = 400.0, 640.0        # 参考卡面尺寸
M = 8.0                    # 骨板离盒边距离（给投影留位）
R = 18.0                   # 圆角半径
KEEP = 108                 # 输出点数

# 三片各磕各的口子 —— 三片一模一样就不像"三块骨头"，像复制粘贴
# (cx, cy, r)，坐标是 400×640 卡面坐标
BITES = [
    [(392, 4, 36), (-8, 446, 27), (8, 6, 17)],         # 壹：右上缺、左腰崩、左上小磕
    [(403, 632, 38), (2, 2, 21), (403, 300, 14)],      # 贰：右下缺、左上缺、右腰浅口
    [(-10, 618, 35), (391, 20, 28), (168, 2, 14)],     # 叁：左下缺一大块、右上浅口
]


def rounded_rect_poly():
    x0, x1, y0, y1 = M, W - M, M, H - M
    r = R
    # 用 shapely 的 buffer 直接做圆角矩形：负 buffer 再正 buffer
    box = Polygon([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])
    return box.buffer(-r, resolution=24).buffer(r, resolution=24)


def carve(base, bites):
    geo = base
    for cx, cy, cr in bites:
        geo = geo.difference(Point(cx, cy).buffer(cr, resolution=48))
    # 万一磕出碎块，只留最大的一块
    if geo.geom_type == 'MultiPolygon':
        geo = max(geo.geoms, key=lambda g: g.area)
    return geo


def resample(coords, n):
    """按弧长把闭合环均匀重采样成 n 点"""
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
    """过中点的二次曲线：M mid0 Q p1 mid1 Q p2 mid2 … Z"""
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
   字有骨气 · 选关页的三片骨板
   ------------------------------------------------------------
   本文件由 dev/_slab_cardpath.py --write 生成，别手改。
   要改形状，去改那个脚本里的 BITES（磕口圆）和 M / R（边距 / 圆角），
   重跑一次就覆盖本文件。

   三片各磕各的口子：轮廓一模一样的话，并排看不出"三块骨头"，
   只会像同一张卡复制了三遍。

   为什么是"骨板"，而不是首屏那种照照片描下来的轮廓：
   卡片要装下编号、字形、玩法名、一句话、出处、进入，
   而照片轮廓的左边缘长时间停在 x≈0.13、左下角还凹进去一块，
   这两处正好压在正文上，会切掉半行字。
   所以这里用「圆角骨板 − 磕口圆」：边是直的（放得下字），
   缺口是圆的（还是块骨头）。

   坐标是 objectBoundingBox 的 0~1，元素怎么缩放都贴合。
   ============================================================ */
(function (App) {
  'use strict';

  var CARD = [
"""

TAIL = """  ];

  App.slabCardPaths = CARD;

  /* 三条 clipPath 一次塞进文档。
     必须是内联的 —— CSS 的 clip-path 引用**外部** SVG 里的 clipPath 不生效，
     只认同文档内的 fragment。这条踩过，见 slab-shape.js 头注释。 */
  App.slabCardSvg = function () {
    var defs = CARD.map(function (d, i) {
      return '<clipPath id="slabCard' + (i + 1) + '" clipPathUnits="objectBoundingBox">'
        + '<path d="' + d + '"/></clipPath>';
    }).join('');
    return '<svg class="slab-defs" width="0" height="0" aria-hidden="true" focusable="false">'
      + '<defs>' + defs + '</defs></svg>';
  };
})(window.App = window.App || {});
"""



def build(i):
    base = rounded_rect_poly()
    geo = carve(base, BITES[i])
    pts = resample(list(geo.exterior.coords), KEEP)
    return pts


def main():
    base = rounded_rect_poly()
    paths = [to_smooth_path(build(i)) for i in range(len(BITES))]
    for i, p in enumerate(paths):
        print('/* 骨板 %d */ %s' % (i + 1, p))

    if '--write' in sys.argv:
        js = HEADER + ''.join(
            "    '%s'" % p + (',\n' if i < len(paths) - 1 else '\n')
            for i, p in enumerate(paths))
        js += TAIL
        out = os.path.join(ROOT, 'js', 'core', 'slab-card-shape.js')
        open(out, 'w', encoding='utf-8', newline='\n').write(js)
        print('written -> %s  (%d 字节)' % (out, len(js)), file=sys.stderr)

    if '--png' in sys.argv:
        from PIL import Image, ImageDraw
        sc = 1.25
        cw, ch = int(W * sc), int(H * sc)
        sheet = Image.new('RGB', (cw * 3 + 40, ch + 40), (222, 210, 186))
        for i in range(len(BITES)):
            pts = build(i)
            img = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
            d = ImageDraw.Draw(img)
            d.polygon([(p[0] * sc, p[1] * sc) for p in pts],
                      fill=(250, 245, 233, 255), outline=(120, 96, 64, 255))
            d.rectangle([34 * sc, 34 * sc, (W - 34) * sc, (H - 34) * sc],
                        outline=(190, 62, 42, 150))
            sheet.paste(img, (10 + i * (cw + 10), 20), img)
        out = os.path.join(ROOT, '_check', 'cardpath.png')
        os.makedirs(os.path.dirname(out), exist_ok=True)
        sheet.save(out)
        print('preview ->', out, file=sys.stderr)
        # 安全区自检：磕口有没有咬进内容区
        for i in range(len(BITES)):
            g = carve(base, BITES[i])
            x0, y0, x1, y1 = g.bounds
            print('  骨板%d bounds %.1f,%.1f — %.1f,%.1f' % (i + 1, x0, y0, x1, y1))


if __name__ == '__main__':
    main()
