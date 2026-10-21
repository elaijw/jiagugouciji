# 从 assets/oracle-bone.jpg 里把骨片**裁出来**，存成 assets/oracle-slab.jpg。
#
# 为什么要裁：原照片里骨片只占画面 19.5% 的面积（四周全是深灰展柜），
# 想在网页上把骨片显示成 900px 宽，就得把这张图放大到 1800px，
# 结果是像素被浪费在永远看不见的展柜上，骨片本体反而没有更多分辨率。
# 裁完之后 img 元素的尺寸 ≈ 骨片尺寸，放大 1.1 倍就够。
#
# 顺带把裂纹坐标（原本写在原图像素空间）一起换算到新图空间。
#
# 用法：python dev/_crop_slab.py [留白比例]
import sys
from PIL import Image

ROOT = __file__.rsplit('dev', 1)[0]
PAD = float(sys.argv[1]) if len(sys.argv) > 1 else 0.06

# 这些值来自 dev/_slab_outline.py（暖度 15 / 外扩 2）的分割结果，归一化坐标
X0, X1 = 0.205, 0.760
Y0, Y1 = 0.250, 0.797

img = Image.open(ROOT + 'assets/oracle-bone.jpg').convert('RGB')
IW, IH = img.size

bw = (X1 - X0) * IW
bh = (Y1 - Y0) * IH
cx = (X0 + X1) / 2 * IW
cy = (Y0 + Y1) / 2 * IH

# 保持 3:2 —— 首屏所有叠加层都按 3:2 定位，比例一变就全歪
w = bw * (1 + PAD * 2)
h = w * 2 / 3
if h < bh * (1 + PAD * 2):
    h = bh * (1 + PAD * 2)
    w = h * 3 / 2

left = int(round(cx - w / 2))
top = int(round(cy - h / 2))
# 别裁到原图外面（原图下方是浅色台面，露一点没关系；上方是深灰展柜，最好别露）
left = max(0, min(left, IW - int(w)))
top = max(0, min(top, IH - int(h)))
right = left + int(round(w))
bottom = top + int(round(h))

crop = img.crop((left, top, right, bottom))
out = ROOT + 'assets/oracle-slab.jpg'
crop.save(out, quality=92, optimize=True)

NW, NH = crop.size
print(f'原图 {IW}x{IH}')
print(f'裁切框 left={left} top={top} size={NW}x{NH}（偏移 dx={left} dy={top}）')
print(f'新图骨片占比 x[{(X0 * IW - left) / NW:.3f}~{(X1 * IW - left) / NW:.3f}] '
      f'y[{(Y0 * IH - top) / NH:.3f}~{(Y1 * IH - top) / NH:.3f}]')

# ---- 裂纹坐标换算 ----
# 原图空间里的折线，全部偏移到新图空间。以后改裂纹直接改这里的原图坐标。
CRACKS = [
    ('sf-main', 'M760,581 L748,472 L768,430'),
    ('sf-main', 'M760,581 L776,690 L762,792'),
    ('sf-main', 'M760,581 L662,598 L572,576'),
    ('', 'M748,472 L690,434 L638,448'),
    ('', 'M768,430 L822,406'),
    ('', 'M776,690 L858,714 L914,702'),
    ('', 'M662,598 L640,662 L658,714'),
    ('', 'M572,576 L520,552 L484,564'),
    ('', 'M762,792 L700,822 L658,812'),
    ('', 'M858,714 L862,772'),
]


def shift(d):
    parts = d.split(' ')
    res = []
    for i, p in enumerate(parts):
        cmd = p[0]
        x, y = p[1:].split(',')
        res.append(f'{cmd}{int(float(x)) - left},{int(float(y)) - top}')
    return ' '.join(res)


print(f'\nviewBox="0 0 {NW} {NH}"')
print('灼点（新图）', int(760) - left, int(581) - top,
      f'→ --ember-x: {(760 - left) / NW * 100:.2f}%; --ember-y: {(581 - top) / NH * 100:.2f}%')
print('\n--- 裂纹 path（粘进 shell.js 的 SLAB_FIRE）---')
for cls, d in CRACKS:
    print(f'{{{{cls: "{cls}", d: "{shift(d)}"}}}},')
