# -*- coding: utf-8 -*-
"""
第一关（甲骨识形入门）的"工作骨版"轮廓。

和 dev/_slab_cardpath.py 同一套算法（圆角骨板 − 磕口圆，shapely 布尔减），
只是画幅从竖卡 400×640 换成横版 1000×660：

    选关页那三片是"摆在案上的骨头"，竖着拿；
    进到这一关，是"摊开在案上干活的那一块"，横着放 —— 所以是另一种形状。

第一关原来是一整块近黑面板（#171411），是全站最后一处没跟上骨纸调子的地方。
换成骨版之后，层次改成：
    案面（页面底，纸）→ 骨版（暖一档，有磕口）→ 骨版上刻的/压的东西
只有骨版这一层有投影，所以是"物压在纸上"，不是"三个色块叠着"。

用法：
    python dev/_slab_workpath.py            打印三条路径
    python dev/_slab_workpath.py --write    写入 js/core/slab-work-shape.js
    python dev/_slab_workpath.py --png      输出预览图 _check/workpath.png
"""
import math
import os
import sys

from shapely.geometry import Polygon, Point

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

KEEP = 116      # 输出点数。横版周长更长，比竖卡多几个点才不显棱角
R = 16.0        # 圆角半径（在 1000 宽里很小 —— 大面板圆角一大就变"胶囊"了）

# 三块骨版，各自磕各自的口子。
# 关键约束：磕口最深不能超过 30px，因为面板内边距是 36~42px，
# 再深就会咬到正文（选关页那次踩过：照片轮廓咬掉半行字）。
SPECS = [
    {
        'id': 'slabWork1',      # 上课面板（题面 / 选项 / 小课堂）
        'w': 1000.0, 'h': 660.0,
        # 圆心推到盒子外面、半径放大 —— 这样磕出来是**宽而浅**的一道弧，
        # 不是深而窄的一个洞。深窄的洞在大面板上看像渲染缺口，不像骨头。
        'bites': [(1017, 677, 56), (-17, 677, 56), (1017, 400, 34), (228, -17, 30)],
    },
    {
        'id': 'slabWork2',      # 开课封面（龟宝那张）
        'w': 1000.0, 'h': 560.0,
        'bites': [(1017, 577, 52), (-17, -17, 52), (452, 577, 30)],
    },
    {
        'id': 'slabWork3',      # 讲字 / 结课
        'w': 1000.0, 'h': 540.0,
        'bites': [(1017, 300, 44), (-17, 557, 50), (668, -17, 30), (1017, 6, 34)],
    },
]

M = 4.0     # 骨版离盒边的距离（投影由父级 filter 出，这里只留一丝呼吸）


def rounded_rect(w, h):
    x0, x1, y0, y1 = M, w - M, M, h - M
    box = Polygon([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])
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


def to_smooth_path(pts, w, h):
    """过中点的二次曲线：只写 L 会在拐角看出棱角"""
    n = len(pts)
    mid = lambda a, b: ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    m0 = mid(pts[0], pts[1])
    d = ['M%.4f,%.4f' % (m0[0] / w, m0[1] / h)]
    for i in range(1, n + 1):
        p = pts[i % n]
        m = mid(pts[i % n], pts[(i + 1) % n])
        d.append('Q%.4f,%.4f %.4f,%.4f' % (p[0] / w, p[1] / h, m[0] / w, m[1] / h))
    return ''.join(d) + 'Z'


HEADER = """/* ============================================================
   字有骨气 · 第一关的三块"工作骨版"
   ------------------------------------------------------------
   本文件由 dev/_slab_workpath.py --write 生成，别手改。
   要改形状，去改那个脚本里的 SPECS（磕口圆）和 R（圆角），重跑一次覆盖本文件。

   第一关原来是整块近黑面板，是全站最后一处没跟上骨纸调子的地方。
   这里给它换成骨版：边是直的（放得下字），缺口是圆的（还是块骨头）——
   和选关页那三片同一个形状语言，只是换成横版。

   三条 clipPath **在脚本加载时直接挂到 body 上**，不像选关页那样由页面注入：
   这三块骨版分布在三个不同的渲染分支（封面 / 上课 / 讲字结课），
   每个分支都得记得插一次太容易漏。挂一次，全站可用。

   clip-path 只认同文档内的 fragment（不认外部 SVG 文件），
   所以必须是内联 <svg><defs>。
   ============================================================ */
(function (App, doc) {
  'use strict';

  var SHAPES = [
"""

TAIL = """  ];

  App.slabWorkPaths = SHAPES;

  function inject() {
    if (!doc || !doc.body) { return; }
    if (doc.getElementById(SHAPES[0].id)) { return; }
    var defs = SHAPES.map(function (s) {
      return '<clipPath id="' + s.id + '" clipPathUnits="objectBoundingBox">'
        + '<path d="' + s.d + '"/></clipPath>';
    }).join('');
    var holder = doc.createElement('div');
    holder.className = 'slab-work-defs';
    holder.setAttribute('aria-hidden', 'true');
    holder.innerHTML = '<svg width="0" height="0" focusable="false"><defs>'
      + defs + '</defs></svg>';
    doc.body.appendChild(holder);
  }

  /* 光标还没到 body 就等 DOMContentLoaded（保险起见，正常情况下脚本在 body 末尾，已经有了） */
  if (doc && doc.body) { inject(); }
  else if (doc) { doc.addEventListener('DOMContentLoaded', inject); }

  App.slabWorkSvg = function () {
    return SHAPES.map(function (s) {
      return '<clipPath id="' + s.id + '" clipPathUnits="objectBoundingBox">'
        + '<path d="' + s.d + '"/></clipPath>';
    }).join('');
  };
})(window.App = window.App || {}, document);
"""


def build(spec, i):
    base = rounded_rect(spec['w'], spec['h'])
    geo = carve(base, spec['bites'])
    pts = resample(list(geo.exterior.coords), KEEP)
    return pts, geo


def main():
    paths = []
    for i, spec in enumerate(SPECS):
        pts, geo = build(spec, i)
        paths.append(to_smooth_path(pts, spec['w'], spec['h']))
        x0, y0, x1, y1 = geo.bounds
        print('%s  bounds %.1f,%.1f — %.1f,%.1f  (画幅 %.0f×%.0f)'
              % (spec['id'], x0, y0, x1, y1, spec['w'], spec['h']))
        print('   %s' % paths[-1][:90] + ' …')

    if '--write' in sys.argv:
        js = HEADER + ''.join(
            "    { id: '%s', w: %d, h: %d,\n      d: '%s' }"
            % (s['id'], s['w'], s['h'], p) + (',\n' if i < len(paths) - 1 else '\n')
            for i, (s, p) in enumerate(zip(SPECS, paths)))
        js += TAIL
        out = os.path.join(ROOT, 'js', 'core', 'slab-work-shape.js')
        open(out, 'w', encoding='utf-8', newline='\n').write(js)
        print('written -> %s  (%d 字节)' % (out, len(js)), file=sys.stderr)

    if '--png' in sys.argv:
        from PIL import Image, ImageDraw
        sc = 0.62
        sheet = Image.new('RGB', (int(1000 * sc) + 40, 900), (222, 210, 186))
        y = 10
        for spec, p in zip(SPECS, paths):
            cw, ch = int(spec['w'] * sc), int(spec['h'] * sc)
            img = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
            d = ImageDraw.Draw(img)
            pts, geo = build(spec, 0)
            d.polygon([(q[0] * sc, q[1] * sc) for q in pts],
                      fill=(250, 245, 233, 255), outline=(120, 96, 64, 255))
            # 内容安全区（内边距 40）
            d.rectangle([40 * sc, 40 * sc, (spec['w'] - 40) * sc, (spec['h'] - 40) * sc],
                        outline=(190, 62, 42, 160))
            sheet.paste(img, (10, y), img)
            y += ch + 12
        out = os.path.join(ROOT, '_check', 'workpath.png')
        os.makedirs(os.path.dirname(out), exist_ok=True)
        sheet.save(out)
        print('preview ->', out, file=sys.stderr)


if __name__ == '__main__':
    main()
