# -*- coding: utf-8 -*-
"""
骨面纹理 —— 选关页三片骨板、以及后续各处"骨片"当承载体时用。

为什么不用 assets/oracle-slab.jpg 直接铺：
    那是真照片，很好；但它是**主体**用的（首屏要细节、要真实）。
    当卡片底的时候，照片里原本的刻辞、暗角、展柜反光全都会跟卡片上的字打架，
    而且它整体偏亮，压到卡片上以后比纸还白 —— 层次就反了，
    看起来是"白卡片"，不是"纸上的骨头"。
    所以：首屏用真照片，承载文字的骨面用这张**同色系、无具体内容**的纹理。

做法（全部可平铺，环面取样保证边缘无接缝）：
    1. 低频云斑      —— 骨面的不均匀
    2. 纵向条带      —— 骨纹是顺着长轴走的（先横向压缩再拉回来，得到纵向条）
    3. 中频起伏
    4. 褐斑（.patina）—— 十几团软边椭圆
    5. 虫蛀小孔      —— 深色点 + 下沿一道亮边（孔是有厚度的）

刻意**不做逐像素噪点**：那张图压不下去（512² 的 RGB 噪声 PNG 能到 600KB），
而细颗粒这一层由 assets/paper.png 用 multiply 叠上去，
两张图各管一个频段，体积也可控。

用法：
    python dev/_gen_bone.py            生成 assets/bone-surface.png
    python dev/_gen_bone.py --png      额外存一张预览（放大看质感）
"""
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'bone-surface.png')

S = 512
BASE = (248, 240, 221)      # 骨白偏暖
rnd = random.Random(20261020)

# 环面平滑噪声：小图铺 3×3 再取中间那块，缩放后边缘是连上的
def smooth_noise(size, cells, seed_rnd):
    n = cells * 3
    small = Image.new('L', (n, n))
    p = small.load()
    for y in range(n):
        for x in range(n):
            p[x, y] = seed_rnd.randint(0, 255)
    big = small.resize((size * 3, size * 3), Image.BICUBIC)
    return big.crop((size, size, size * 2, size * 2))


def main():
    low = smooth_noise(S, 5, rnd)      # 大团云斑
    mid = smooth_noise(S, 14, rnd)     # 中频起伏
    # 纵向条：把噪声横向压到 1/10、再拉回原尺寸，只剩纵向的条
    band = smooth_noise(S, 10, rnd).resize((S, S // 9), Image.BOX).resize((S, S), Image.BICUBIC)

    lp, mp, bp = low.load(), mid.load(), band.load()
    img = Image.new('RGB', (S, S))
    px = img.load()
    for y in range(S):
        for x in range(S):
            d = (lp[x, y] - 128) * 0.040 + (mp[x, y] - 128) * 0.028 + (bp[x, y] - 128) * 0.020
            # 暗的地方更暖（褐），亮的地方更冷（骨白）—— 这样云斑才有"色"不只是明暗
            r = BASE[0] + d * 1.06
            g = BASE[1] + d * 0.90
            b = BASE[2] + d * 0.62
            px[x, y] = (max(0, min(255, int(r))), max(0, min(255, int(g))), max(0, min(255, int(b))))

    # 褐斑：先画在不透明层上，再模糊，用 alpha 合成
    stain = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(stain)
    for _ in range(22):
        cx, cy = rnd.randrange(S), rnd.randrange(S)
        rx, ry = rnd.randint(14, 62), rnd.randint(20, 96)
        a = rnd.randint(7, 19)
        sd.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(150, 116, 68, a))
        # 环面复制：贴到对边去，平铺时才不会看到半块斑
        for dx in (-S, 0, S):
            for dy in (-S, 0, S):
                if dx or dy:
                    sd.ellipse([cx - rx + dx, cy - ry + dy, cx + rx + dx, cy + ry + dy],
                               fill=(150, 116, 68, a))
    stain = stain.filter(ImageFilter.GaussianBlur(11))
    img = Image.alpha_composite(img.convert('RGBA'), stain)

    # 虫蛀小孔：暗点 + 下沿一点亮，孔才有深度
    pit = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pit)
    for _ in range(70):
        cx, cy = rnd.randrange(S), rnd.randrange(S)
        r = rnd.uniform(0.8, 2.2)
        pd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(96, 74, 46, rnd.randint(70, 130)))
        pd.ellipse([cx - r, cy - r + 1.4, cx + r, cy + r + 1.4], fill=(255, 251, 240, 90))
    img = Image.alpha_composite(img, pit).convert('RGB')

    img.save(OUT, optimize=True)
    print('%s  %dx%d  %.0f KB' % (OUT, S, S, os.path.getsize(OUT) / 1024.0))

    if '--png' in sys.argv:
        prev = os.path.join(ROOT, '_check', 'bone-surface.png')
        os.makedirs(os.path.dirname(prev), exist_ok=True)
        # 2×2 平铺，一眼能看出接缝
        tile = Image.new('RGB', (S * 2, S * 2))
        for dy in range(2):
            for dx in range(2):
                tile.paste(img, (dx * S, dy * S))
        tile.resize((760, 760), Image.LANCZOS).save(prev)
        print('preview ->', prev)


if __name__ == '__main__':
    main()
