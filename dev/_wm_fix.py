# -*- coding: utf-8 -*-
"""去掉生成图角落里的平台水印（白色半透明文字压在纸底上）。

方法：扩散修补（grassfire inpaint），不用模糊均值当背景——
大块粗笔画会把"自身亮度"烘进背景估计里，留下鬼影（已踩过）。

  1. 文字掩码 = 亮度显著高于大半径模糊背景的像素（白色半透明字恒为正差）
  2. 掩码向外膨胀 2px，盖住抗锯齿边
  3. 由外向内逐层扩散：每个待填像素取已确定邻域的均值
  4. 只在文字掩码区回贴从干净纸底取来的高频残差，补回纸纹

用法：
  python dev/_wm_fix.py <源图> <输出前缀>
产出 <前缀>.png（去水印）与 <前缀>-tone.png（纸底拉齐站点骨纸 #efe3c8）。
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

NP_RNG = np.random.default_rng(20261017)

# 水印在画布上的固定角落（右下），可按图微调
ROI = (1300, 876, 1536, 1024)


def _shift_sum(arr2d):
    """8 邻域求和。arr2d: (h,w) 值阵（0/1 掩码可当计数用）。"""
    h, w = arr2d.shape
    s = np.zeros((h, w), dtype=np.float64)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy == 0 and dx == 0:
                continue
            ys = slice(max(dy, 0), h + min(dy, 0))
            yd = slice(max(-dy, 0), h + min(-dy, 0))
            xs = slice(max(dx, 0), w + min(dx, 0))
            xd = slice(max(-dx, 0), w + min(-dx, 0))
            s[yd, xd] += arr2d[ys, xs]
    return s


def strip(src, dst, roi=ROI, sigma=60.0, thresh=3.0, dilate=2):
    im = Image.open(src).convert('RGB')
    box = (max(0, roi[0]), max(0, roi[1]), min(im.width, roi[2]), min(im.height, roi[3]))
    crop = im.crop(box)

    a = np.asarray(crop, dtype=np.float64)
    lum = a @ np.array([0.299, 0.587, 0.114])
    blur = np.asarray(crop.filter(ImageFilter.GaussianBlur(sigma)), dtype=np.float64)
    blur_lum = blur @ np.array([0.299, 0.587, 0.114])

    mask = (lum - blur_lum) > thresh          # 比大范围纸底亮 -> 疑似白字
    for _ in range(dilate):                   # 膨胀盖住抗锯齿边
        mask = (_shift_sum(mask.astype(np.float64)) > 0) | mask

    fill = a.copy()
    todo = mask.copy()
    it = 0
    while todo.any():
        it += 1
        known = (~todo).astype(np.float64)
        cnt = _shift_sum(known)               # 已确定邻居数
        vs = np.stack([_shift_sum(fill[..., ch] * known) for ch in range(3)], axis=-1)
        newly = todo & (cnt > 0)
        fill[newly] = vs[newly] / cnt[newly][..., None]
        todo &= ~newly
        if it > 300:
            break

    # 纸纹移植：从 ROI 左侧取干净纸的高频残差，只贴回文字掩码区
    gw = 110
    gx1 = max(0, box[0] - gw - 10)
    clean = im.crop((gx1, box[1] + 10, gx1 + gw, min(im.height, box[3]) - 10))
    ch, cw = clean.size[1], clean.size[0]
    hf = np.asarray(clean, dtype=np.float64) - \
        np.asarray(clean.filter(ImageFilter.GaussianBlur(4)), dtype=np.float64)
    hf -= hf.mean(axis=(0, 1))               # 去掉供体自身的明暗偏置
    hf = np.clip(hf, -2.6, 2.6)              # 掐掉纤维类的强离群，避免平铺成黑划
    hh, ww = a.shape[:2]
    hf = np.resize(hf, (hh, ww, 3)) * 0.9
    out = fill + np.where(mask[..., None], hf, 0.0)

    im.paste(Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGB'), box[:2])
    im.save(dst)
    print('去水印：%s  掩码 %d px，扩散 %d 层' % (dst, int(mask.sum()), it))
    return im


def match_paper(im, dst, paper=(238, 219, 191), target=(239, 227, 200)):
    """把纸底拉齐到站点骨纸色；以白点为锚做线性压缩，不吹高光。
    注意：paper 应传当前图的实测纸底色（跑一遍 _paper_color()）。"""
    a = np.asarray(im, dtype=np.float64)
    for ch in range(3):
        k = (255.0 - target[ch]) / max(1.0, 255.0 - paper[ch])
        a[..., ch] = 255.0 - (255.0 - a[..., ch]) * k
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGB').save(dst)
    print('校色：%s  纸底 -> #%02X%02X%02X' % (dst, *target))


def paper_color(im, y=(3, 4, 5, 6, 7)):
    """取顶部一条的实测纸底色。"""
    a = np.asarray(im, dtype=np.float64)[list(y), :, :]
    m = a.reshape(-1, 3).mean(axis=0)
    return tuple(int(round(v)) for v in m)


if __name__ == '__main__':
    src, base = sys.argv[1], sys.argv[2]
    im = strip(src, base + '.png')
    match_paper(im, base + '-tone.png', paper=paper_color(im))
